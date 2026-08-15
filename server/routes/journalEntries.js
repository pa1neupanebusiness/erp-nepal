const express = require('express');
const mongoose = require('mongoose');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const { protect, adminOnly } = require('../middleware/auth');
const fiscalYearFilter = require('../middleware/fiscalYear');
const { adToBikramSambat } = require('../utils/dateUtils');
const router = express.Router();

function getFiscalYear(date) {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const day = d.getDate();
  // Nepal F.Y. starts from Shrawan 1 (~July 16)
  if (month > 7 || (month === 7 && day >= 16)) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

// Control accounts that require a Customer / Vendor sub-ledger on every line.
const CONTROL_ACCOUNT_CODES = ['10300', '20100']; // Sundry Debtors, Sundry Creditors

const populateBase = [
  { path: 'lines.account', select: 'code name type category balance' },
  { path: 'lines.bank', select: 'name accountNumber' },
  { path: 'lines.subLedger.customer', select: 'name' },
  { path: 'lines.subLedger.supplier', select: 'name' },
  { path: 'createdBy', select: 'name' },
];

// Super admin + admin can create, edit and delete journal entries.
const canManageJournal = (req, res, next) => {
  if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin')) {
    return next();
  }
  return res.status(403).json({ message: 'Super admin or admin access required' });
};

async function parseAndValidate(req, res) {
  const { lines } = req.body;
  if (!Array.isArray(lines) || lines.length < 2) {
    res.status(400).json({ message: 'At least two journal lines are required' });
    return null;
  }

  let totalDebit = 0, totalCredit = 0;
  const clean = [];
  for (const l of lines) {
    const debit = Number(l.debit) || 0;
    const credit = Number(l.credit) || 0;
    if (!l.account) { res.status(400).json({ message: 'Every journal line requires an account' }); return null; }
    if (debit < 0 || credit < 0) { res.status(400).json({ message: 'Journal amounts cannot be negative' }); return null; }
    if (debit > 0 && credit > 0) { res.status(400).json({ message: 'A journal line cannot be both debit and credit' }); return null; }
    if (debit === 0 && credit === 0) { res.status(400).json({ message: 'Zero-amount journal lines are not allowed' }); return null; }
    totalDebit += debit;
    totalCredit += credit;
    clean.push({
      account: l.account, debit, credit,
      subLedger: {
        customer: l.subLedger?.customer || null,
        supplier: l.subLedger?.supplier || null,
      },
    });
  }

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    res.status(400).json({ message: `Debit and credit totals must be equal (${totalDebit.toFixed(2)} vs ${totalCredit.toFixed(2)})` });
    return null;
  }

  // Resolve accounts once, enforce the control-account sub-ledger guard.
  const accounts = await Account.find({ _id: { $in: clean.map(l => l.account) }, ...req.companyFilter });
  const accMap = {};
  accounts.forEach(a => { accMap[a._id.toString()] = a; });
  for (const l of clean) {
    const a = accMap[l.account.toString()];
    if (!a) { res.status(400).json({ message: 'A journal line references an invalid account' }); return null; }
    if (CONTROL_ACCOUNT_CODES.includes(a.code) && !l.subLedger.customer && !l.subLedger.supplier) {
      res.status(400).json({ message: `${a.code} ${a.name} requires a customer or vendor reference on each line` });
      return null;
    }
  }

  return { clean, totalDebit, totalCredit };
}

router.get('/', protect, fiscalYearFilter, async (req, res) => {
  const filter = { ...req.companyFilter };
  if (req.query.startDate) filter.date = { ...filter.date, $gte: new Date(req.query.startDate) };
  if (req.query.endDate) filter.date = { ...filter.date, $lte: new Date(req.query.endDate) };
  if (!filter.date && Object.keys(req.fyFilter || {}).length) Object.assign(filter, req.fyFilter);
  if (req.query.accountId) filter['lines.account'] = req.query.accountId;
  if (req.query.bankId) filter['lines.bank'] = req.query.bankId;
  if (req.query.excludeSource) {
    // JournalEntry documents do not carry sourceModule (only the linked Daybook does),
    // so month-end summaries are excluded by their description prefix.
    if (req.query.excludeSource === 'MONTH_END') {
      filter.description = { $not: /^Month-End/i };
    } else {
      filter.sourceModule = { $ne: req.query.excludeSource };
    }
  }
  const items = await JournalEntry.find(filter)
    .populate(populateBase)
    .sort({ date: -1 });
  res.json(items);
});

router.get('/:id', protect, async (req, res) => {
  const item = await JournalEntry.findOne({ _id: req.params.id, ...req.companyFilter })
    .populate(populateBase);
  res.json(item);
});

router.post('/', protect, canManageJournal, async (req, res) => {
  const { date, reference, description } = req.body;
  const parsed = await parseAndValidate(req, res);
  if (!parsed) return;

  const { postJournalEntryAtomic } = require('../utils/postingEngine');
  const entryDate = date || new Date();
  const entry = await postJournalEntryAtomic({
    companyId: req.companyId,
    date: entryDate,
    reference,
    description,
    lines: parsed.clean,
    createdBy: req.user._id,
    fiscalYear: getFiscalYear(entryDate),
    fiscalYearId: req.fiscalYearId || undefined,
    miti: adToBikramSambat(entryDate) || '',
    companyFilter: req.companyFilter,
  });

  const populated = await JournalEntry.findOne({ _id: entry._id, ...req.companyFilter }).populate(populateBase);
  res.status(201).json(populated);
});

router.put('/:id', protect, canManageJournal, async (req, res) => {
  const entry = await JournalEntry.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!entry) return res.status(404).json({ message: 'Journal entry not found' });

  const { date, reference, description } = req.body;
  const parsed = await parseAndValidate(req, res);
  if (!parsed) return;

  const entryDate = date || entry.date;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const l of entry.lines) {
      if (l.account) {
        await Account.findOneAndUpdate(
          { _id: l.account, ...req.companyFilter },
          { $inc: { balance: -(l.debit - l.credit) } },
          { session }
        );
      }
    }

    entry.date = entryDate;
    entry.miti = adToBikramSambat(new Date(entryDate)) || '';
    entry.reference = reference;
    entry.description = description;
    entry.lines = parsed.clean;
    entry.fiscalYear = getFiscalYear(entryDate);
    await entry.save({ session });

    for (const l of parsed.clean) {
      if (l.account) {
        await Account.findOneAndUpdate(
          { _id: l.account, ...req.companyFilter },
          { $inc: { balance: l.debit - l.credit } },
          { session }
        );
      }
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  const populated = await JournalEntry.findOne({ _id: entry._id, ...req.companyFilter }).populate(populateBase);
  res.json(populated);
});

router.delete('/:id', protect, canManageJournal, async (req, res) => {
  const entry = await JournalEntry.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!entry) return res.status(404).json({ message: 'Journal entry not found' });

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const l of entry.lines) {
      if (l.account) {
        await Account.findOneAndUpdate(
          { _id: l.account, ...req.companyFilter },
          { $inc: { balance: -(l.debit - l.credit) } },
          { session }
        );
      }
    }
    await JournalEntry.findOneAndDelete({ _id: req.params.id, ...req.companyFilter }, { session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  res.json({ message: 'Deleted' });
});

module.exports = router;
