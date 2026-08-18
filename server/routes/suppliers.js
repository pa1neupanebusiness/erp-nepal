const express = require('express');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const { findOrCreateSupplierPayable } = require('../utils/supplierPayable');
const { adjustBankBalance } = require('../utils/bankService');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
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
  const purchases = await Purchase.find({ supplier: req.params.id, ...req.companyFilter })
    .sort({ date: -1 });
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
  let balance = 0;
  try {
    const Supplier = require('../models/Supplier');
    const Account = require('../models/Account');
    const sup = await Supplier.findOne({ _id: req.params.id, ...req.companyFilter }).select('name');
    if (sup) {
      const apAcc = await Account.findOne({ name: `Accounts Payable - ${sup.name}`, ...req.companyFilter }).select('balance');
      if (apAcc) balance = apAcc.balance || 0;
    }
  } catch (e) { /* ignore */ }
  res.json({ purchases, invoices, totalDue, balance });
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
  const { amount, method, bank, chequeNumber, remarks, splits } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });

  const isSplit = method === 'split' && splits && splits.length > 0;
  if (!isSplit) {
    if (method === 'bank' && !chequeNumber) return res.status(400).json({ message: 'Cheque number required for bank payment' });
    if (method === 'bank' && !bank) return res.status(400).json({ message: 'Bank is required for bank payment' });
  } else {
    const totalSplit = splits.reduce((s, sp) => s + (sp.amount || 0), 0);
    if (Math.abs(totalSplit - amount) > 0.01) return res.status(400).json({ message: `Split total (${totalSplit}) must equal payment amount (${amount})` });
    for (const sp of splits) {
      if ((sp.method === 'bank' || sp.method === 'qr') && !sp.bank) return res.status(400).json({ message: 'Bank is required for QR/Bank split payments' });
    }
  }

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
    purchase.paymentMethod = isSplit ? 'split' : (method || 'cash');
    if (!isSplit) {
      if (chequeNumber) purchase.chequeNumber = chequeNumber;
      if (remarks) purchase.paymentRemarks = remarks;
    } else {
       purchase.paymentSplits = (splits || []).filter(sp => sp.amount > 0).map(sp => ({ method: sp.method, amount: Math.round((sp.amount || 0) * 100) / 100, bank: ((sp.method || '') === 'bank' || sp.method === 'qr') ? (sp.bank || null) : null }));
      if (remarks) purchase.paymentRemarks = remarks;
    }
    await purchase.save();
    remaining = Math.round((remaining - payAgainst) * 100) / 100;
  }

  try {
    const supplier = await Supplier.findOne({ _id: req.params.id, ...req.companyFilter });
    const payableAccount = await findOrCreateSupplierPayable(req.companyId, req.companyFilter, supplier);
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const now = new Date();

    if (isSplit) {
      for (const sp of splits) {
        if (!sp.amount || sp.amount <= 0) continue;
        const acct = (sp.method === 'bank' || sp.method === 'qr') ? bankAccount : cashAccount;
        if (payableAccount && acct) {
          await postJournalEntryAtomic({
            companyId: req.companyId, date: now,
            reference: `SUPP-PAY-${Date.now()}`,
            description: `Payment to supplier ${supplier?.name || ''} (${sp.method})`,
            lines: [
              { account: payableAccount._id, debit: sp.amount, credit: 0, subLedger: { supplier: supplier._id } },
              { account: acct._id, debit: 0, credit: sp.amount, bank: (sp.method === 'bank' || sp.method === 'qr') ? (sp.bank || null) : null },
            ],
            createdBy: req.user._id, fiscalYear: getFiscalYear(now),
            fiscalYearId: req.fiscalYearId || undefined, miti: adToBikramSambat(now),
            companyFilter: req.companyFilter,
            daybook: {
              date: now, sourceModule: 'SUPPLIER_PAYMENT', daybookType: 'CASH_BOOK',
              documentNumber: `SUPP-PAY-${Date.now()}`, sourceRef: String(req.params.id),
              narration: `Payment to supplier ${supplier?.name || ''} (${sp.method})`,
              lines: [
                { account: payableAccount._id, accountName: payableAccount.name, debit: sp.amount, credit: 0, partyType: 'supplier', partyId: supplier._id, partyName: supplier?.name || '' },
                { account: acct._id, accountName: acct.name || ((sp.method === 'bank' || sp.method === 'qr') ? 'Bank' : 'Cash'), debit: 0, credit: sp.amount },
              ],
              createdBy: req.user._id,
            },
          });
          if ((sp.method === 'bank' || sp.method === 'qr') && sp.bank) await adjustBankBalance(sp.bank, -sp.amount, req.companyFilter).catch(() => {});
        }
      }
    } else {
      const acct = method === 'bank' ? bankAccount : cashAccount;
      if (payableAccount && acct) {
        await postJournalEntryAtomic({
          companyId: req.companyId, date: now,
          reference: `SUPP-PAY-${Date.now()}`,
          description: `Payment to supplier ${supplier?.name || ''}${chequeNumber ? ' (Chq: ' + chequeNumber + ')' : ''}`,
          lines: [
            { account: payableAccount._id, debit: amount, credit: 0, subLedger: { supplier: supplier._id } },
            { account: acct._id, debit: 0, credit: amount, bank: method === 'bank' ? (bank || null) : null },
          ],
          createdBy: req.user._id, fiscalYear: getFiscalYear(now),
          fiscalYearId: req.fiscalYearId || undefined, miti: adToBikramSambat(now),
          companyFilter: req.companyFilter,
          daybook: {
            date: now, sourceModule: 'SUPPLIER_PAYMENT', daybookType: 'CASH_BOOK',
            documentNumber: `SUPP-PAY-${Date.now()}`, sourceRef: String(req.params.id),
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
    }
  } catch (err) { console.error('Supplier payment journal error:', err.message); }

  res.json({ message: 'Payment recorded', amount });
});

module.exports = router;
