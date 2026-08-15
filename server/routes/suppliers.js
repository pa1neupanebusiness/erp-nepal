const express = require('express');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const { findOrCreateSupplierPayable } = require('../utils/supplierPayable');
const { adjustBankBalance } = require('../utils/bankService');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { adToBikramSambat } = require('../utils/dateUtils');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

function getFiscalYear(date) {
  const d = new Date(date);
  const m = d.getMonth() + 1, y = d.getFullYear(), dy = d.getDate();
  const adStart = (m > 7 || (m === 7 && dy >= 16)) ? y : y - 1;
  const bsStart = adStart + 57;
  return `${String(bsStart).slice(-2)}/${String(bsStart + 1).slice(-2)}`;
}

router.get('/', protect, async (req, res) => {
  const items = await Supplier.find({ ...req.companyFilter }).sort({ name: 1 });
  res.json(items);
});

router.post('/', protect, async (req, res) => {
  const item = await Supplier.create({ ...req.body, company: req.companyId });
  res.status(201).json(item);
});

router.put('/:id', protect, async (req, res) => {
  const item = await Supplier.findOneAndUpdate({ _id: req.params.id, ...req.companyFilter }, req.body, { new: true });
  res.json(item);
});

router.delete('/:id', protect, async (req, res) => {
  await Supplier.findOneAndDelete({ _id: req.params.id, ...req.companyFilter });
  res.json({ message: 'Deleted' });
});

router.get('/:id/outstanding', protect, async (req, res) => {
  const purchases = await Purchase.find({ supplier: req.params.id, dueAmount: { $gt: 0 }, ...req.companyFilter })
    .select('purchaseNumber date grandTotal paidAmount dueAmount')
    .sort({ date: 1 });
  const totalDue = purchases.reduce((s, p) => s + p.dueAmount, 0);
  const invoices = purchases.map(p => ({
    _id: p._id,
    ref: p.purchaseNumber,
    type: 'purchase',
    date: p.date,
    total: p.grandTotal,
    paid: p.paidAmount,
    due: p.dueAmount,
  }));
  res.json({ purchases, invoices, totalDue });
});

router.get('/:id/fy-total', protect, async (req, res) => {
  const filter = { supplier: req.params.id, status: 'received' };
  const fy = req.fyFilter?.createdAt;
  if (fy && fy.$gte) filter.date = { $gte: fy.$gte, $lte: fy.$lte };
  const purchases = await Purchase.find({ ...filter, ...req.companyFilter });
  const total = purchases.reduce((s, p) => s + (p.grandTotal || 0), 0);
  res.json({ total });
});

router.post('/:id/pay', protect, adminOnly, async (req, res) => {
  const { amount, method, bank, chequeNumber, remarks } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
  if (method === 'bank' && !chequeNumber) return res.status(400).json({ message: 'Cheque number required for bank payment' });
  if (method === 'bank' && !bank) return res.status(400).json({ message: 'Bank is required for bank payment' });

  const purchases = await Purchase.find({ supplier: req.params.id, dueAmount: { $gt: 0 }, ...req.companyFilter }).sort({ date: 1 });
  if (purchases.length === 0) return res.status(400).json({ message: 'No outstanding dues for this supplier' });

  const totalDue = purchases.reduce((s, p) => s + p.dueAmount, 0);
  if (amount > totalDue) return res.status(400).json({ message: `Amount exceeds total due ${totalDue}` });

  let remaining = amount;
  for (const purchase of purchases) {
    if (remaining <= 0) break;
    const payAgainst = Math.min(remaining, purchase.dueAmount);
    purchase.paidAmount = (purchase.paidAmount || 0) + payAgainst;
    purchase.dueAmount = Math.round((purchase.dueAmount - payAgainst) * 100) / 100;
    purchase.paymentMethod = method || 'cash';
    if (chequeNumber) purchase.chequeNumber = chequeNumber;
    if (remarks) purchase.paymentRemarks = remarks;
    await purchase.save();
    remaining = Math.round((remaining - payAgainst) * 100) / 100;
  }

  try {
    const supplier = await Supplier.findOne({ _id: req.params.id, ...req.companyFilter });
    const payableAccount = await findOrCreateSupplierPayable(req.companyId, req.companyFilter, supplier);
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const acct = method === 'bank' ? bankAccount : cashAccount;
    if (payableAccount && acct) {
      const now = new Date();
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: now,
        reference: `SUPP-PAY-${Date.now()}`,
        description: `Payment to supplier ${supplier?.name || ''}${chequeNumber ? ' (Chq: ' + chequeNumber + ')' : ''}`,
        lines: [
          { account: payableAccount._id, debit: amount, credit: 0, subLedger: { supplier: supplier._id } },
          { account: acct._id, debit: 0, credit: amount, bank: method === 'bank' ? (bank || null) : null },
        ],
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(now),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(now),
        companyFilter: req.companyFilter,
        daybook: {
          date: now,
          sourceModule: 'SUPPLIER_PAYMENT',
          daybookType: 'CASH_BOOK',
          documentNumber: `SUPP-PAY-${Date.now()}`,
          sourceRef: String(req.params.id),
          narration: `Payment to supplier ${supplier?.name || ''}`,
          lines: [
            { account: payableAccount._id, accountName: payableAccount.name, debit: amount, credit: 0, partyType: 'supplier', partyId: supplier._id, partyName: supplier?.name || '' },
            { account: acct._id, accountName: acct.name || (method === 'bank' ? 'Bank' : 'Cash'), debit: 0, credit: amount },
          ],
          createdBy: req.user._id,
        },
      });
      if (method === 'bank' && bank) await adjustBankBalance(bank, -amount, req.companyFilter).catch(() => {});
    }
  } catch (err) { console.error('Supplier payment journal error:', err.message); }

  res.json({ message: 'Payment recorded', amount });
});

module.exports = router;
