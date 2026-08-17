const express = require('express');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const InventoryMovement = require('../models/InventoryMovement');
const Company = require('../models/Company');
const Customer = require('../models/Customer');
const { protect, adminOnly, requirePANForLargeTx } = require('../middleware/auth');
const fiscalYearFilter = require('../middleware/fiscalYear');
const { round100, buildIRDPayload, adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const { postDaybookEntries, cancelDaybookEntries } = require('../utils/daybookService');
const { getClientIp } = require('../utils/irdAudit');
const { adjustBankBalance } = require('../utils/bankService');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { createNotification } = require('../utils/notifyService');
const { findOrCreateCustomerReceivable } = require('../utils/customerReceivable');
const router = express.Router();

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
}

function getFiscalYearLabel(date) {
  return getBSFiscalYear(date).label;
}

async function generateInvoice(companyId) {
  if (!companyId) throw new Error('No company assigned to this account');
  const fy = getBSFiscalYear().label;
  for (let i = 0; i < 10; i++) {
    const company = await Company.findOneAndUpdate(
      { _id: companyId },
      { $inc: { invoiceCounter: 1 } },
      { new: true }
    );
    if (!company) throw new Error('No company assigned to this account');
    const num = String(company.invoiceCounter).padStart(4, '0');
    const invNo = `${fy}-${num}`;
    const exists = await Sale.exists({ invoiceNumber: invNo, company: companyId });
    if (!exists) return invNo;
  }
  throw new Error('Could not generate a unique invoice number');
}

async function generateCreditNote(companyId) {
  if (!companyId) throw new Error('No company assigned to this account');
  const fy = getBSFiscalYear().label;
  for (let i = 0; i < 10; i++) {
    const company = await Company.findOneAndUpdate(
      { _id: companyId },
      { $inc: { creditNoteCounter: 1 } },
      { new: true }
    );
    if (!company) throw new Error('No company assigned to this account');
    const num = String(company.creditNoteCounter).padStart(3, '0');
    const cnNo = `CN-${fy}-${num}`;
    const exists = await Sale.exists({ creditNoteNumber: cnNo, company: companyId });
    if (!exists) return cnNo;
  }
  throw new Error('Could not generate a unique credit note number');
}

async function generateDebitNote(companyId) {
  if (!companyId) throw new Error('No company assigned to this account');
  const fy = getBSFiscalYear().label;
  for (let i = 0; i < 10; i++) {
    const company = await Company.findOneAndUpdate(
      { _id: companyId },
      { $inc: { debitNoteCounter: 1 } },
      { new: true }
    );
    if (!company) throw new Error('No company assigned to this account');
    const num = String(company.debitNoteCounter).padStart(3, '0');
    const dnNo = `DN-${fy}-${num}`;
    const exists = await Sale.exists({ debitNoteNumber: dnNo, company: companyId });
    if (!exists) return dnNo;
  }
  throw new Error('Could not generate a unique debit note number');
}

async function postSaleJournalEntry(sale, items, req, { customerDoc, customerPan, source }) {
  const companyDoc = await Company.findOne({ _id: req.companyId }).lean();
  const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
  const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
  const salesAccount = await Account.findOne({ code: '40100', ...req.companyFilter });
  const vatAccount = await Account.findOne({ code: '20200', ...req.companyFilter });
  const inventoryAccount = await Account.findOne({ code: '10400', ...req.companyFilter });
  const cogsAccount = await Account.findOne({ code: '50100', ...req.companyFilter });

  let discountAccount = null;
  if ((sale.discount || 0) > 0) {
    discountAccount = await Account.findOne({ code: '40200', ...req.companyFilter });
    if (!discountAccount) {
      discountAccount = await Account.create({
        code: '40200', name: 'Sales Discount/Return', type: 'revenue', category: 'contra_revenue',
        balance: 0, isSystem: true, company: req.companyId,
      });
    }
  }

  const vatEnabled = process.env.VAT_ENABLED !== 'false';
  const effectiveTaxTotal = vatEnabled ? (sale.taxTotal || 0) : 0;
  if (!salesAccount) return;

  const productDocs = await Product.find({ _id: { $in: items.map(i => i.product) }, ...req.companyFilter }).lean();
  const productMap = new Map(productDocs.map(p => [String(p._id), p]));

  const fiscalYr = getFiscalYear(sale.invoiceDate || sale.createdAt);
  const miti = adToBikramSambat(sale.invoiceDate || new Date());
  const jeDate = sale.invoiceDate || new Date();
  const hasCustomer = !!customerDoc;
  const customerAr = hasCustomer ? await findOrCreateCustomerReceivable(req.companyId, req.companyFilter, customerDoc) : null;

  const irdPayload = buildIRDPayload({
    invoiceNumber: sale.invoiceNumber,
    adDate: jeDate,
    transactionType: sale.paymentMethod === 'credit' ? 'credit' : 'cash',
    seller: { name: companyDoc?.name || '', pan: companyDoc?.pan || '', address: companyDoc?.address || '', mobile: companyDoc?.phone || '' },
    buyer: { name: customerDoc?.name || 'Walk-in', pan: customerPan || '' },
    items: items.map((i, idx) => {
      const pd = productMap.get(String(i.product));
      return {
        sn: idx + 1,
        description: pd?.name || i.name || 'Item',
        quantity: i.quantity,
        unit: pd?.unit || 'pcs',
        rate: i.price,
        amount: round100(i.price * i.quantity),
      };
    }),
    totals: {
      totalGrossAmount: round100(sale.grandTotal),
      nonTaxableAmount: 0,
      taxableAmount: round100(sale.subtotal),
      vatAmount: round100(effectiveTaxTotal),
      grandTotal: round100(sale.grandTotal),
    },
    printerMeta: { printerName: '', user: req.user?.name || '', software: 'ERP-Nepal v1.0' },
  });

  const daybookBase = {
    date: jeDate,
    sourceModule: 'SALES_INVOICE',
    documentNumber: sale.invoiceNumber,
    sourceRef: String(sale._id),
    createdBy: req.user._id,
    terminalIp: getClientIp(req),
  };
  const partyLine = { partyType: customerDoc ? 'customer' : 'none', partyId: customerDoc?._id || null, partyName: customerDoc?.name || 'Walk-in' };

  if (hasCustomer && customerAr) {
    const saleLines = [
      { account: customerAr._id, debit: sale.grandTotal, credit: 0 },
      { account: salesAccount._id, debit: 0, credit: sale.grandTotal + (sale.discount || 0) - effectiveTaxTotal },
    ];
    if (effectiveTaxTotal > 0 && vatAccount) saleLines.push({ account: vatAccount._id, debit: 0, credit: effectiveTaxTotal });
    if ((sale.discount || 0) > 0 && discountAccount) saleLines.push({ account: discountAccount._id, debit: sale.discount, credit: 0 });

    await postJournalEntryAtomic({
      companyId: req.companyId, date: jeDate, reference: sale.invoiceNumber,
      description: `${source === 'invoice' ? 'Sales Invoice' : 'POS Sale'} ${sale.invoiceNumber}`,
      lines: saleLines, createdBy: req.user._id, fiscalYear: fiscalYr,
      fiscalYearId: req.fiscalYearId || undefined, miti, irdPayload, companyFilter: req.companyFilter,
      daybook: { ...daybookBase, daybookType: 'SALES_BOOK', narration: `Sale ${sale.invoiceNumber} to ${customerDoc.name}`, lines: saleLines.map(l => ({ ...l, account: l.account, accountName: '', ...partyLine })) },
    });

    let paidTotal = 0;
    if (sale.paymentMethod === 'split' && sale.paymentSplits && sale.paymentSplits.length > 0) {
      for (const split of sale.paymentSplits) {
        if (split.amount <= 0) continue;
        paidTotal += split.amount;
        const payLines = [];
        if (split.method === 'cash') {
          payLines.push({ account: cashAccount._id, debit: split.amount, credit: 0 });
        } else if (split.method === 'qr' || split.method === 'bank') {
          payLines.push({ account: bankAccount._id, debit: split.amount, credit: 0, bank: split.bank || null });
          if (split.bank) await adjustBankBalance(split.bank, split.amount, req.companyFilter).catch(() => {});
        } else if (split.method === 'credit') {
          continue;
        }
        payLines.push({ account: customerAr._id, debit: 0, credit: split.amount });
        await postJournalEntryAtomic({
          companyId: req.companyId, date: jeDate, reference: sale.invoiceNumber,
          description: `Payment received - ${split.method} for ${sale.invoiceNumber}`,
          lines: payLines, createdBy: req.user._id, fiscalYear: fiscalYr,
          fiscalYearId: req.fiscalYearId || undefined, miti, companyFilter: req.companyFilter,
          daybook: { ...daybookBase, sourceModule: 'PAYMENT_IN', daybookType: 'CASH_BOOK', narration: `Payment ${split.method} from ${customerDoc.name}`, lines: payLines.map(l => ({ ...l, account: l.account, accountName: '', ...partyLine })) },
        });
      }
    } else if (sale.paymentMethod !== 'credit') {
      paidTotal = sale.amountPaid || sale.grandTotal;
      const payLines = [];
      if (sale.paymentMethod === 'qr' || sale.paymentMethod === 'bank') {
        payLines.push({ account: bankAccount._id, debit: sale.amountPaid || sale.grandTotal, credit: 0, bank: sale.bank || null });
        if (sale.bank) await adjustBankBalance(sale.bank, sale.amountPaid || sale.grandTotal, req.companyFilter).catch(() => {});
      } else {
        payLines.push({ account: cashAccount._id, debit: sale.amountPaid || sale.grandTotal, credit: 0 });
      }
      payLines.push({ account: customerAr._id, debit: 0, credit: sale.amountPaid || sale.grandTotal });
      await postJournalEntryAtomic({
        companyId: req.companyId, date: jeDate, reference: sale.invoiceNumber,
        description: `Payment received - ${sale.paymentMethod} for ${sale.invoiceNumber}`,
        lines: payLines, createdBy: req.user._id, fiscalYear: fiscalYr,
        fiscalYearId: req.fiscalYearId || undefined, miti, companyFilter: req.companyFilter,
        daybook: { ...daybookBase, sourceModule: 'PAYMENT_IN', daybookType: 'CASH_BOOK', narration: `Payment ${sale.paymentMethod} from ${customerDoc.name}`, lines: payLines.map(l => ({ ...l, account: l.account, accountName: '', ...partyLine })) },
      });
    }
  } else {
    const saleLines = [];
    if (sale.paymentMethod === 'split' && sale.paymentSplits && sale.paymentSplits.length > 0) {
      for (const split of sale.paymentSplits) {
        if (split.amount <= 0) continue;
        if (split.method === 'cash') saleLines.push({ account: cashAccount._id, debit: split.amount, credit: 0 });
        else if (split.method === 'qr' || split.method === 'bank') saleLines.push({ account: bankAccount._id, debit: split.amount, credit: 0, bank: split.bank || null });
      }
    } else {
      const isBankPay = sale.paymentMethod === 'qr' || sale.paymentMethod === 'bank';
      const debitAcc = isBankPay ? bankAccount : cashAccount;
      saleLines.push({ account: debitAcc._id, debit: sale.grandTotal, credit: 0, bank: isBankPay ? (sale.bank || null) : null });
    }
    saleLines.push({ account: salesAccount._id, debit: 0, credit: sale.grandTotal + (sale.discount || 0) - effectiveTaxTotal });
    if (effectiveTaxTotal > 0 && vatAccount) saleLines.push({ account: vatAccount._id, debit: 0, credit: effectiveTaxTotal });
    if ((sale.discount || 0) > 0 && discountAccount) saleLines.push({ account: discountAccount._id, debit: sale.discount, credit: 0 });

    await postJournalEntryAtomic({
      companyId: req.companyId, date: jeDate, reference: sale.invoiceNumber,
      description: `${source === 'invoice' ? 'Sales Invoice' : 'POS Sale'} ${sale.invoiceNumber}`,
      lines: saleLines, createdBy: req.user._id, fiscalYear: fiscalYr,
      fiscalYearId: req.fiscalYearId || undefined, miti, irdPayload, companyFilter: req.companyFilter,
      daybook: { ...daybookBase, daybookType: 'CASH_BOOK', narration: `Sale ${sale.invoiceNumber}`, lines: saleLines.map(l => ({ ...l, account: l.account, accountName: '', partyType: 'none', partyId: null, partyName: 'Walk-in' })) },
    });

    if (sale.paymentMethod === 'split' && sale.paymentSplits) {
      for (const split of sale.paymentSplits) {
        if ((split.method === 'qr' || split.method === 'bank') && split.bank) await adjustBankBalance(split.bank, split.amount, req.companyFilter).catch(() => {});
      }
    } else if (sale.paymentMethod === 'qr' || sale.paymentMethod === 'bank') {
      if (sale.bank) await adjustBankBalance(sale.bank, sale.grandTotal, req.companyFilter).catch(() => {});
    }
  }

  if (inventoryAccount && cogsAccount) {
    let totalCost = 0;
    for (const item of items) {
      const pd = productMap.get(String(item.product));
      totalCost += (pd?.costPrice || item.costPrice || 0) * item.quantity;
    }
    if (totalCost > 0) {
      await postJournalEntryAtomic({
        companyId: req.companyId, date: jeDate, reference: sale.invoiceNumber,
        description: `COGS for ${sale.invoiceNumber}`,
        lines: [
          { account: cogsAccount._id, debit: totalCost, credit: 0 },
          { account: inventoryAccount._id, debit: 0, credit: totalCost },
        ],
        createdBy: req.user._id, fiscalYear: fiscalYr,
        fiscalYearId: req.fiscalYearId || undefined, miti: adToBikramSambat(jeDate), companyFilter: req.companyFilter,
      });
    }
  }
}

async function postRefundJournalEntry(sale, req, { remark }) {
  const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
  const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
  const vatAccount = await Account.findOne({ code: '20200', ...req.companyFilter });
  const inventoryAccount = await Account.findOne({ code: '10400', ...req.companyFilter });
  const cogsAccount = await Account.findOne({ code: '50100', ...req.companyFilter });

  let salesReturnAccount = await Account.findOne({ code: '40300', ...req.companyFilter });
  if (!salesReturnAccount) {
    salesReturnAccount = await Account.create({
      code: '40300', name: 'Sales Returns & Allowances', type: 'revenue', category: 'contra_revenue',
      balance: 0, isSystem: true, company: req.companyId,
    });
  }

  const netSales = (sale.grandTotal || 0) - (sale.taxTotal || 0);
  const fiscalYr = getFiscalYear(new Date());
  const miti = adToBikramSambat(new Date());
  const ref = `RFND-${sale.invoiceNumber}`;

  const refundLines = [];
  refundLines.push({ account: salesReturnAccount._id, debit: netSales, credit: 0 });
  if ((sale.taxTotal || 0) > 0 && vatAccount) refundLines.push({ account: vatAccount._id, debit: sale.taxTotal, credit: 0 });

  if (sale.paymentMethod === 'split' && sale.paymentSplits && sale.paymentSplits.length > 0) {
    for (const split of sale.paymentSplits) {
      if (split.amount <= 0) continue;
      if (split.method === 'cash') {
        refundLines.push({ account: cashAccount._id, debit: 0, credit: split.amount });
      } else if (split.method === 'qr' || split.method === 'bank') {
        refundLines.push({ account: bankAccount._id, debit: 0, credit: split.amount, bank: split.bank || null });
        if (split.bank) await adjustBankBalance(split.bank, -split.amount, req.companyFilter).catch(() => {});
      } else if (split.method === 'credit' && sale.customer) {
        const cd = await Customer.findOne({ _id: sale.customer, ...req.companyFilter }).lean();
        if (cd) {
          const car = await findOrCreateCustomerReceivable(req.companyId, req.companyFilter, cd);
          refundLines.push({ account: car._id, debit: 0, credit: split.amount });
        }
      }
    }
  } else if (sale.paymentMethod === 'credit' && sale.customer) {
    const cd = await Customer.findOne({ _id: sale.customer, ...req.companyFilter }).lean();
    if (cd) {
      const car = await findOrCreateCustomerReceivable(req.companyId, req.companyFilter, cd);
      const outstanding = Math.max(0, (sale.grandTotal || 0) - (sale.amountPaid || 0));
      refundLines.push({ account: car._id, debit: 0, credit: outstanding });
    }
  } else if (sale.paymentMethod === 'qr' || sale.paymentMethod === 'bank') {
    refundLines.push({ account: bankAccount._id, debit: 0, credit: sale.grandTotal, bank: sale.bank || null });
    if (sale.bank) await adjustBankBalance(sale.bank, -sale.grandTotal, req.companyFilter).catch(() => {});
  } else {
    refundLines.push({ account: cashAccount._id, debit: 0, credit: sale.grandTotal });
  }

  await postJournalEntryAtomic({
    companyId: req.companyId, date: new Date(), reference: ref,
    description: `Refund ${sale.invoiceNumber}: ${remark}`, lines: refundLines,
    createdBy: req.user._id, fiscalYear: fiscalYr, fiscalYearId: sale.fiscalYearId || req.fiscalYearId || undefined, miti, companyFilter: req.companyFilter,
    daybook: {
      date: new Date(), sourceModule: 'SALES_RETURN', daybookType: 'SALES_RETURNS', documentNumber: ref, sourceRef: String(sale._id),
      narration: `Refund ${sale.invoiceNumber}: ${remark}`,
      lines: refundLines.map(l => ({ account: l.account, accountName: '', debit: l.debit, credit: l.credit, partyType: sale.customer ? 'customer' : 'none', partyId: sale.customer || null, partyName: '' })),
      createdBy: req.user._id, terminalIp: getClientIp(req),
    },
  });

  if (inventoryAccount && cogsAccount) {
    let totalCost = 0;
    for (const item of sale.items) totalCost += (item.costPrice || 0) * item.quantity;
    if (totalCost > 0) {
      await postJournalEntryAtomic({
        companyId: req.companyId, date: new Date(), reference: ref,
        description: `Inventory restock for refund ${sale.invoiceNumber}`,
        lines: [
          { account: inventoryAccount._id, debit: totalCost, credit: 0 },
          { account: cogsAccount._id, debit: 0, credit: totalCost },
        ],
        createdBy: req.user._id, fiscalYear: fiscalYr, fiscalYearId: sale.fiscalYearId || req.fiscalYearId || undefined, miti, companyFilter: req.companyFilter,
      });
    }
  }
}

router.get('/', protect, async (req, res) => {
  const filter = { ...req.fyFilter, ...req.companyFilter };
  if (req.query.startDate) filter.createdAt = { $gte: new Date(req.query.startDate) };
  if (req.query.endDate) {
    filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.endDate) };
  }
  const items = await Sale.find(filter)
    .populate('customer', 'name phone pan address')
    .populate('cashier', 'name')
    .populate('items.product', 'name sku')
    .sort({ createdAt: -1 });
  res.json(items);
});

router.get('/exists', protect, async (req, res) => {
  const { invoiceNumber } = req.query;
  if (!invoiceNumber) return res.json({ exists: false });
  const exists = await Sale.exists({ invoiceNumber: String(invoiceNumber).trim(), ...req.companyFilter });
  res.json({ exists: !!exists });
});

router.get('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid ID' });
  const item = await Sale.findOne({ _id: req.params.id, ...req.companyFilter })
    .populate('customer', 'name phone pan address')
    .populate('cashier', 'name')
    .populate('items.product');
  res.json(item);
});

router.post('/', protect, requirePANForLargeTx, async (req, res) => {
  const { items, subtotal, taxTotal, discount, extraCharge, grandTotal, amountPaid, change, paymentMethod, paymentSplits, customer, bank, invoiceNumber, date, notes, images, source, inclusiveVat } = req.body;

  const totalPaid = paymentMethod === 'split' && paymentSplits?.length
    ? paymentSplits.reduce((s, sp) => s + (sp.amount || 0), 0)
    : (amountPaid || 0);
  const dueAmount = Math.round(Math.max(0, grandTotal - totalPaid) * 100) / 100;
  const paymentStatus = dueAmount <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

  for (const item of items) {
    const product = await Product.findOne({ _id: item.product, ...req.companyFilter });
    if (!product || product.stock < item.quantity) {
      return res.status(400).json({ message: `Insufficient stock for ${product?.name || 'item'}` });
    }
  }

  let invNo;
  if (invoiceNumber && String(invoiceNumber).trim()) {
    invNo = String(invoiceNumber).trim();
    const existing = await Sale.findOne({ invoiceNumber: invNo, company: req.companyId });
    if (existing) return res.status(400).json({ message: `Invoice number ${invNo} already exists` });
  }
  let customerPan = '', customerAddress = '';
  let customerDoc = null;
  let customerId = null;
  if (customer) {
    // Try to use as ObjectId (24 hex characters)
    if (typeof customer === 'string' && customer.length === 24) {
      customerId = customer;
    }
    // Try to find customer by ID or name
    const custQuery = typeof customer === 'string' && customer.length !== 24 
      ? { name: customer } 
      : { _id: customer };
    const cust = await Customer.findOne(custQuery, null, { company: req.companyFilter });
    if (cust) { 
      customerId = cust._id.toString(); 
      customerPan = cust.pan || ''; 
      customerAddress = cust.address || ''; 
      customerDoc = cust; 
    }
  }

  let sale;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!invNo) {
      try {
        invNo = await generateInvoice(req.companyId);
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
    }
    try {
      sale = await Sale.create({
        invoiceNumber: invNo,
        items, subtotal, taxTotal, discount, extraCharge, grandTotal,
        amountPaid: totalPaid, dueAmount, paymentStatus, change, paymentMethod,
        paymentSplits: paymentMethod === 'split' ? ((paymentSplits || []).filter(sp => sp.amount > 0).map(sp => ({ method: sp.method, amount: Math.round((sp.amount || 0) * 100) / 100, bank: ((sp.method || '') === 'qr' || sp.method === 'bank') ? (sp.bank || null) : null }))) : [],
        customer: customerId || null,
        bank: (paymentMethod === 'qr' || paymentMethod === 'bank') ? (bank || null) : null,
        customerPan, customerAddress,
        cashier: req.user._id, company: req.companyId,
        invoiceDate: date || undefined,
        notes, images: images || [],
        fiscalYear: getFiscalYearLabel(date || new Date()),
        fiscalYearId: req.fiscalYearId || undefined,
        inclusiveVat: !!inclusiveVat,
      });
      break;
    } catch (err) {
      if (err.code === 11000 && !invoiceNumber && attempt < 4) {
        invNo = undefined;
        continue;
      }
      return res.status(400).json({ message: err.message || 'Failed to create sale' });
    }
  }

  for (const item of items) {
    const product = await Product.findOne({ _id: item.product, ...req.companyFilter });
    product.stock -= item.quantity;
    await product.save();
    await InventoryMovement.create({
      product: product._id, type: 'out', quantity: -item.quantity,
      reference: sale.invoiceNumber, note: 'POS Sale', createdBy: req.user._id, company: req.companyId,
      date: sale.invoiceDate || undefined, fiscalYearId: sale.fiscalYearId || req.fiscalYearId || undefined,
    });
  }

  try {
    await postSaleJournalEntry(sale, items, req, { customerDoc, customerPan, source });
  } catch (err) {
    console.error('Journal entry error:', err.message);
  }

  res.status(201).json(sale);
  createNotification({ type: 'sale', title: 'New Sale', message: `Invoice ${sale.invoiceNumber} created for Rs. ${grandTotal}`, reference: sale.invoiceNumber, amount: grandTotal, companyId: req.companyId, userId: req.user._id });
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, ...req.companyFilter });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.status === 'refunded') return res.status(400).json({ message: 'Cannot edit a refunded sale' });

    const { items: newItems, subtotal, taxTotal, discount, extraCharge, grandTotal, amountPaid, paymentMethod, paymentSplits, customer, bank, date, notes, inclusiveVat } = req.body;

    if (newItems && Array.isArray(newItems)) {
      for (const item of sale.items) {
        const product = await Product.findOne({ _id: item.product, ...req.companyFilter });
        if (product) {
          product.stock = Math.round((product.stock + item.quantity) * 100) / 100;
          await product.save();
        }
      }
      for (const item of newItems) {
        const product = await Product.findOne({ _id: item.product, ...req.companyFilter });
        if (!product) return res.status(400).json({ message: `Product not found: ${item.product}` });
        if (product.stock < item.quantity) return res.status(400).json({ message: `Insufficient stock for ${product.name}. Available: ${product.stock}` });
        product.stock = Math.round((product.stock - item.quantity) * 100) / 100;
        await product.save();
        await InventoryMovement.create({
          product: product._id, type: 'out', quantity: -item.quantity,
          reference: sale.invoiceNumber, note: 'Sale edit', createdBy: req.user._id, company: req.companyId,
          date: date || sale.invoiceDate || undefined, fiscalYearId: sale.fiscalYearId || req.fiscalYearId || undefined,
        });
      }
      sale.items = newItems;
    }

    if (subtotal !== undefined) sale.subtotal = subtotal;
    if (taxTotal !== undefined) sale.taxTotal = taxTotal;
    if (discount !== undefined) sale.discount = discount;
    if (extraCharge !== undefined) sale.extraCharge = extraCharge;
    if (grandTotal !== undefined) sale.grandTotal = grandTotal;
    if (amountPaid !== undefined) sale.amountPaid = amountPaid;
    if (paymentMethod) sale.paymentMethod = paymentMethod;
     if (paymentSplits) sale.paymentSplits = (paymentSplits || []).filter(sp => sp.amount > 0).map(sp => ({ method: sp.method, amount: Math.round((sp.amount || 0) * 100) / 100, bank: ((sp.method || '') === 'qr' || sp.method === 'bank') ? (sp.bank || null) : null }));
    if (bank !== undefined) sale.bank = bank;
    if (notes !== undefined) sale.notes = notes;
    if (inclusiveVat !== undefined) sale.inclusiveVat = !!inclusiveVat;
    if (date) sale.invoiceDate = new Date(date);
    if (customer !== undefined) {
      // Convert customer to proper ObjectId
      let customerId = null;
      if (customer) {
        if (typeof customer === 'string' && customer.length === 24) {
          customerId = customer;
        }
        const custQuery = typeof customer === 'string' && customer.length !== 24
          ? { name: customer }
          : { _id: customer };
        const cust = await Customer.findOne(custQuery, null, { company: req.companyFilter });
        if (cust) { 
          customerId = cust._id.toString(); 
          sale.customerPan = cust.pan || ''; 
          sale.customerAddress = cust.address || ''; 
        }
      }
      sale.customer = customerId || null;
    }
    const editTotalPaid = sale.paymentMethod === 'split' && sale.paymentSplits?.length
      ? sale.paymentSplits.reduce((s, sp) => s + (sp.amount || 0), 0)
      : (sale.amountPaid || 0);
    sale.dueAmount = Math.round(Math.max(0, sale.grandTotal - editTotalPaid) * 100) / 100;
    sale.paymentStatus = sale.dueAmount <= 0 ? 'paid' : editTotalPaid > 0 ? 'partial' : 'unpaid';
    await sale.save();

    try {
      const originals = await JournalEntry.find({ reference: sale.invoiceNumber, ...req.companyFilter });
      for (const je of originals) {
        for (const line of je.lines) {
          if (line.account) {
            const acc = await Account.findOne({ _id: line.account, ...req.companyFilter }).select('type');
            const isCreditNormal = acc && ['liability', 'equity', 'income', 'contra_expense'].includes(acc.type);
            const delta = isCreditNormal ? (line.debit - line.credit) : (line.credit - line.debit);
            await Account.findOneAndUpdate({ _id: line.account, ...req.companyFilter }, { $inc: { balance: delta } });
          }
        }
        await JournalEntry.deleteOne({ _id: je._id });
      }
      await cancelDaybookEntries({
        companyId: req.companyId,
        sourceModule: 'SALES_INVOICE',
        documentNumber: sale.invoiceNumber,
        createdBy: req.user._id,
        reason: 'Sale edited',
      });
    } catch (err) { console.error('Sale JE reversal error:', err.message); }

    let customerDoc = null;
    if (sale.customer) customerDoc = await Customer.findOne({ _id: sale.customer, ...req.companyFilter });

    try {
      await postSaleJournalEntry(sale, sale.items, req, { customerDoc, source: 'edit' });
    } catch (err) { console.error('Sale re-post journal error:', err.message); }

    if (sale.paymentMethod !== 'credit' && sale.amountPaid > 0) {
      try {
        const customerAr = customerDoc ? await findOrCreateCustomerReceivable(req.companyId, req.companyFilter, customerDoc) : null;
        const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
        const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });

        if (customerAr) {
          const payLines = [];
          if (sale.paymentMethod === 'split' && sale.paymentSplits?.length) {
            for (const split of sale.paymentSplits) {
              if (split.amount <= 0) continue;
              if (split.method === 'cash') payLines.push({ account: cashAccount._id, debit: split.amount, credit: 0 });
              else if (split.method === 'qr' || split.method === 'bank') {
                payLines.push({ account: bankAccount._id, debit: split.amount, credit: 0, bank: split.bank || null });
                if (split.bank) await adjustBankBalance(split.bank, split.amount, req.companyFilter).catch(() => {});
              } else continue;
              payLines.push({ account: customerAr._id, debit: 0, credit: split.amount });
              await postJournalEntryAtomic({
                companyId: req.companyId, date: sale.invoiceDate || new Date(), reference: sale.invoiceNumber,
                description: `Payment - ${split.method} for ${sale.invoiceNumber} (edit)`,
                lines: payLines, createdBy: req.user._id, fiscalYear: getFiscalYear(sale.invoiceDate || new Date()),
                fiscalYearId: sale.fiscalYearId || req.fiscalYearId || undefined, miti: adToBikramSambat(sale.invoiceDate || new Date()),
                companyFilter: req.companyFilter,
                daybook: { date: sale.invoiceDate || new Date(), sourceModule: 'PAYMENT_IN', daybookType: 'CASH_BOOK', documentNumber: sale.invoiceNumber, sourceRef: String(sale._id),
                  narration: `Payment ${split.method} (edit)`, lines: payLines.map(l => ({ ...l, accountName: '', partyType: 'none', partyId: null, partyName: '' })),
                  createdBy: req.user._id, terminalIp: getClientIp(req) },
              });
              payLines.length = 0;
            }
          } else {
            payLines.push({ account: (sale.paymentMethod === 'qr' || sale.paymentMethod === 'bank') ? bankAccount._id : cashAccount._id, debit: sale.amountPaid, credit: 0 });
            payLines.push({ account: customerAr._id, debit: 0, credit: sale.amountPaid });
            await postJournalEntryAtomic({
              companyId: req.companyId, date: sale.invoiceDate || new Date(), reference: sale.invoiceNumber,
              description: `Payment - ${sale.paymentMethod} for ${sale.invoiceNumber} (edit)`,
              lines: payLines, createdBy: req.user._id, fiscalYear: getFiscalYear(sale.invoiceDate || new Date()),
              fiscalYearId: sale.fiscalYearId || req.fiscalYearId || undefined, miti: adToBikramSambat(sale.invoiceDate || new Date()),
              companyFilter: req.companyFilter,
              daybook: { date: sale.invoiceDate || new Date(), sourceModule: 'PAYMENT_IN', daybookType: 'CASH_BOOK', documentNumber: sale.invoiceNumber, sourceRef: String(sale._id),
                narration: `Payment ${sale.paymentMethod} (edit)`, lines: payLines.map(l => ({ ...l, accountName: '', partyType: 'none', partyId: null, partyName: '' })),
                createdBy: req.user._id, terminalIp: getClientIp(req) },
            });
            if (sale.paymentMethod !== 'cash' && sale.bank) await adjustBankBalance(sale.bank, sale.amountPaid, req.companyFilter).catch(() => {});
          }
        }
      } catch (err) { console.error('Sale payment re-post error:', err.message); }
    }

    const updated = await Sale.findOne({ _id: sale._id, ...req.companyFilter }).populate('customer cashier').populate('items.product');
    res.json(updated);
  } catch (err) {
    console.error('Sale edit error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/search', protect, async (req, res) => {
  const filter = { ...req.companyFilter };
  if (req.query.q) filter.invoiceNumber = { $regex: req.query.q, $options: 'i' };
  const sales = await Sale.find(filter).select('invoiceNumber grandTotal createdAt paymentMethod status').limit(10).sort({ createdAt: -1 });
  res.json(sales);
});

router.get('/search/:invoiceNumber', protect, async (req, res) => {
  const sale = await Sale.findOne({ invoiceNumber: req.params.invoiceNumber, ...req.companyFilter })
    .populate('customer', 'name phone')
    .populate('items.product', 'name sku');
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  res.json(sale);
});

router.post('/refund-by-invoice', protect, adminOnly, async (req, res) => {
  const { invoiceNumber, remark } = req.body;
  if (!invoiceNumber) return res.status(400).json({ message: 'Invoice number required' });
  if (!remark?.trim()) return res.status(400).json({ message: 'Refund reason/remark is required' });
  const sale = await Sale.findOne({ invoiceNumber, ...req.companyFilter });
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  if (sale.status === 'refunded') return res.status(400).json({ message: 'Sale already refunded' });
  let dnNumber;
  try { dnNumber = await generateDebitNote(req.companyId); } catch (e) { dnNumber = `DN-${invoiceNumber}`; }
  sale.status = 'refunded';
  sale.refundRemark = remark;
  sale.amountPaid = sale.grandTotal;
  sale.dueAmount = 0;
  sale.debitNoteNumber = dnNumber;
  sale.debitNoteDate = new Date();
  await sale.save();
  for (const item of sale.items) {
    const product = await Product.findOne({ _id: item.product, ...req.companyFilter });
    if (product) {
      product.stock += item.quantity;
      await product.save();
      await InventoryMovement.create({
        product: product._id, type: 'sales_return', quantity: item.quantity,
        reference: sale.invoiceNumber, note: 'Sales return', createdBy: req.user._id, company: req.companyId,
        date: sale.invoiceDate || undefined, fiscalYearId: sale.fiscalYearId || req.fiscalYearId || undefined,
      });
    }
  }
  try {
    await postRefundJournalEntry(sale, req, { remark });
  } catch (err) { console.error('Refund reversal error:', err.message); }
  res.json(sale);
});

router.post('/:id/refund', protect, adminOnly, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid sale ID' });
  const { remark } = req.body;
  if (!remark?.trim()) return res.status(400).json({ message: 'Refund reason/remark is required' });
  const sale = await Sale.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  if (sale.status === 'refunded') return res.status(400).json({ message: 'Sale already refunded' });
  let dnNumber;
  try { dnNumber = await generateDebitNote(req.companyId); } catch (e) { dnNumber = `DN-${sale.invoiceNumber}`; }
  sale.status = 'refunded';
  sale.refundRemark = remark;
  sale.amountPaid = sale.grandTotal;
  sale.dueAmount = 0;
  sale.debitNoteNumber = dnNumber;
  sale.debitNoteDate = new Date();
  await sale.save();
  for (const item of sale.items) {
    const product = await Product.findOne({ _id: item.product, ...req.companyFilter });
    if (product) {
      product.stock += item.quantity;
      await product.save();
      await InventoryMovement.create({
        product: product._id, type: 'sales_return', quantity: item.quantity,
        reference: sale.invoiceNumber, note: 'Sales return', createdBy: req.user._id, company: req.companyId,
        date: sale.invoiceDate || undefined, fiscalYearId: sale.fiscalYearId || req.fiscalYearId || undefined,
      });
    }
  }
  try {
    await postRefundJournalEntry(sale, req, { remark });
  } catch (err) { console.error('Refund reversal error:', err.message); }
  res.json(sale);
});

module.exports = router;
