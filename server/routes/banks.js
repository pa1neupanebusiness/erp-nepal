const express = require('express');
const Bank = require('../models/Bank');
const JournalEntry = require('../models/JournalEntry');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

// Build a map of bankId -> net movement (debit - credit) from posted journal lines.
async function bankNetMap() {
  const agg = await JournalEntry.aggregate([
    { $match: { isPosted: true } },
    { $unwind: '$lines' },
    { $match: { 'lines.bank': { $ne: null, $exists: true } } },
    { $group: { _id: '$lines.bank', net: { $sum: { $subtract: ['$lines.debit', '$lines.credit'] } } } },
  ]);
  const map = {};
  agg.forEach(a => { if (a._id) map[a._id.toString()] = Math.round(a.net * 100) / 100; });
  return map;
}

router.get('/', protect, async (req, res) => {
  const filter = { ...req.companyFilter };
  if (req.query.role === 'finance') {
    filter.isFinanceBank = true;
  } else {
    filter.isFinanceBank = { $ne: true };
  }
  const items = await Bank.find(filter).sort({ name: 1 });
  const netMap = await bankNetMap();
  const result = items.map(b => {
    const doc = b.toObject();
    const opening = (b.initialBalance != null ? b.initialBalance : b.balance) || 0;
    const net = netMap[b._id.toString()] || 0;
    doc.balance = Math.round((opening + net) * 100) / 100;
    return doc;
  });
  res.json(result);
});

router.get('/:id/transactions', protect, async (req, res) => {
  const bankId = req.params.id;
  const bank = await Bank.findOne({ _id: bankId, ...req.companyFilter });
  if (!bank) return res.status(404).json({ message: 'Bank not found' });

  const entries = await JournalEntry.find({ 'lines.bank': bankId, isPosted: true, ...req.companyFilter })
    .populate('createdBy', 'name')
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const transactions = [];
  for (const entry of entries) {
    for (const line of entry.lines) {
      const lineBankId = line.bank?._id?.toString?.() || line.bank?.toString?.();
      if (lineBankId !== bankId) continue;
      const isDebit = line.debit > 0;
      transactions.push({
        _id: entry._id,
        date: entry.date,
        reference: entry.reference,
        description: entry.description,
        type: isDebit ? 'inflow' : 'outflow',
        amount: isDebit ? line.debit : line.credit,
        debit: line.debit || 0,
        credit: line.credit || 0,
        balance: 0,
        createdBy: entry.createdBy?.name || '',
      });
    }
  }

  // Running balance starts from the bank's opening balance so the total reflects
  // the opening + all movements. Transactions remain chronological (oldest first)
  // so printed statements show the latest at the bottom.
  const opening = (bank.initialBalance != null ? bank.initialBalance : bank.balance) || 0;
  let runningBalance = opening;
  for (const t of transactions) {
    runningBalance += t.debit - t.credit;
    t.balance = Math.round(runningBalance * 100) / 100;
  }

  const result = [...transactions];
  if (opening !== 0) {
    result.unshift({
      _id: 'opening',
      date: bank.createdAt || new Date(),
      reference: '-',
      description: 'Opening Balance',
      type: 'opening',
      amount: Math.round(opening * 100) / 100,
      debit: Math.round(opening * 100) / 100,
      credit: 0,
      balance: Math.round(opening * 100) / 100,
      createdBy: '',
    });
  }

  res.json({ bank, transactions: result, currentBalance: Math.round(runningBalance * 100) / 100 });
});

router.post('/', protect, adminOnly, async (req, res) => {
  const { name, accountNumber, branch, initialBalance, isFinanceBank } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Bank name is required' });
  const opening = Math.round((parseFloat(initialBalance) || 0) * 100) / 100;
  const item = await Bank.create({
    name: name.trim(),
    accountNumber: accountNumber || '',
    branch: branch || '',
    balance: opening,
    initialBalance: opening,
    isFinanceBank: !!isFinanceBank,
    company: req.companyId,
  });
  res.status(201).json(item);
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  const { name, accountNumber, branch, balance } = req.body;
  const item = await Bank.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!item) return res.status(404).json({ message: 'Bank not found' });
  if (name !== undefined && !name.trim()) return res.status(400).json({ message: 'Bank name is required' });
  if (name !== undefined) item.name = name.trim();
  if (accountNumber !== undefined) item.accountNumber = accountNumber;
  if (branch !== undefined) item.branch = branch;
  if (balance !== undefined) {
    const bal = Math.round((parseFloat(balance) || 0) * 100) / 100;
    item.balance = bal;
    item.initialBalance = bal;
  }
  await item.save();
  res.json(item);
});

router.delete('/:id', protect, adminOnly, async (req, res) => {
  await Bank.findOneAndDelete({ _id: req.params.id, ...req.companyFilter });
  res.json({ message: 'Deleted' });
});

module.exports = router;
