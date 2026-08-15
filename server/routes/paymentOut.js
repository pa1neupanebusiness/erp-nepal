const express = require('express');
const PaymentOut = require('../models/PaymentOut');
const Purchase = require('../models/Purchase');
const Supplier = require('../models/Supplier');
const Account = require('../models/Account');
const { findOrCreateSupplierPayable, findOrCreateSupplierAdvance } = require('../utils/supplierPayable');
const { protect, adminOnly } = require('../middleware/auth');
const { adToBikramSambat } = require('../utils/dateUtils');
const { adjustBankBalance } = require('../utils/bankService');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { createNotification } = require('../utils/notifyService');
const { postDaybookEntries, cancelDaybookEntries } = require('../utils/daybookService');
const { getClientIp } = require('../utils/irdAudit');
const router = express.Router();

function getFiscalYear(date) {
  const d = new Date(date);
  const m = d.getMonth() + 1, y = d.getFullYear(), dy = d.getDate();
  if (m > 7 || (m === 7 && dy >= 16)) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

async function generatePaymentNo(req) {
  const year = new Date().getFullYear();
  const count = await PaymentOut.countDocuments({ company: req.companyId }) + 1;
  return `PMT-${year}-${String(count).padStart(5, '0')}`;
}

const populateBase = [
  { path: 'supplier', select: 'name' },
  { path: 'bank', select: 'name' },
  { path: 'allocations.purchase', select: 'purchaseNumber date grandTotal paidAmount dueAmount' },
  { path: 'createdBy', select: 'name' },
];

router.get('/', protect, async (req, res) => {
  const filter = { ...req.fyFilter, ...req.companyFilter };
  if (req.query.supplier) filter.supplier = req.query.supplier;
  if (req.query.startDate) filter.date = { $gte: new Date(req.query.startDate) };
  if (req.query.endDate) filter.date = { ...filter.date, $lte: new Date(req.query.endDate) };
  const items = await PaymentOut.find(filter).populate(populateBase).sort({ date: -1 });
  res.json(items);
});

router.get('/:id', protect, async (req, res) => {
  const item = await PaymentOut.findOne({ _id: req.params.id, ...req.companyFilter }).populate(populateBase);
  res.json(item);
});

router.post('/', protect, adminOnly, async (req, res) => {
  const { date, supplier, amount, method, bank, chequeNumber, reference, remarks } = req.body;
  if (!supplier) return res.status(400).json({ message: 'Supplier is required' });
  const amt = Math.round(parseFloat(amount || 0) * 100) / 100;
  if (!(amt > 0)) return res.status(400).json({ message: 'Payment amount must be greater than zero' });
  if ((method === 'bank' || method === 'qr') && !chequeNumber && method !== 'qr') {
    return res.status(400).json({ message: 'Cheque number required for bank payment' });
  }
  if (method !== 'cash' && !bank) return res.status(400).json({ message: 'Bank is required for bank payment' });

  // Oldest-due-first FIFO allocation against open purchase invoices.
  // Overpayment (or payment with no open dues) becomes an advance for the supplier.
  const purchases = await Purchase.find({ supplier, dueAmount: { $gt: 0 }, status: 'received', ...req.companyFilter }).sort({ date: 1 });
  const totalDue = purchases.reduce((s, p) => s + p.dueAmount, 0);

  const allocations = [];
  let remaining = amt;
  let allocatedToDue = 0;
  for (const purchase of purchases) {
    if (remaining <= 0) break;
    const payAgainst = Math.min(remaining, purchase.dueAmount);
    purchase.paidAmount = (purchase.paidAmount || 0) + payAgainst;
    purchase.dueAmount = Math.round((purchase.dueAmount - payAgainst) * 100) / 100;
    purchase.paymentMethod = method || 'cash';
    if (chequeNumber) purchase.chequeNumber = chequeNumber;
    if (remarks) purchase.paymentRemarks = remarks;
    await purchase.save();
    allocations.push({ purchase: purchase._id, amount: payAgainst });
    allocatedToDue = Math.round((allocatedToDue + payAgainst) * 100) / 100;
    remaining = Math.round((remaining - payAgainst) * 100) / 100;
  }
  const advanceAmount = Math.round((amt - allocatedToDue) * 100) / 100;
  let advanceAccount = null;
  if (advanceAmount > 0) {
    advanceAccount = await findOrCreateSupplierAdvance(req.companyId, req.companyFilter);
    await Supplier.findOneAndUpdate({ _id: supplier, ...req.companyFilter }, { $inc: { advanceBalance: advanceAmount } });
  }

  const paymentDate = date || new Date();
  const payment = await PaymentOut.create({
    paymentNumber: await generatePaymentNo(req),
    date: paymentDate, miti: adToBikramSambat(new Date(paymentDate)) || '',
    fiscalYear: getFiscalYear(paymentDate),
    supplier, amount: amt, method: method || 'cash',
    bank: bank || null, chequeNumber: chequeNumber || '', reference, remarks,
    allocations, advanceAmount, advanceAccount: advanceAccount ? advanceAccount._id : null,
    createdBy: req.user._id, company: req.companyId,
    fiscalYearId: req.fiscalYearId || undefined,
  });

  try {
    const payableAccount = await findOrCreateSupplierPayable(req.companyId, req.companyFilter, supplier);
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const acct = method === 'cash' ? cashAccount : bankAccount;
    if (payableAccount && acct) {
      const supplierDoc = supplier ? await Supplier.findOne({ _id: supplier, ...req.companyFilter }).select('name') : null;
      const supplierRef = supplierDoc ? supplierDoc.name : '';
      const lines = [];
      const dayLines = [];
      if (allocatedToDue > 0) {
        lines.push({ account: payableAccount._id, debit: allocatedToDue, credit: 0, subLedger: { supplier } });
        dayLines.push({ account: payableAccount._id, accountName: payableAccount.name || 'Accounts Payable', debit: allocatedToDue, credit: 0, partyType: 'supplier', partyId: supplier, partyName: supplierRef });
      }
      if (advanceAccount) {
        lines.push({ account: advanceAccount._id, debit: advanceAmount, credit: 0, subLedger: { supplier } });
        dayLines.push({ account: advanceAccount._id, accountName: advanceAccount.name || 'Advance to Supplier', debit: advanceAmount, credit: 0, partyType: 'supplier', partyId: supplier, partyName: supplierRef });
      }
      lines.push({ account: acct._id, debit: 0, credit: amt, bank: method === 'cash' ? null : (bank || null) });
      dayLines.push({ account: acct._id, accountName: acct.name || 'Cash (Teji/Nagad)', debit: 0, credit: amt });
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: paymentDate,
        reference: payment.paymentNumber,
        description: `Payment out - supplier${supplierRef ? ' ' + supplierRef : ''}${advanceAmount > 0 ? ' (incl. advance ' + advanceAmount.toFixed(2) + ')' : ''}${chequeNumber ? ' (Chq: ' + chequeNumber + ')' : ''}${remarks ? ' | ' + remarks : ''}`,
        lines,
        createdBy: req.user._id,
        fiscalYear: payment.fiscalYear,
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(paymentDate),
        companyFilter: req.companyFilter,
        daybook: {
          date: paymentDate,
          sourceModule: 'PAYMENT_OUT',
          daybookType: 'CASH_BOOK',
          documentNumber: payment.paymentNumber,
          sourceRef: String(payment._id),
          narration: `Payment out - supplier${supplierRef ? ' ' + supplierRef : ''}${advanceAmount > 0 ? ' (incl. advance ' + advanceAmount.toFixed(2) + ')' : ''}${chequeNumber ? ' (Chq: ' + chequeNumber + ')' : ''}`,
          lines: dayLines,
          createdBy: req.user._id,
          terminalIp: getClientIp(req),
        },
      });
      if (method !== 'cash' && bank) await adjustBankBalance(bank, -amt, req.companyFilter).catch(() => {});
    }
  } catch (err) { console.error('Payment out journal error:', err.message); }

  const populated = await PaymentOut.findOne({ _id: payment._id, ...req.companyFilter }).populate(populateBase);
  res.status(201).json(populated);
  createNotification({ type: 'payment_out', title: 'Payment Made', message: `Rs. ${amt} paid to supplier`, reference: populated.paymentNumber, amount: amt, companyId: req.companyId, userId: req.user._id });
});

router.post('/:id/cancel', protect, adminOnly, async (req, res) => {
  const payment = await PaymentOut.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  if (payment.status === 'cancelled') return res.status(400).json({ message: 'Payment already cancelled' });

  // Reverse the allocations: restore the supplier dues.
  for (const alloc of payment.allocations || []) {
    const purchase = await Purchase.findOne({ _id: alloc.purchase, ...req.companyFilter });
    if (purchase) {
      purchase.paidAmount = Math.max(0, (purchase.paidAmount || 0) - alloc.amount);
      purchase.dueAmount = Math.round((purchase.dueAmount + alloc.amount) * 100) / 100;
      await purchase.save();
    }
  }

  try {
    const payableAccount = await findOrCreateSupplierPayable(req.companyId, req.companyFilter, payment.supplier);
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const acct = payment.method === 'cash' ? cashAccount : bankAccount;
    const allocatedToDue = (payment.allocations || []).reduce((s, a) => s + (a.amount || 0), 0);
    const advanceAmount = payment.advanceAmount || 0;
    if (payableAccount && acct) {
      const cancelLines = [
        { account: acct._id, debit: payment.amount, credit: 0, bank: payment.method === 'cash' ? null : payment.bank },
      ];
      if (allocatedToDue > 0) cancelLines.push({ account: payableAccount._id, debit: 0, credit: allocatedToDue, subLedger: { supplier: payment.supplier } });
      if (advanceAmount > 0 && payment.advanceAccount) cancelLines.push({ account: payment.advanceAccount, debit: 0, credit: advanceAmount, subLedger: { supplier: payment.supplier } });
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(),
        reference: `CNCL-${payment.paymentNumber}`,
        description: `Cancellation of payment ${payment.paymentNumber}`,
        lines: cancelLines,
        createdBy: req.user._id,
        fiscalYear: payment.fiscalYear,
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        companyFilter: req.companyFilter,
      });
      if (payment.method !== 'cash' && payment.bank) await adjustBankBalance(payment.bank, payment.amount, req.companyFilter).catch(() => {});
    }
    if (advanceAmount > 0) {
      await Supplier.findOneAndUpdate({ _id: payment.supplier, ...req.companyFilter }, { $inc: { advanceBalance: -advanceAmount } });
    }
  } catch (err) { console.error('Payment out cancel journal error:', err.message); }

  payment.status = 'cancelled';
  await payment.save();

  try {
    await cancelDaybookEntries({
      companyId: req.companyId,
      sourceModule: 'PAYMENT_OUT',
      documentNumber: payment.paymentNumber,
      createdBy: req.user._id,
    });
  } catch (err) { console.error('Payment out cancel daybook hook error:', err.message); }

  res.json(payment);
});

module.exports = router;
