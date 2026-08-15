const express = require('express');
const PettyExpense = require('../models/PettyExpense');
const Account = require('../models/Account');
const Bank = require('../models/Bank');
const { protect } = require('../middleware/auth');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { cancelDaybookEntries } = require('../utils/daybookService');
const { adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const router = express.Router();

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
}

router.get('/', protect, async (req, res) => {
  const filter = { ...req.fyFilter, ...req.companyFilter };
  if (req.query.account) filter.account = req.query.account;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.startDate) filter.date = { $gte: new Date(req.query.startDate) };
  if (req.query.endDate) filter.date = { ...filter.date, $lte: new Date(req.query.endDate) };
  const items = await PettyExpense.find(filter).populate('createdBy', 'name').populate('account', 'code name').sort({ date: -1 });
  res.json(items);
});

router.get('/by-account', protect, async (req, res) => {
  try {
    const accounts = await Account.find({ type: 'expense', category: 'operating_expense', isActive: true, ...req.companyFilter }).sort({ code: 1 });
    const results = [];
    for (const acc of accounts) {
      const count = await PettyExpense.countDocuments({ account: acc._id, status: 'active', ...req.companyFilter });
      if (count > 0) {
        const agg = await PettyExpense.aggregate([
          { $match: { account: acc._id, status: 'active', ...req.companyFilter } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);
        results.push({ _id: acc._id, code: acc.code, name: acc.name, total: agg[0]?.total || 0, count: agg[0]?.count || count });
      }
    }
    res.json(results);
  } catch (err) {
    console.error('Expenses by account error:', err.message);
    res.status(500).json({ message: 'Failed to load expenses by account' });
  }
});

router.post('/', protect, async (req, res) => {
  const { date, account, category, description, amount, paymentMethod, bank: bankId, receiptNumber } = req.body;

  const expenseAccount = account ? await Account.findOne({ _id: account, ...req.companyFilter }) : null;
  if (!expenseAccount) return res.status(400).json({ message: 'Please select an expense account' });

  const expense = await PettyExpense.create({
    date: date ? new Date(date) : new Date(),
    account: expenseAccount._id,
    category: category || expenseAccount.name,
    description,
    amount,
    paymentMethod,
    bank: bankId || null,
    receiptNumber,
    createdBy: req.user._id,
    company: req.companyId,
  });

  try {
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    let cashOrBank;
    if (paymentMethod === 'bank' && bankId) {
      cashOrBank = await Account.findOne({ code: '10200', ...req.companyFilter });
    } else if (paymentMethod === 'bank') {
      cashOrBank = bankAccount;
    } else {
      cashOrBank = cashAccount;
    }

    if (cashOrBank && expenseAccount) {
      const expenseDate = date ? new Date(date) : new Date();
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: expenseDate,
        reference: `EXP-${expense._id.toString().slice(-6).toUpperCase()}`,
        description: `${expenseAccount.name}: ${description}`,
        lines: [
          { account: expenseAccount._id, debit: amount, credit: 0 },
          { account: cashOrBank._id, debit: 0, credit: amount },
        ],
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(expenseDate),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(expenseDate),
        companyFilter: req.companyFilter,
        daybook: {
          date: expenseDate,
          sourceModule: 'EXPENSE',
          daybookType: 'CASH_BOOK',
          documentNumber: `EXP-${expense._id.toString().slice(-6).toUpperCase()}`,
          sourceRef: String(expense._id),
          narration: `${expenseAccount.name}: ${description}`,
          lines: [
            { account: expenseAccount._id, accountName: expenseAccount.name, debit: amount, credit: 0, partyType: 'none', partyId: null, partyName: '' },
            { account: cashOrBank._id, accountName: cashOrBank.name || 'Cash', debit: 0, credit: amount, partyType: 'none', partyId: null, partyName: '' },
          ],
          createdBy: req.user._id,
        },
      });
    }
  } catch (err) { console.error('Expense journal error:', err.message); }

  res.status(201).json(expense);
});

router.put('/:id/cancel', protect, async (req, res) => {
  const expense = await PettyExpense.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  if (expense.status === 'cancelled') return res.status(400).json({ message: 'Already cancelled' });

  expense.status = 'cancelled';
  await expense.save();

  try {
    const ref = `EXP-${expense._id.toString().slice(-6).toUpperCase()}`;
    await cancelDaybookEntries({
      companyId: req.companyId,
      sourceModule: 'EXPENSE',
      documentNumber: ref,
      createdBy: req.user._id,
      reason: req.body.reason || 'Cancelled by user',
    });

    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const cashOrBank = expense.paymentMethod === 'bank' ? bankAccount : cashAccount;
    const expenseAccount = await Account.findOne({ _id: expense.account, ...req.companyFilter });

    if (cashOrBank && expenseAccount) {
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(),
        reference: `CNCL-${ref}`,
        description: `Cancellation of ${expenseAccount.name}: ${expense.description}`,
        lines: [
          { account: cashOrBank._id, debit: expense.amount, credit: 0 },
          { account: expenseAccount._id, debit: 0, credit: expense.amount },
        ],
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(new Date()),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        companyFilter: req.companyFilter,
        daybook: {
          date: new Date(),
          sourceModule: 'EXPENSE',
          daybookType: 'CASH_BOOK',
          documentNumber: `CNCL-${ref}`,
          sourceRef: String(expense._id),
          narration: `Cancellation: ${expenseAccount.name} - ${expense.description}`,
          lines: [
            { account: cashOrBank._id, accountName: cashOrBank.name || 'Cash', debit: expense.amount, credit: 0, partyType: 'none', partyId: null, partyName: '' },
            { account: expenseAccount._id, accountName: expenseAccount.name, debit: 0, credit: expense.amount, partyType: 'none', partyId: null, partyName: '' },
          ],
          createdBy: req.user._id,
        },
      });
    }
  } catch (err) { console.error('Expense cancel journal error:', err.message); }

  res.json(expense);
});

router.get('/categories', protect, async (req, res) => {
  const cats = await PettyExpense.distinct('category', { status: 'active', ...req.companyFilter });
  const defaultCats = ['Tea & Snacks', 'Stationery', 'Transport', 'Refreshments', 'Cleaning', 'Miscellaneous'];
  const all = [...new Set([...defaultCats, ...cats])];
  res.json(all);
});

module.exports = router;
