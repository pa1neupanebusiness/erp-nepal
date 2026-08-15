const express = require('express');
const Voucher = require('../models/Voucher');
const Company = require('../models/Company');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const { protect } = require('../middleware/auth');
const router = express.Router();

function getFiscalYear(date) {
  const d = new Date(date);
  const m = d.getMonth() + 1, y = d.getFullYear(), dy = d.getDate();
  if (m > 7 || (m === 7 && dy >= 16)) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

function getFyLabel(date) {
  const d = new Date(date);
  const m = d.getMonth() + 1, y = d.getFullYear(), dy = d.getDate();
  const startYear = (m > 7 || (m === 7 && dy >= 16)) ? y : y - 1;
  return `${startYear % 100}/${(startYear + 1) % 100}`;
}

async function generateVoucherNo(companyId, type) {
  if (!companyId) throw new Error('No company assigned');
  const fy = getFyLabel(new Date());
  const prefix = { payment: 'PMT', receipt: 'RCT', contra: 'CTR', journal: 'JVR' }[type] || 'VCH';
  for (let i = 0; i < 10; i++) {
    const company = await Company.findOneAndUpdate(
      { _id: companyId },
      { $inc: { voucherCounter: 1 } },
      { new: true }
    );
    if (!company) throw new Error('No company assigned');
    const num = String(company.voucherCounter).padStart(4, '0');
    const no = `${prefix}-${fy}-${num}`;
    const exists = await Voucher.exists({ voucherNumber: no, company: companyId });
    if (!exists) return no;
  }
  throw new Error('Could not generate voucher number');
}

router.get('/', protect, async (req, res) => {
  const filter = { ...req.fyFilter, ...req.companyFilter };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.startDate) filter.date = { $gte: new Date(req.query.startDate) };
  if (req.query.endDate) filter.date = { ...filter.date, $lte: new Date(req.query.endDate) };
  const items = await Voucher.find(filter).populate('account', 'code name').populate('createdBy', 'name').sort({ date: -1 });
  res.json(items);
});

router.post('/', protect, async (req, res) => {
  const { type, date, account, amount, paymentMethod, reference, description, payments } = req.body;

  let splitPayments;
  if (Array.isArray(payments) && payments.length > 0) {
    splitPayments = payments
      .filter(p => p && p.method && parseFloat(p.amount) > 0)
      .map(p => ({ method: p.method, amount: Math.round(parseFloat(p.amount) * 100) / 100 }));
  }
  if (!splitPayments || splitPayments.length === 0) {
    splitPayments = [{ method: paymentMethod || 'cash', amount: Math.round(parseFloat(amount || 0) * 100) / 100 }];
  }
  const total = splitPayments.reduce((s, p) => s + p.amount, 0);
  if (!(total > 0)) return res.status(400).json({ message: 'Voucher amount must be greater than zero' });

  const accountDoc = await Account.findOne({ _id: account, ...req.companyFilter });
  if (!accountDoc) return res.status(400).json({ message: 'Account not found' });

  const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
  const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
  const methodAccount = (method) => (method === 'cash' ? cashAccount?._id : bankAccount?._id);
  if (splitPayments.some(p => !methodAccount(p.method))) {
    return res.status(400).json({ message: 'Cash (10100) and Bank (10200) accounts must be configured before recording this voucher' });
  }

  let voucherNumber = req.body.voucherNumber ? String(req.body.voucherNumber).trim() : '';
  if (voucherNumber) {
    const existing = await Voucher.findOne({ voucherNumber, company: req.companyId });
    if (existing) return res.status(400).json({ message: 'Voucher number already exists' });
  } else {
    voucherNumber = await generateVoucherNo(req.companyId, type);
  }

  const voucher = await Voucher.create({
    voucherNumber,
    type, date, account, amount: total, paymentMethod: splitPayments[0]?.method || 'cash',
    payments: splitPayments, reference, description,
    fiscalYear: getFiscalYear(date || new Date()),
    createdBy: req.user._id, company: req.companyId,
  });

  const lines = [];
  if (type === 'receipt') {
    for (const p of splitPayments) {
      lines.push({ account: methodAccount(p.method), debit: p.amount, credit: 0 });
    }
    lines.push({ account: accountDoc._id, debit: 0, credit: total });
  } else if (type === 'payment') {
    lines.push({ account: accountDoc._id, debit: total, credit: 0 });
    for (const p of splitPayments) {
      lines.push({ account: methodAccount(p.method), debit: 0, credit: p.amount });
    }
  }

  if (lines.length > 0) {
    try {
      const { postJournalEntryAtomic } = require('../utils/postingEngine');
      const { adToBikramSambat } = require('../utils/dateUtils');
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: date || new Date(),
        reference: voucher.voucherNumber,
        description: `[Voucher] ${description}`,
        lines,
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(date || new Date()),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date(date || new Date())),
        companyFilter: req.companyFilter,
      });
    } catch (err) {
      console.error('Voucher journal entry error:', err.message);
      await Voucher.findOneAndUpdate({ _id: voucher._id }, { status: 'cancelled' });
      return res.status(500).json({ message: `Voucher saved but could not post to ledger: ${err.message}` });
    }
  }

  const populated = await Voucher.findOne({ _id: voucher._id, ...req.companyFilter }).populate('account', 'code name').populate('createdBy', 'name');
  res.status(201).json(populated);
});

router.put('/:id/cancel', protect, async (req, res) => {
  const voucher = await Voucher.findOneAndUpdate({ _id: req.params.id, ...req.companyFilter }, { status: 'cancelled' }, { new: true });
  try {
    const accountDoc = await Account.findOne({ _id: voucher.account, ...req.companyFilter });
    let cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    let bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const splitPayments = voucher.payments?.length
      ? voucher.payments
      : [{ method: voucher.paymentMethod, amount: voucher.amount }];
    const methodAccount = (method) => (method === 'cash' ? cashAccount?._id : bankAccount?._id);
    if (!accountDoc || splitPayments.some(p => !methodAccount(p.method))) {
      return res.status(400).json({ message: 'Cannot reverse: cash/bank/account missing for this company' });
    }
    const lines = [];
    if (voucher.type === 'receipt') {
      for (const p of splitPayments) {
        lines.push({ account: methodAccount(p.method), debit: 0, credit: p.amount });
      }
      lines.push({ account: accountDoc._id, debit: voucher.amount, credit: 0 });
    } else if (voucher.type === 'payment') {
      lines.push({ account: accountDoc._id, debit: 0, credit: voucher.amount });
      for (const p of splitPayments) {
        lines.push({ account: methodAccount(p.method), debit: p.amount, credit: 0 });
      }
    }
    if (lines.length > 0) {
      const { postJournalEntryAtomic } = require('../utils/postingEngine');
      const { adToBikramSambat } = require('../utils/dateUtils');
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(),
        reference: `CNCL-${voucher.voucherNumber}`,
        description: `Cancellation of voucher ${voucher.voucherNumber}`,
        lines,
        createdBy: req.user._id,
        fiscalYear: voucher.fiscalYear,
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        companyFilter: req.companyFilter,
      });
    }
  } catch (err) {
    console.error('Voucher cancel reversal error:', err.message);
    return res.status(500).json({ message: `Voucher cancelled but reversal could not be posted: ${err.message}` });
  }
  res.json(voucher);
});

router.get('/summary', protect, async (req, res) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const payments = await Voucher.find({ type: 'payment', date: { $gte: monthStart }, status: 'active', ...req.companyFilter });
  const receipts = await Voucher.find({ type: 'receipt', date: { $gte: monthStart }, status: 'active', ...req.companyFilter });
  res.json({
    totalPayments: payments.reduce((s, v) => s + v.amount, 0),
    totalReceipts: receipts.reduce((s, v) => s + v.amount, 0),
    netCashFlow: receipts.reduce((s, v) => s + v.amount, 0) - payments.reduce((s, v) => s + v.amount, 0),
  });
});

module.exports = router;
