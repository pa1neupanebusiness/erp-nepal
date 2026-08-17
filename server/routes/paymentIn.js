const express = require('express');
const PaymentIn = require('../models/PaymentIn');
const Sale = require('../models/Sale');
const Emi = require('../models/Emi');
const Customer = require('../models/Customer');
const Account = require('../models/Account');
const Company = require('../models/Company');
const { protect, adminOnly } = require('../middleware/auth');
const { adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const { adjustBankBalance } = require('../utils/bankService');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { createNotification } = require('../utils/notifyService');
const { postDaybookEntries, cancelDaybookEntries } = require('../utils/daybookService');
const { getClientIp } = require('../utils/irdAudit');
const { findOrCreateCustomerReceivable } = require('../utils/customerReceivable');
const { isDayBookClosed } = require('../utils/daybookClosure');
const router = express.Router();

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
}

async function generateReceiptNo(req) {
  const fy = getBSFiscalYear().label;
  const company = await Company.findOneAndUpdate(
    { _id: req.companyId },
    { $inc: { receiptCounter: 1 } },
    { new: true }
  );
  if (!company) throw new Error('No company');
  const num = String(company.receiptCounter || 1).padStart(4, '0');
  return `RCT-${fy}-${num}`;
}

const populateBase = [
  { path: 'customer', select: 'name phone pan' },
  { path: 'bank', select: 'name' },
  { path: 'allocations.sale', select: 'invoiceNumber grandTotal amountPaid' },
  { path: 'allocations.emi', select: 'emiNumber netAmount remainingAmount' },
  { path: 'createdBy', select: 'name' },
];

router.get('/', protect, async (req, res) => {
  const filter = { ...req.fyFilter, ...req.companyFilter };
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.startDate) filter.date = { $gte: new Date(req.query.startDate) };
  if (req.query.endDate) filter.date = { ...filter.date, $lte: new Date(req.query.endDate) };
  const items = await PaymentIn.find(filter).populate(populateBase).sort({ date: -1 });
  res.json(items);
});

router.get('/:id', protect, async (req, res) => {
  const item = await PaymentIn.findOne({ _id: req.params.id, ...req.companyFilter }).populate(populateBase);
  res.json(item);
});

// Open receivables for a customer (credit invoices + EMI balances).
router.get('/outstanding', protect, async (req, res) => {
  const customer = req.query.customerId;
  if (!customer) return res.json({ invoices: [], totalDue: 0, balance: 0 });
  const [sales, emis, Customer, Account] = await Promise.all([
    Sale.find({ customer, status: 'completed', ...req.companyFilter }).select('invoiceNumber grandTotal amountPaid invoiceDate'),
    Emi.find({ customer, remainingAmount: { $gt: 0 }, ...req.companyFilter }).select('emiNumber netAmount remainingAmount product'),
    require('../models/Customer'),
    require('../models/Account'),
  ]);
  const invoices = [
    ...sales.filter(s => (s.grandTotal || 0) - (s.amountPaid || 0) > 0)
      .map(s => ({ type: 'sale', _id: s._id, ref: s.invoiceNumber, date: s.invoiceDate || s.createdAt, total: s.grandTotal, paid: s.amountPaid || 0, due: (s.grandTotal || 0) - (s.amountPaid || 0) })),
    ...emis.map(e => ({ type: 'emi', _id: e._id, ref: e.emiNumber, date: e.createdAt, total: e.netAmount, paid: e.netAmount - e.remainingAmount, due: e.remainingAmount })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  const totalDue = invoices.reduce((s, i) => s + i.due, 0);
  let balance = 0;
  try {
    const cust = await Customer.findOne({ _id: customer, ...req.companyFilter }).select('name');
    if (cust) {
      const arAcc = await Account.findOne({ name: `Accounts Receivable - ${cust.name}`, ...req.companyFilter }).select('balance');
      if (arAcc) balance = arAcc.balance || 0;
    }
  } catch (e) { /* ignore */ }
  res.json({ invoices, totalDue, balance });
});

router.post('/', protect, adminOnly, async (req, res) => {
  const { date, customer, amount, method, bank, chequeNumber, reference, note } = req.body;
  if (!customer) return res.status(400).json({ message: 'Customer is required' });
  const amt = Math.round(parseFloat(amount || 0) * 100) / 100;
  if (!(amt > 0)) return res.status(400).json({ message: 'Receipt amount must be greater than zero' });
  if ((method === 'bank' || method === 'cheque') && !chequeNumber) {
    return res.status(400).json({ message: 'Cheque number required for bank/cheque payments' });
  }

  const [sales, emis] = await Promise.all([
    Sale.find({ customer, status: 'completed', ...req.companyFilter })
      .select('invoiceNumber grandTotal amountPaid')
      .sort({ createdAt: 1 }),
    Emi.find({ customer, remainingAmount: { $gt: 0 }, ...req.companyFilter })
      .select('emiNumber netAmount remainingAmount totalPaid paidStatus')
      .sort({ createdAt: 1 }),
  ]);

  const openSales = sales.filter(s => (s.grandTotal || 0) - (s.amountPaid || 0) > 0);
  const totalDue = openSales.reduce((s, x) => s + ((x.grandTotal || 0) - (x.amountPaid || 0)), 0)
    + emis.reduce((s, x) => s + x.remainingAmount, 0);

  const allocations = [];
  let remaining = amt;

  for (const sale of openSales) {
    if (remaining <= 0) break;
    const due = (sale.grandTotal || 0) - (sale.amountPaid || 0);
    const apply = Math.min(remaining, due);
    sale.amountPaid = Math.round(((sale.amountPaid || 0) + apply) * 100) / 100;
    await sale.save();
    allocations.push({ sale: sale._id, amount: apply });
    remaining = Math.round((remaining - apply) * 100) / 100;
  }

  for (const emi of emis) {
    if (remaining <= 0) break;
    const apply = Math.min(remaining, emi.remainingAmount);
    emi.remainingAmount = Math.round((emi.remainingAmount - apply) * 100) / 100;
    emi.totalPaid = Math.round(((emi.totalPaid || 0) + apply) * 100) / 100;
    emi.paidStatus = emi.remainingAmount <= 0 ? 'completed' : 'partial';
    emi.payments = emi.payments || [];
    emi.payments.push({
      date: date || new Date(), amount: apply, principal: apply, interest: 0,
      method: method || 'cash', reference: reference || '', createdBy: req.user._id,
    });
    await emi.save();
    allocations.push({ emi: emi._id, amount: apply });
    remaining = Math.round((remaining - apply) * 100) / 100;
  }

  // Unallocated remainder is treated as an on-account (advance) receipt.
  const receiptDate = date || new Date();
  const payment = await PaymentIn.create({
    receiptNumber: await generateReceiptNo(req),
    date: receiptDate, miti: adToBikramSambat(new Date(receiptDate)) || '',
    fiscalYear: getFiscalYear(receiptDate),
    customer, amount: amt, method: method || 'cash',
    bank: bank || null, chequeNumber: chequeNumber || '', reference, note,
    allocations, createdBy: req.user._id, company: req.companyId,
    fiscalYearId: req.fiscalYearId || undefined,
  });

  try {
    const customerDoc = await Customer.findOne({ _id: customer, ...req.companyFilter });
    const debtorAccount = await findOrCreateCustomerReceivable(req.companyId, req.companyFilter, customerDoc || null);
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const salesBankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });

    // Calculate amounts for sales vs EMI allocations
    const salesAllocationAmt = allocations.filter(a => a.sale).reduce((s, a) => s + a.amount, 0);
    const emiAllocationAmt = allocations.filter(a => a.emi).reduce((s, a) => s + a.amount, 0);
    const unallocatedAmt = amt - salesAllocationAmt - emiAllocationAmt;

    const journalEntries = [];

    // Create journal entry for sales allocations (uses Sales Bank Account 10200)
    if (salesAllocationAmt > 0 && method !== 'cash') {
      journalEntries.push({
        description: `Payment in - Sales ${reference ? ' | ' + reference : ''}${note ? ' | ' + note : ''}`,
        lines: [
          { account: salesBankAccount._id, debit: salesAllocationAmt, credit: 0, bank: bank || null },
          { account: debtorAccount._id, debit: 0, credit: salesAllocationAmt, subLedger: { customer } },
        ],
        daybook: {
          date: receiptDate,
          sourceModule: 'PAYMENT_IN',
          daybookType: 'CASH_BOOK',
          documentNumber: payment.receiptNumber,
          sourceRef: String(payment._id),
          narration: `Sales payment received from customer${reference ? ' | ' + reference : ''}`,
          lines: [
            { account: salesBankAccount._id, accountName: salesBankAccount.name || 'Sales Bank Account', debit: salesAllocationAmt, credit: 0, partyType: 'customer', partyId: customer, partyName: customerDoc?.name || '' },
            { account: debtorAccount._id, accountName: debtorAccount.name || 'Accounts Receivable', debit: 0, credit: salesAllocationAmt, partyType: 'customer', partyId: customer, partyName: customerDoc?.name || '' },
          ],
        },
      });
    }

    // Create journal entry for EMI allocations (uses Sales Bank Account 10200 - customer pays to company)
    if (emiAllocationAmt > 0) {
      const acct = method === 'cash' ? cashAccount : salesBankAccount;
      journalEntries.push({
        description: `Payment in - EMI ${reference ? ' | ' + reference : ''}${note ? ' | ' + note : ''}`,
        lines: [
          { account: acct._id, debit: emiAllocationAmt, credit: 0, bank: bank || null },
          { account: debtorAccount._id, debit: 0, credit: emiAllocationAmt, subLedger: { customer } },
        ],
        daybook: {
          date: receiptDate,
          sourceModule: 'PAYMENT_IN',
          daybookType: 'CASH_BOOK',
          documentNumber: payment.receiptNumber,
          sourceRef: String(payment._id),
          narration: `EMI payment received from customer${reference ? ' | ' + reference : ''}`,
          lines: [
            { account: acct._id, accountName: method === 'cash' ? 'Cash' : (salesBankAccount.name || 'Sales Bank Account'), debit: emiAllocationAmt, credit: 0, partyType: 'customer', partyId: customer, partyName: customerDoc?.name || '' },
            { account: debtorAccount._id, accountName: debtorAccount.name || 'Accounts Receivable', debit: 0, credit: emiAllocationAmt, partyType: 'customer', partyId: customer, partyName: customerDoc?.name || '' },
          ],
        },
      });
    }

    // Create journal entry for unallocated amount (on-account)
    if (unallocatedAmt > 0 && method !== 'cash') {
      journalEntries.push({
        description: `Payment in - On Account ${reference ? ' | ' + reference : ''}${note ? ' | ' + note : ''}`,
        lines: [
          { account: salesBankAccount._id, debit: unallocatedAmt, credit: 0, bank: bank || null },
          { account: debtorAccount._id, debit: 0, credit: unallocatedAmt, subLedger: { customer } },
        ],
        daybook: {
          date: receiptDate,
          sourceModule: 'PAYMENT_IN',
          daybookType: 'CASH_BOOK',
          documentNumber: payment.receiptNumber,
          sourceRef: String(payment._id),
          narration: `On-account payment received from customer${reference ? ' | ' + reference : ''}`,
          lines: [
            { account: salesBankAccount._id, accountName: salesBankAccount.name || 'Sales Bank Account', debit: unallocatedAmt, credit: 0, partyType: 'customer', partyId: customer, partyName: customerDoc?.name || '' },
            { account: debtorAccount._id, accountName: debtorAccount.name || 'Accounts Receivable', debit: 0, credit: unallocatedAmt, partyType: 'customer', partyId: customer, partyName: customerDoc?.name || '' },
          ],
        },
      });
    }

    // Process all journal entries
    for (const je of journalEntries) {
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: receiptDate,
        reference: payment.receiptNumber,
        description: je.description,
        lines: je.lines,
        createdBy: req.user._id,
        fiscalYear: payment.fiscalYear,
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(receiptDate),
        companyFilter: req.companyFilter,
        daybook: je.daybook,
      });
    }

    // Handle cash payments (single entry for all cash)
    if (method === 'cash' && (salesAllocationAmt + emiAllocationAmt + unallocatedAmt) > 0) {
      const totalCashAmt = salesAllocationAmt + emiAllocationAmt + unallocatedAmt;
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: receiptDate,
        reference: payment.receiptNumber,
        description: `Payment in - Cash ${reference ? ' | ' + reference : ''}${note ? ' | ' + note : ''}`,
        lines: [
          { account: cashAccount._id, debit: amt, credit: 0 },
          { account: debtorAccount._id, debit: 0, credit: amt, subLedger: { customer } },
        ],
        createdBy: req.user._id,
        fiscalYear: payment.fiscalYear,
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(receiptDate),
        companyFilter: req.companyFilter,
        daybook: {
          date: receiptDate,
          sourceModule: 'PAYMENT_IN',
          daybookType: 'CASH_BOOK',
          documentNumber: payment.receiptNumber,
          sourceRef: String(payment._id),
          narration: `Cash payment received from customer${reference ? ' | ' + reference : ''}`,
          lines: [
            { account: cashAccount._id, accountName: cashAccount.name || 'Cash', debit: amt, credit: 0, partyType: 'customer', partyId: customer, partyName: customerDoc?.name || '' },
            { account: debtorAccount._id, accountName: debtorAccount.name || 'Accounts Receivable', debit: 0, credit: amt, partyType: 'customer', partyId: customer, partyName: customerDoc?.name || '' },
          ],
          createdBy: req.user._id,
          terminalIp: getClientIp(req),
        },
      });
    } else if (method !== 'cash') {
      // Adjust bank balances for each bank account used
      if (salesAllocationAmt > 0 && bank) await adjustBankBalance(bank, salesAllocationAmt, req.companyFilter).catch(() => {});
      if (emiAllocationAmt > 0 && bank) await adjustBankBalance(bank, emiAllocationAmt, req.companyFilter).catch(() => {});
      if (unallocatedAmt > 0 && bank) await adjustBankBalance(bank, unallocatedAmt, req.companyFilter).catch(() => {});
    }
  } catch (err) { console.error('Payment in journal error:', err.message); }

  const populated = await PaymentIn.findOne({ _id: payment._id, ...req.companyFilter }).populate(populateBase);
  res.status(201).json(populated);
  createNotification({ type: 'payment_in', title: 'Payment Received', message: `Rs. ${amt} received from customer`, reference: populated.receiptNumber, amount: amt, companyId: req.companyId, userId: req.user._id });
});

router.post('/:id/cancel', protect, adminOnly, async (req, res) => {
  const payment = await PaymentIn.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!payment) return res.status(404).json({ message: 'Receipt not found' });
  if (payment.status === 'cancelled') return res.status(400).json({ message: 'Receipt already cancelled' });
  if (await isDayBookClosed(req.companyId, payment.date)) {
    return res.status(400).json({ message: 'Daybook is closed for this date. Cannot cancel.' });
  }

  for (const alloc of payment.allocations || []) {
    if (alloc.sale) {
      const sale = await Sale.findOne({ _id: alloc.sale, ...req.companyFilter });
      if (sale) {
        sale.amountPaid = Math.max(0, (sale.amountPaid || 0) - alloc.amount);
        await sale.save();
      }
    }
    if (alloc.emi) {
      const emi = await Emi.findOne({ _id: alloc.emi, ...req.companyFilter });
      if (emi) {
        emi.remainingAmount = Math.round((emi.remainingAmount + alloc.amount) * 100) / 100;
        emi.totalPaid = Math.max(0, (emi.totalPaid || 0) - alloc.amount);
        emi.paidStatus = emi.remainingAmount <= 0 ? 'partial' : (emi.totalPaid > 0 ? 'partial' : 'pending');
        emi.payments = (emi.payments || []).filter(p => p.date && p.amount !== alloc.amount);
        await emi.save();
      }
    }
  }

  try {
    const customerDoc = await Customer.findOne({ _id: payment.customer, ...req.companyFilter }).lean();
    const debtorAccount = await findOrCreateCustomerReceivable(req.companyId, req.companyFilter, customerDoc || null);
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const acct = payment.method === 'cash' ? cashAccount : bankAccount;
    if (acct && debtorAccount) {
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(),
        reference: `CNCL-${payment.receiptNumber}`,
        description: `Cancellation of receipt ${payment.receiptNumber}`,
        lines: [
          { account: acct._id, debit: 0, credit: payment.amount, bank: payment.method === 'cash' ? null : payment.bank },
          { account: debtorAccount._id, debit: payment.amount, credit: 0, subLedger: { customer: payment.customer } },
        ],
        createdBy: req.user._id,
        fiscalYear: payment.fiscalYear,
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        companyFilter: req.companyFilter,
      });
      if (payment.method !== 'cash' && payment.bank) await adjustBankBalance(payment.bank, -payment.amount, req.companyFilter).catch(() => {});
    }
  } catch (err) { console.error('Payment in cancel journal error:', err.message); }

  payment.status = 'cancelled';
  await payment.save();

  try {
    await cancelDaybookEntries({
      companyId: req.companyId,
      sourceModule: 'PAYMENT_IN',
      documentNumber: payment.receiptNumber,
      createdBy: req.user._id,
    });
  } catch (err) { console.error('Payment in cancel daybook hook error:', err.message); }

  res.json(payment);
});

module.exports = router;
