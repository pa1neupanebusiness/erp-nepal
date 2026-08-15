const mongoose = require('mongoose');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const { postDaybookEntries } = require('./daybookService');

/**
 * Atomic Posting Engine
 * Wraps journal entry creation + account balance updates in a single transaction.
 * If any part fails, ALL changes are rolled back.
 */
async function postJournalEntryAtomic({
  companyId,
  date,
  reference,
  description,
  lines,
  createdBy,
  fiscalYear,
  fiscalYearId,
  miti,
  irdPayload,
  companyFilter,
  daybook,
}) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const je = await JournalEntry.create([{
      date: date || new Date(),
      reference,
      description,
      lines,
      createdBy,
      company: companyId,
      fiscalYear,
      fiscalYearId: fiscalYearId || undefined,
      miti,
      irdPayload,
    }], { session });

    for (const line of lines) {
      if (line.account) {
        const acc = await Account.findOne({ _id: line.account, ...companyFilter }).session(session).select('type');
        const isCreditNormal = acc && ['liability', 'equity', 'income', 'contra_expense'].includes(acc.type);
        const delta = isCreditNormal ? (line.credit - line.debit) : (line.debit - line.credit);
        await Account.findOneAndUpdate(
          { _id: line.account, ...companyFilter },
          { $inc: { balance: delta } },
          { session }
        );
      }
    }

    if (daybook) {
      await postDaybookEntries({ ...daybook, companyId, journalEntryId: je[0]._id }).catch(err => {
        console.error('Daybook hook error (non-fatal):', err.message);
      });
    }

    await session.commitTransaction();
    return je[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Atomic Stock + Journal Posting
 * Wraps product stock decrement + journal entry + account balances in one transaction.
 */
async function postSaleAtomic({
  saleDoc,
  items,
  saleLines,
  cogsLines,
  companyId,
  createdBy,
  fiscalYear,
  fiscalYearId,
  miti,
  irdPayload,
  companyFilter,
  daybookSale,
  daybookCogs,
  stockUpdates,
}) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const Product = require('../models/Product');
    const InventoryMovement = require('../models/InventoryMovement');

    for (const update of stockUpdates) {
      const product = await Product.findOne({ _id: update.productId, ...companyFilter }).session(session);
      if (!product) throw new Error(`Product not found: ${update.productId}`);
      if (product.stock < update.quantity) throw new Error(`Insufficient stock for ${product.name}`);
      product.stock -= update.quantity;
      await product.save({ session });
      await InventoryMovement.create([{
        product: product._id, type: 'out', quantity: -update.quantity,
        reference: update.reference, note: update.note || 'Sale',
        createdBy, company: companyId,
        date: update.date || undefined, fiscalYearId: fiscalYearId || undefined,
      }], { session });
    }

    const je = await JournalEntry.create([{
      date: saleDoc.invoiceDate || new Date(),
      reference: saleDoc.invoiceNumber || saleDoc.reference || '',
      description: saleLines.description,
      lines: saleLines.lines,
      createdBy,
      company: companyId,
      fiscalYear,
      fiscalYearId: fiscalYearId || undefined,
      miti,
      irdPayload,
    }], { session });

    for (const line of saleLines.lines) {
      if (line.account) {
        const acc = await Account.findOne({ _id: line.account, ...companyFilter }).session(session).select('type');
        const isCreditNormal = acc && ['liability', 'equity', 'income', 'contra_expense'].includes(acc.type);
        const delta = isCreditNormal ? (line.credit - line.debit) : (line.debit - line.credit);
        await Account.findOneAndUpdate(
          { _id: line.account, ...companyFilter },
          { $inc: { balance: delta } },
          { session }
        );
      }
    }

    if (cogsLines && cogsLines.lines.length > 0 && cogsLines.totalCost > 0) {
      await JournalEntry.create([{
        date: saleDoc.invoiceDate || new Date(),
        reference: cogsLines.reference,
        description: cogsLines.description,
        lines: cogsLines.lines,
        createdBy,
        company: companyId,
        fiscalYear,
        fiscalYearId: fiscalYearId || undefined,
        miti,
      }], { session });

      for (const line of cogsLines.lines) {
        if (line.account) {
          const acc = await Account.findOne({ _id: line.account, ...companyFilter }).session(session).select('type');
          const isCreditNormal = acc && ['liability', 'equity', 'income', 'contra_expense'].includes(acc.type);
          const delta = isCreditNormal ? (line.credit - line.debit) : (line.debit - line.credit);
          await Account.findOneAndUpdate(
            { _id: line.account, ...companyFilter },
            { $inc: { balance: delta } },
            { session }
          );
        }
      }
    }

    await session.commitTransaction();
    return je[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Atomic EMI Posting Engine
 * Wraps stock updates + journal entries + EMI doc + serial tracking in one transaction.
 */
async function postEmiAtomic({
  emiData,
  productDoc,
  exchangeItemsClean,
  exchangeItemsProducts,
  journalSpecs,
  companyId,
  createdBy,
  fiscalYear,
  fiscalYearId,
  miti,
  irdPayload,
  companyFilter,
}) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const Product = require('../models/Product');
    const InventoryMovement = require('../models/InventoryMovement');
    const Emi = require('../models/Emi');
    const Supplier = require('../models/Supplier');
    const Purchase = require('../models/Purchase');

    const p = await Product.findOne({ _id: productDoc._id, ...companyFilter }).session(session);
    if (!p) throw new Error('Product not found');
    if (p.stock < 1) throw new Error(`Insufficient stock for ${p.name}`);
    p.stock -= 1;
    await p.save({ session });
    await InventoryMovement.create([{
      product: p._id, type: 'out', quantity: -1,
      reference: emiData.emiNumber, note: 'EMI Sale',
      createdBy, company: companyId,
      fiscalYearId: fiscalYearId || undefined,
    }], { session });

    for (const it of exchangeItemsClean) {
      const ep = await Product.findOne({ _id: it.product, ...companyFilter }).session(session);
      if (!ep) continue;
      ep.stock += it.quantity;
      ep.itemCondition = 'second_hand';
      await ep.save({ session });
      await InventoryMovement.create([{
        product: ep._id, type: 'in', quantity: it.quantity,
        reference: emiData.emiNumber, note: 'Exchange trade-in from EMI',
        createdBy, company: companyId,
        fiscalYearId: fiscalYearId || undefined,
      }], { session });
    }

    if (exchangeItemsClean.length > 0) {
      const exchangeSourceName = (emiData.exchangeCustomerName && emiData.exchangeCustomerName.trim())
        ? emiData.exchangeCustomerName.trim() : emiData.customerName;
      let supplierDoc = await Supplier.findOne({ name: exchangeSourceName, ...companyFilter }).session(session);
      if (!supplierDoc) {
        const [created] = await Supplier.create([{ name: exchangeSourceName, company: companyId }], { session });
        supplierDoc = created;
      }
      await Purchase.create([{
        purchaseNumber: `EXC-${emiData.emiNumber}`,
        type: 'direct',
        date: new Date(),
        supplier: supplierDoc._id,
        items: exchangeItemsClean.map(it => ({
          product: it.product, quantity: it.quantity, costPrice: it.price, sellingPrice: 0,
          subtotal: Math.round(it.price * it.quantity * 100) / 100,
        })),
        subtotal: emiData.exchangeAmount,
        discount: 0, vatPercent: 0, inclusiveVat: false, tax: 0, tdsRate: 0, tds: 0,
        grandTotal: emiData.exchangeAmount, paidAmount: 0, dueAmount: 0, status: 'received',
        note: `Exchange trade-in from ${exchangeSourceName} (EMI ${emiData.emiNumber})`,
        createdBy, company: companyId,
      }], { session });
    }

    for (const spec of (journalSpecs || [])) {
      const lines = spec.lines || [];
      if (!lines.length) continue;

      // Defensive rebalance so rounding never trips the double-entry pre-save hook
      const tDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const tCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
      const adj = Math.round((tDebit - tCredit) * 100) / 100;
      if (Math.abs(adj) > 0.0001) {
        const target = [...lines].reverse().find(l => (l.debit || 0) > 0) || lines[lines.length - 1];
        target.debit = Math.round(((target.debit || 0) - adj) * 100) / 100;
      }

      await JournalEntry.create([{
        date: spec.date || new Date(),
        reference: spec.reference,
        description: spec.description,
        lines,
        createdBy,
        company: companyId,
        fiscalYear,
        fiscalYearId: fiscalYearId || undefined,
        miti,
        irdPayload: spec.irdPayload,
      }], { session });

      for (const line of lines) {
        if (line.account) {
          const acc = await Account.findOne({ _id: line.account, ...companyFilter }).session(session).select('type');
          const isCreditNormal = acc && ['liability', 'equity', 'income', 'contra_expense'].includes(acc.type);
          const delta = isCreditNormal ? (line.credit - line.debit) : (line.debit - line.credit);
          await Account.findOneAndUpdate(
            { _id: line.account, ...companyFilter },
            { $inc: { balance: delta } },
            { session }
          );
        }
      }
    }

    const emiDoc = await Emi.create([emiData], { session });

    await session.commitTransaction();
    return emiDoc[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = { postJournalEntryAtomic, postSaleAtomic, postEmiAtomic };
