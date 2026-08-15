const express = require('express');
const Purchase = require('../models/Purchase');
const Company = require('../models/Company');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const InventoryMovement = require('../models/InventoryMovement');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const { findOrCreateSupplierPayable, findOrCreateSupplierAdvance } = require('../utils/supplierPayable');
const { protect, adminOnly } = require('../middleware/auth');
const { postDaybookEntries, cancelDaybookEntries } = require('../utils/daybookService');
const { getClientIp } = require('../utils/irdAudit');
const { adjustBankBalance } = require('../utils/bankService');
const { adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { createNotification } = require('../utils/notifyService');
const router = express.Router();

async function generatePurchaseNo(companyId) {
  if (!companyId) throw new Error('No company assigned');
  const fy = getBSFiscalYear().label;
  for (let i = 0; i < 10; i++) {
    const company = await Company.findOneAndUpdate(
      { _id: companyId },
      { $inc: { purchaseCounter: 1 } },
      { new: true }
    );
    if (!company) throw new Error('No company assigned');
    const num = String(company.purchaseCounter).padStart(4, '0');
    const no = `PUR-${fy}-${num}`;
    const exists = await Purchase.exists({ purchaseNumber: no, company: companyId });
    if (!exists) return no;
  }
  throw new Error('Could not generate purchase number');
}

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
}

function getFiscalYearLabel(date) {
  return getBSFiscalYear(date).label;
}

router.get('/', protect, async (req, res) => {
  const filter = { ...req.companyFilter };
  if (req.query.startDate) filter.date = { ...filter.date, $gte: new Date(req.query.startDate) };
  if (req.query.endDate) filter.date = { ...filter.date, $lte: new Date(req.query.endDate) };
  if (!filter.date && Object.keys(req.fyFilter || {}).length) Object.assign(filter, req.fyFilter);
  if (req.query.type) filter.type = req.query.type;
  if (req.query.supplier) filter.supplier = req.query.supplier;
  if (req.query.status) filter.status = req.query.status;
  const items = await Purchase.find(filter).populate('supplier', 'name').populate('items.product', 'name sku').populate('createdBy', 'name').sort({ date: -1, createdAt: -1 });
  res.json(items);
});

router.post('/', protect, async (req, res) => {
  let { type, date, supplier, items, subtotal, discount, vatPercent, inclusiveVat, tax, tdsRate, tds, grandTotal, paidAmount, note, paymentMethod, bank, chequeNumber, paymentRemarks, supplierInvoiceNo, applyTds, splits } = req.body;
  if (applyTds !== true) { tds = 0; tdsRate = 0; }
  const dueAmount = Math.round(((grandTotal - (tds || 0) - (paidAmount || 0)) + Number.EPSILON) * 100) / 100;

  // Apply any existing supplier advance to reduce the amount still owed.
  let appliedAdvance = 0;
  if (supplier && dueAmount > 0) {
    const sup = await Supplier.findOne({ _id: supplier, ...req.companyFilter }).select('advanceBalance');
    if (sup && sup.advanceBalance > 0) {
      appliedAdvance = Math.min(sup.advanceBalance, dueAmount);
      appliedAdvance = Math.round(appliedAdvance * 100) / 100;
    }
  }
  const effectiveDue = Math.round((dueAmount - appliedAdvance) * 100) / 100;

  let purchaseNumber = req.body.purchaseNumber ? String(req.body.purchaseNumber).trim() : '';
  if (purchaseNumber) {
    const existing = await Purchase.findOne({ purchaseNumber, company: req.companyId });
    if (existing) return res.status(400).json({ message: 'Purchase number already exists' });
  } else {
    purchaseNumber = await generatePurchaseNo(req.companyId);
  }

  const purchaseDate = date ? new Date(date) : new Date();
  const purchase = await Purchase.create({
    purchaseNumber, type, date, supplier, items, subtotal,
    discount, vatPercent: vatPercent || 0, inclusiveVat: inclusiveVat || false,
    tax, tdsRate: tdsRate || 0, tds: tds || 0, grandTotal, paidAmount: paidAmount || 0, dueAmount: effectiveDue, advanceApplied: appliedAdvance,
    status: 'received', createdBy: req.user._id, note,
    paymentMethod: paymentMethod || '', chequeNumber: chequeNumber || '', paymentRemarks: paymentRemarks || '',
    bank: paymentMethod === 'bank' ? (bank || null) : null,
    paymentSplits: paymentMethod === 'split' ? (splits || []).filter(sp => sp.amount > 0) : undefined,
    supplierInvoiceNo: supplierInvoiceNo || '',
    fiscalYear: getFiscalYearLabel(purchaseDate),
    fiscalYearId: req.fiscalYearId || undefined,
    company: req.companyId,
  });

  if (appliedAdvance > 0) {
    await Supplier.findOneAndUpdate({ _id: supplier, ...req.companyFilter }, { $inc: { advanceBalance: -appliedAdvance } });
  }

  for (const item of items) {
    const product = await Product.findOne({ _id: item.product, ...req.companyFilter });
    if (product) {
      const oldStock = product.stock;
      const oldCost = product.costPrice;
      product.stock += item.quantity;
      if (supplier) product.supplier = supplier;
      if (item.costPrice > 0 && item.quantity > 0 && product.stock > 0) {
        product.costPrice = Math.round(((oldStock * oldCost) + (item.quantity * item.costPrice)) / product.stock * 100) / 100;
      }
      if (item.sellingPrice > 0) product.sellingPrice = item.sellingPrice;
      if (item.itemCondition) product.itemCondition = item.itemCondition;
      if (vatPercent > 0) {
        product.taxRate = vatPercent;
        product.priceIncludesTax = inclusiveVat || false;
      }
      await product.save();
      await InventoryMovement.create({
        product: product._id, type: 'in', quantity: item.quantity,
        reference: purchase.purchaseNumber, note: note || 'Purchase',
        createdBy: req.user._id, company: req.companyId,
        date: purchase.date || undefined, fiscalYearId: purchase.fiscalYearId || req.fiscalYearId || undefined,
      });
    }
  }

  try {
    const inventoryAccount = await Account.findOne({ code: '10400', ...req.companyFilter });
    const vatInputAccount = await Account.findOne({ code: '10501', ...req.companyFilter });
    const tdsAccount = await Account.findOne({ code: '20300', ...req.companyFilter });
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const payableAccount = await findOrCreateSupplierPayable(req.companyId, req.companyFilter, supplier);

    const lines = [];
    if (tax > 0 && vatInputAccount) {
      lines.push({ account: inventoryAccount?._id, debit: grandTotal - tax, credit: 0 });
      lines.push({ account: vatInputAccount._id, debit: tax, credit: 0 });
    } else {
      lines.push({ account: inventoryAccount?._id, debit: grandTotal, credit: 0 });
    }
    // Full AP credit (total amount owed to supplier)
    const apCredit = grandTotal - (tds || 0);
    if (apCredit > 0 && payableAccount) {
      lines.push({ account: payableAccount._id, debit: 0, credit: apCredit, subLedger: { supplier } });
    }
    // Debit AP for payment made (reduces what we owe)
    if (paidAmount > 0 && payableAccount) {
      lines.push({ account: payableAccount._id, debit: paidAmount, credit: 0, subLedger: { supplier } });
    }
    // Cash/Bank credit for payment
    if (paidAmount > 0) {
      if (paymentMethod === 'split' && req.body.splits && req.body.splits.length > 0) {
        for (const sp of req.body.splits) {
          if (!sp.amount || sp.amount <= 0) continue;
          const spAccount = sp.method === 'bank' ? bankAccount : cashAccount;
          lines.push({ account: spAccount?._id, debit: 0, credit: sp.amount, bank: sp.method === 'bank' ? (sp.bank || null) : null });
        }
      } else if (paymentMethod === 'bank') {
        lines.push({ account: bankAccount?._id, debit: 0, credit: paidAmount, bank: bank || null });
      } else {
        lines.push({ account: cashAccount?._id, debit: 0, credit: paidAmount });
      }
    }
    // TDS Payable credit
    if (tds > 0 && tdsAccount) {
      lines.push({ account: tdsAccount._id, debit: 0, credit: tds });
    }
    // Apply supplier advance: reduce AP liability and consume the Advance-to-Supplier asset.
    if (appliedAdvance > 0 && payableAccount) {
      const advanceAccount = await findOrCreateSupplierAdvance(req.companyId, req.companyFilter);
      if (advanceAccount) {
        lines.push({ account: payableAccount._id, debit: appliedAdvance, credit: 0, subLedger: { supplier } });
        lines.push({ account: advanceAccount._id, debit: 0, credit: appliedAdvance, subLedger: { supplier } });
      }
    }

    if (lines.length > 1) {
      const supplierDoc = supplier ? await Supplier.findOne({ _id: supplier, ...req.companyFilter }) : null;
      const fiscalYr = getFiscalYear(purchaseDate);
      const miti = adToBikramSambat(purchaseDate);

      const dayLines = [];
      if (tax > 0 && vatInputAccount) {
        dayLines.push({ account: inventoryAccount?._id, accountName: inventoryAccount?.name || 'Inventory Stock', debit: grandTotal - tax, credit: 0, partyType: 'supplier', partyId: supplier, partyName: supplierDoc?.name || '' });
        dayLines.push({ account: vatInputAccount._id, accountName: vatInputAccount.name, debit: tax, credit: 0 });
      } else {
        dayLines.push({ account: inventoryAccount?._id, accountName: inventoryAccount?.name || 'Inventory Stock', debit: grandTotal, credit: 0, partyType: 'supplier', partyId: supplier, partyName: supplierDoc?.name || '' });
      }
      if (apCredit > 0 && payableAccount) {
        dayLines.push({ account: payableAccount._id, accountName: payableAccount?.name || 'Accounts Payable', debit: 0, credit: apCredit, partyType: 'supplier', partyId: supplier, partyName: supplierDoc?.name || '' });
      }
      if (paidAmount > 0 && payableAccount) {
        dayLines.push({ account: payableAccount._id, accountName: payableAccount?.name || 'Accounts Payable', debit: paidAmount, credit: 0, partyType: 'supplier', partyId: supplier, partyName: supplierDoc?.name || '' });
      }
      if (paidAmount > 0) {
        if (paymentMethod === 'split' && req.body.splits && req.body.splits.length > 0) {
          for (const sp of req.body.splits) {
            if (!sp.amount || sp.amount <= 0) continue;
            const spAccount = sp.method === 'bank' ? bankAccount : cashAccount;
            dayLines.push({ account: spAccount?._id, accountName: spAccount?.name || (sp.method === 'bank' ? 'Bank' : 'Cash'), debit: 0, credit: sp.amount, bank: sp.method === 'bank' ? (sp.bank || null) : null });
          }
        } else if (paymentMethod === 'bank') {
          dayLines.push({ account: bankAccount?._id, accountName: bankAccount?.name || 'Bank', debit: 0, credit: paidAmount, bank: bank || null });
        } else {
          dayLines.push({ account: cashAccount?._id, accountName: cashAccount?.name || 'Cash (Teji/Nagad)', debit: 0, credit: paidAmount });
        }
      }
      if (tds > 0 && tdsAccount) {
        dayLines.push({ account: tdsAccount._id, accountName: tdsAccount.name, debit: 0, credit: tds });
      }
      if (appliedAdvance > 0 && payableAccount) {
        const advanceAccount = await findOrCreateSupplierAdvance(req.companyId, req.companyFilter);
        if (advanceAccount) {
          dayLines.push({ account: payableAccount._id, accountName: payableAccount?.name || 'Accounts Payable', debit: appliedAdvance, credit: 0, partyType: 'supplier', partyId: supplier, partyName: supplierDoc?.name || '' });
          dayLines.push({ account: advanceAccount._id, accountName: advanceAccount.name || 'Advance to Supplier', debit: 0, credit: appliedAdvance, partyType: 'supplier', partyId: supplier, partyName: supplierDoc?.name || '' });
        }
      }

      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: purchaseDate,
        reference: purchase.purchaseNumber,
        description: `Purchase ${purchase.purchaseNumber}${supplierDoc ? ' - ' + supplierDoc.name : ''}`,
        lines,
        createdBy: req.user._id,
        fiscalYear: fiscalYr,
        fiscalYearId: req.fiscalYearId || undefined,
        miti,
        companyFilter: req.companyFilter,
        daybook: {
          date: purchaseDate,
          sourceModule: 'PURCHASE_INVOICE',
          daybookType: 'PURCHASES_BOOK',
          documentNumber: purchase.purchaseNumber,
          sourceRef: String(purchase._id),
          narration: `Purchase ${purchase.purchaseNumber}`,
          lines: dayLines,
          createdBy: req.user._id,
          terminalIp: getClientIp(req),
        },
      });
      if (paymentMethod === 'bank' && paidAmount > 0 && bank) await adjustBankBalance(bank, -paidAmount, req.companyFilter).catch(() => {});
      if (paymentMethod === 'split' && req.body.splits && req.body.splits.length > 0) {
        for (const sp of req.body.splits) {
          if (sp.method === 'bank' && sp.amount > 0 && sp.bank) {
            await adjustBankBalance(sp.bank, -sp.amount, req.companyFilter).catch(() => {});
          }
        }
      }
    }
  } catch (err) { console.error('Purchase journal error:', err.message); }

  const populated = await Purchase.findOne({ _id: purchase._id, ...req.companyFilter }).populate('supplier', 'name').populate('items.product', 'name sku');
  res.status(201).json(populated);
  createNotification({ type: 'purchase', title: 'New Purchase', message: `Purchase ${purchase.purchaseNumber} created for Rs. ${grandTotal}`, reference: purchase.purchaseNumber, amount: grandTotal, companyId: req.companyId, userId: req.user._id });
});

router.get('/:id', protect, async (req, res) => {
  const item = await Purchase.findOne({ _id: req.params.id, ...req.companyFilter }).populate('supplier').populate('items.product');
  res.json(item);
});

router.post('/:id/pay', protect, adminOnly, async (req, res) => {
  const purchase = await Purchase.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
  const { amount, method, bank, chequeNumber, remarks } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid payment amount' });
  if (amount > (purchase.dueAmount || 0)) return res.status(400).json({ message: `Payment exceeds due amount of ${purchase.dueAmount}` });
  if (method === 'bank' && !chequeNumber) return res.status(400).json({ message: 'Cheque number required for bank payment' });
  purchase.paidAmount = (purchase.paidAmount || 0) + amount;
  purchase.dueAmount = Math.round(Math.max(0, purchase.grandTotal - (purchase.tds || 0) - purchase.paidAmount) * 100) / 100;
  purchase.paymentMethod = method || 'cash';
  if (method === 'bank' && bank) purchase.bank = bank;
  if (chequeNumber) purchase.chequeNumber = chequeNumber;
  if (remarks) purchase.paymentRemarks = remarks;
  await purchase.save();
  try {
    const supplierDoc = purchase.supplier ? await Supplier.findOne({ _id: purchase.supplier, ...req.companyFilter }) : null;
    const payableAccount = await findOrCreateSupplierPayable(req.companyId, req.companyFilter, supplierDoc);
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const acct = method === 'bank' ? bankAccount : cashAccount;
    if (acct && payableAccount) {
      const lines = [
        { account: payableAccount._id, debit: amount, credit: 0, subLedger: { supplier: purchase.supplier } },
        { account: acct._id, debit: 0, credit: amount, bank: method === 'bank' ? (bank || null) : null },
      ];
      const supplierRef = supplierDoc ? supplierDoc.name : '';
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(),
        reference: `PAY-${purchase.purchaseNumber}-${Date.now()}`,
        description: `Payment to supplier${supplierRef ? ' - ' + supplierRef : ''} for ${purchase.purchaseNumber}${chequeNumber ? ' (Chq: ' + chequeNumber + ')' : ''}`,
        lines,
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(new Date()),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        companyFilter: req.companyFilter,
        daybook: {
          date: new Date(),
          sourceModule: 'SUPPLIER_PAYMENT',
          daybookType: 'CASH_BOOK',
          documentNumber: `PAY-${purchase.purchaseNumber}`,
          sourceRef: String(purchase._id),
          narration: `Payment to supplier${supplierRef ? ' - ' + supplierRef : ''} for ${purchase.purchaseNumber}`,
          lines: [
            { account: payableAccount._id, accountName: payableAccount.name, debit: amount, credit: 0, partyType: 'supplier', partyId: purchase.supplier, partyName: supplierRef },
            { account: acct._id, accountName: acct.name || (method === 'bank' ? 'Bank Account' : 'Cash'), debit: 0, credit: amount },
          ],
          createdBy: req.user._id,
          terminalIp: getClientIp(req),
        },
      });
      if (method === 'bank' && bank) await adjustBankBalance(bank, -amount, req.companyFilter).catch(() => {});
    }
  } catch (err) { console.error('Payment journal error:', err.message); }
  res.json(purchase);
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  const purchased = await Purchase.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!purchased) return res.status(404).json({ message: 'Purchase not found' });

  try {
    await cancelDaybookEntries({
      companyId: req.companyId,
      sourceModule: 'PURCHASE_INVOICE',
      documentNumber: purchased.purchaseNumber,
      createdBy: req.user._id,
      reason: 'Purchase edited',
    });
  } catch (e) { console.error('Cancel daybook error:', e.message); }

  try {
    const oldEntries = await JournalEntry.find({ reference: purchased.purchaseNumber, company: req.companyId });
    for (const entry of oldEntries) {
      const reversalLines = entry.lines.map(l => ({
        account: l.account,
        debit: l.credit || 0,
        credit: l.debit || 0,
        subLedger: l.subLedger,
        bank: l.bank,
      }));
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(),
        reference: `REV-${purchased.purchaseNumber}-${Date.now()}`,
        description: `Reversal of ${purchased.purchaseNumber} - edited`,
        lines: reversalLines,
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(new Date()),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        companyFilter: req.companyFilter,
      });
      entry.description = entry.description + ' [REVERSED]';
      await entry.save();
    }
  } catch (e) { console.error('Journal reversal error:', e.message); }

  if (purchased.paymentMethod === 'bank' && purchased.paidAmount > 0 && purchased.bank) {
    try { await adjustBankBalance(purchased.bank, purchased.paidAmount, req.companyFilter); } catch (e) { console.error('Bank reversal error:', e.message); }
  }

  const oldItems = purchased.items;
    const { items: newItems, splits: reqSplits, ...otherFields } = req.body;
    if (req.body.applyTds !== true) { otherFields.tds = 0; otherFields.tdsRate = 0; }
    if (reqSplits !== undefined) {
      otherFields.paymentSplits = otherFields.paymentMethod === 'split' ? (reqSplits || []).filter(sp => sp.amount > 0) : [];
    }
    if (otherFields.paymentMethod === 'bank' && otherFields.bank) {
      // keep bank as-is
    } else if (otherFields.paymentMethod !== 'bank') {
      otherFields.bank = null;
    }

  if (newItems) {
    for (const oldItem of oldItems) {
      const product = await Product.findOne({ _id: oldItem.product, ...req.companyFilter });
      if (product) {
        product.stock -= oldItem.quantity;
        if (product.stock < 0) product.stock = 0;
        await product.save();
      }
    }
    for (const newItem of newItems) {
      const product = await Product.findOne({ _id: newItem.product, ...req.companyFilter });
      if (product) {
        product.stock = (product.stock || 0) + newItem.quantity;
        const oldCost = product.costPrice;
        if (newItem.costPrice > 0 && newItem.quantity > 0) {
          product.costPrice = Math.round(((product.stock - newItem.quantity) * oldCost + newItem.quantity * newItem.costPrice) / product.stock * 100) / 100;
        }
        await product.save();
      }
    }
  }

  const updated = await Purchase.findOneAndUpdate({ _id: req.params.id, ...req.companyFilter }, otherFields, { new: true });

  try {
    const updatedDate = new Date(updated.date);
    const tax = updated.tax || 0;
    const grandTotal = updated.grandTotal || 0;
    const paidAmount = updated.paidAmount || 0;
    const dueAmount = Math.round(((grandTotal - (updated.tds || 0) - paidAmount) + Number.EPSILON) * 100) / 100;

    const supplierDoc = updated.supplier ? await Supplier.findOne({ _id: updated.supplier, ...req.companyFilter }) : null;
    const payableAccount = await findOrCreateSupplierPayable(req.companyId, req.companyFilter, supplierDoc);
    const inventoryAccount = await Account.findOne({ code: '10400', ...req.companyFilter });
    const vatAccount = await Account.findOne({ code: '10501', ...req.companyFilter });
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });

    const lines = [];
    if (inventoryAccount) lines.push({ account: inventoryAccount._id, debit: updated.subtotal || 0, credit: 0 });
    if (tax > 0 && vatAccount) lines.push({ account: vatAccount._id, debit: updated.tax || 0, credit: 0 });
    const apCredit = (updated.grandTotal || 0) - (updated.tds || 0);
    if (payableAccount && apCredit > 0) lines.push({ account: payableAccount._id, debit: 0, credit: apCredit, subLedger: { supplier: updated.supplier } });
    if (payableAccount && updated.paidAmount > 0) lines.push({ account: payableAccount._id, debit: updated.paidAmount, credit: 0, subLedger: { supplier: updated.supplier } });
    if (updated.paidAmount > 0) {
      if (updated.paymentMethod === 'split' && updated.paymentSplits && updated.paymentSplits.length > 0) {
        for (const sp of updated.paymentSplits) {
          if (!sp.amount || sp.amount <= 0) continue;
          const spAccount = sp.method === 'bank' ? bankAccount : cashAccount;
          lines.push({ account: spAccount?._id, debit: 0, credit: sp.amount, bank: sp.method === 'bank' ? (sp.bank || null) : null });
        }
      } else if (updated.paymentMethod === 'bank') {
        lines.push({ account: bankAccount?._id, debit: 0, credit: updated.paidAmount, bank: updated.bank || null });
      } else {
        lines.push({ account: cashAccount?._id, debit: 0, credit: updated.paidAmount });
      }
    }
    if (updated.tds > 0) {
      const tdsAcc = await Account.findOne({ code: '20300', ...req.companyFilter });
      if (tdsAcc) lines.push({ account: tdsAcc._id, debit: 0, credit: updated.tds });
    }

    if (lines.length > 0) {
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: updatedDate,
        reference: updated.purchaseNumber,
        description: `Purchase ${updated.purchaseNumber} (edited)`,
        lines,
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(updatedDate),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(updatedDate),
        companyFilter: req.companyFilter,
        daybook: {
          date: updatedDate,
          sourceModule: 'PURCHASE_INVOICE',
          daybookType: 'PURCHASES_BOOK',
          documentNumber: updated.purchaseNumber,
          sourceRef: String(updated._id),
          narration: `Purchase ${updated.purchaseNumber} (edited)`,
          lines: lines.map(l => ({ ...l, account: l.account, accountName: '', partyType: 'supplier', partyId: updated.supplier, partyName: supplierDoc?.name || '' })),
          createdBy: req.user._id,
          terminalIp: getClientIp(req),
        },
      });
    }
    if (updated.paymentMethod === 'bank' && updated.paidAmount > 0 && updated.bank) {
      await adjustBankBalance(updated.bank, -updated.paidAmount, req.companyFilter).catch(() => {});
    }
  } catch (e) { console.error('Purchase journal error:', e.message); }

  res.json(updated);
});

router.post('/:id/return', protect, adminOnly, async (req, res) => {
  const purchase = await Purchase.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
  const { items, reason } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ message: 'No items to return' });
  const returned = [];
  for (const r of items) {
    const qty = Number(r.quantity);
    if (!qty || qty <= 0) continue;
    const line = purchase.items.find(it => String(it.product) === String(r.product));
    if (!line) return res.status(400).json({ message: 'Item does not belong to this purchase' });
    const already = (purchase.returns || [])
      .filter(x => x.product && String(x.product) === String(r.product))
      .reduce((s, x) => s + x.quantity, 0);
    if (qty > line.quantity - already) {
      return res.status(400).json({ message: `Return quantity ${qty} exceeds purchasable ${line.quantity - already}` });
    }
    const product = await Product.findOne({ _id: r.product, ...req.companyFilter });
    if (product) {
      product.stock -= qty;
      if (product.stock < 0) product.stock = 0;
      await product.save();
      await InventoryMovement.create({
        product: product._id, type: 'purchase_return', quantity: -qty,
        reference: purchase.purchaseNumber, note: reason || 'Purchase return',
        createdBy: req.user._id, company: req.companyId,
        date: purchase.date || undefined, fiscalYearId: purchase.fiscalYearId || req.fiscalYearId || undefined,
      });
    }
    returned.push({ product: r.product, quantity: qty, reason: reason || '', returnedBy: req.user._id, date: new Date() });
  }
  purchase.returns = [...(purchase.returns || []), ...returned];
  await purchase.save();

  try {
    const returnValue = returned.reduce((s, r) => {
      const line = purchase.items.find(it => String(it.product) === String(r.product));
      return s + (r.quantity || 0) * (line?.costPrice || 0);
    }, 0);
    if (returnValue > 0) {
      const supplierDoc = purchase.supplier ? await Supplier.findOne({ _id: purchase.supplier, ...req.companyFilter }) : null;
      const inventoryAccount = await Account.findOne({ code: '10400', ...req.companyFilter });
      const payableAccount = await findOrCreateSupplierPayable(req.companyId, req.companyFilter, supplierDoc);
      const lines = [
        { account: payableAccount?._id, debit: returnValue, credit: 0 },
        { account: inventoryAccount?._id, debit: 0, credit: returnValue },
      ];
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(),
        reference: `DRN-${purchase.purchaseNumber}`,
        description: `Purchase return ${purchase.purchaseNumber}${reason ? ' - ' + reason : ''}`,
        lines,
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(new Date()),
        fiscalYearId: purchase.fiscalYearId || req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        companyFilter: req.companyFilter,
        daybook: {
          date: new Date(),
          sourceModule: 'DEBIT_NOTE',
          daybookType: 'PURCHASE_RETURNS',
          documentNumber: `DRN-${purchase.purchaseNumber}`,
          sourceRef: String(purchase._id),
          narration: `Purchase return ${purchase.purchaseNumber}${reason ? ' - ' + reason : ''}`,
          lines: [
            { account: payableAccount?._id, accountName: payableAccount?.name || 'Accounts Payable', debit: returnValue, credit: 0, partyType: 'supplier', partyId: purchase.supplier, partyName: supplierDoc?.name || '' },
            { account: inventoryAccount?._id, accountName: inventoryAccount?.name || 'Inventory Stock', debit: 0, credit: returnValue },
          ],
          createdBy: req.user._id,
          terminalIp: getClientIp(req),
        },
      });
    }
  } catch (err) { console.error('Purchase return journal error:', err.message); }

  res.json(purchase);
});

router.post('/standalone-return', protect, adminOnly, async (req, res) => {
  try {
    const { date, supplier, items, reason } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ message: 'No items to return' });
    if (!supplier) return res.status(400).json({ message: 'Supplier is required' });

    const returnNumber = `DRN-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
    let totalValue = 0;
    const productLines = [];

    for (const r of items) {
      const qty = Number(r.quantity);
      if (!qty || qty <= 0) continue;
      const product = await Product.findOne({ _id: r.product, ...req.companyFilter });
      if (!product) return res.status(400).json({ message: `Product not found: ${r.product}` });

      const costPrice = r.costPrice || product.costPrice || 0;
      const lineValue = qty * costPrice;
      totalValue += lineValue;

      product.stock = Math.max(0, (product.stock || 0) - qty);
      await product.save();

      await InventoryMovement.create({
        product: product._id, type: 'purchase_return', quantity: -qty,
        reference: returnNumber, note: reason || 'Standalone purchase return',
        createdBy: req.user._id, company: req.companyId,
        date: date ? new Date(date) : new Date(),
        fiscalYearId: req.fiscalYearId || undefined,
      });

      productLines.push({ product: product._id, quantity: qty, costPrice, subtotal: lineValue });
    }

    if (totalValue <= 0) return res.status(400).json({ message: 'Total return value must be greater than 0' });

    const purchase = await Purchase.create({
      purchaseNumber: returnNumber, type: 'return', date: date ? new Date(date) : new Date(),
      supplier, items: productLines, subtotal: totalValue, grandTotal: totalValue,
      status: 'returned', createdBy: req.user._id, note: reason || 'Standalone purchase return',
      returns: productLines.map(pl => ({ product: pl.product, quantity: pl.quantity, reason: reason || '', returnedBy: req.user._id, date: new Date() })),
      fiscalYearId: req.fiscalYearId || undefined,
    });

    try {
      const supplierDoc = await Supplier.findOne({ _id: supplier, ...req.companyFilter });
      const inventoryAccount = await Account.findOne({ code: '10400', ...req.companyFilter });
      const payableAccount = await findOrCreateSupplierPayable(req.companyId, req.companyFilter, supplierDoc);
      const lines = [
        { account: payableAccount?._id, debit: totalValue, credit: 0 },
        { account: inventoryAccount?._id, debit: 0, credit: totalValue },
      ];
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: date ? new Date(date) : new Date(),
        reference: returnNumber,
        description: `Purchase return ${returnNumber}${reason ? ' - ' + reason : ''}`,
        lines,
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(new Date()),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        companyFilter: req.companyFilter,
        daybook: {
          date: date ? new Date(date) : new Date(),
          sourceModule: 'DEBIT_NOTE',
          daybookType: 'PURCHASE_RETURNS',
          documentNumber: returnNumber,
          sourceRef: String(purchase._id),
          narration: `Standalone purchase return${reason ? ' - ' + reason : ''}`,
          lines: [
            { account: payableAccount?._id, accountName: payableAccount?.name || 'Accounts Payable', debit: totalValue, credit: 0, partyType: 'supplier', partyId: supplier, partyName: supplierDoc?.name || '' },
            { account: inventoryAccount?._id, accountName: inventoryAccount?.name || 'Inventory Stock', debit: 0, credit: totalValue },
          ],
          createdBy: req.user._id,
          terminalIp: getClientIp(req),
        },
      });
    } catch (err) { console.error('Standalone return journal error:', err.message); }

    res.json(purchase);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
