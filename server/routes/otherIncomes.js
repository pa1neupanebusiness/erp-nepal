const express = require('express');
const OtherIncome = require('../models/OtherIncome');
const Account = require('../models/Account');
const { protect, adminOnly } = require('../middleware/auth');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { cancelDaybookEntries } = require('../utils/daybookService');
const { adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const { isDayBookClosed } = require('../utils/daybookClosure');
const router = express.Router();

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
}

async function getNextIncomeNo(companyId) {
  const last = await OtherIncome.findOne({ company: companyId })
    .sort({ createdAt: -1 })
    .select('incomeNo');
  if (!last || !last.incomeNo) return 'INC-0001';
  const match = last.incomeNo.match(/(\d+)$/);
  if (!match) return 'INC-0001';
  const num = parseInt(match[1], 10) + 1;
  return `INC-${String(num).padStart(4, '0')}`;
}

router.get('/', protect, async (req, res) => {
  const filter = { ...req.fyFilter, ...req.companyFilter };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
  if (req.query.category) filter['items.category'] = req.query.category;
  const items = await OtherIncome.find(filter)
    .populate('createdBy', 'name')
    .populate('bank', 'name accountNumber')
    .sort({ incomeNo: -1 });
  res.json(items);
});

router.get('/next-no', protect, async (req, res) => {
  const nextNo = await getNextIncomeNo(req.companyId);
  res.json({ nextNo });
});

router.post('/', protect, async (req, res) => {
  const { date, items, paymentMethod, bank: bankId, remarks, attachments, manualNo } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ message: 'At least one income item is required' });
  }

  const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const incomeNo = manualNo || await getNextIncomeNo(req.companyId);

  const income = await OtherIncome.create({
    incomeNo,
    date: date ? new Date(date) : new Date(),
    items,
    totalAmount,
    paymentMethod,
    bank: (paymentMethod === 'bank' || paymentMethod === 'cheque') ? bankId || null : null,
    remarks,
    attachments: attachments || [],
    createdBy: req.user._id,
    company: req.companyId,
  });

  try {
    const incomeDate = date ? new Date(date) : new Date();
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });

    let cashOrBank;
    if ((paymentMethod === 'bank' || paymentMethod === 'cheque') && bankId) {
      cashOrBank = bankAccount;
    } else if (paymentMethod === 'digital') {
      cashOrBank = cashAccount;
    } else {
      cashOrBank = cashAccount;
    }

    let incomeAccount = await Account.findOne({ code: '40500', ...req.companyFilter });
    if (!incomeAccount) {
      incomeAccount = await Account.findOne({ code: '40300', ...req.companyFilter });
    }
    if (!incomeAccount) {
      incomeAccount = await Account.findOne({
        category: 'other_income', type: 'revenue', ...req.companyFilter,
      });
    }

    if (cashOrBank && incomeAccount) {
      const ref = `INC-${income._id.toString().slice(-6).toUpperCase()}`;
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: incomeDate,
        reference: ref,
        description: `Other Income: ${items.map(i => i.category).join(', ')}`,
        lines: [
          { account: cashOrBank._id, debit: totalAmount, credit: 0 },
          { account: incomeAccount._id, debit: 0, credit: totalAmount },
        ],
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(incomeDate),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(incomeDate),
        companyFilter: req.companyFilter,
        daybook: {
          date: incomeDate,
          sourceModule: 'OTHER_INCOME',
          daybookType: 'CASH_BOOK',
          documentNumber: ref,
          sourceRef: String(income._id),
          narration: `Other Income: ${items.map(i => `${i.category} Rs. ${i.amount}`).join(', ')}`,
          lines: [
            {
              account: cashOrBank._id,
              accountName: cashOrBank.name || 'Cash',
              debit: totalAmount,
              credit: 0,
              partyType: 'none',
              partyId: null,
              partyName: '',
            },
            {
              account: incomeAccount._id,
              accountName: incomeAccount.name,
              debit: 0,
              credit: totalAmount,
              partyType: 'none',
              partyId: null,
              partyName: '',
            },
          ],
          createdBy: req.user._id,
        },
      });
    }
  } catch (err) {
    console.error('OtherIncome journal error:', err.message);
  }

  res.status(201).json(income);
});

router.put('/:id', protect, async (req, res) => {
  const { date, items, paymentMethod, bank: bankId, remarks, attachments } = req.body;

  const income = await OtherIncome.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!income) return res.status(404).json({ message: 'Income not found' });

  if (items && items.length > 0) {
    const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    income.items = items;
    income.totalAmount = totalAmount;
  }
  if (date) income.date = new Date(date);
  if (paymentMethod) income.paymentMethod = paymentMethod;
  if (paymentMethod === 'bank' || paymentMethod === 'cheque') {
    income.bank = bankId || null;
  } else {
    income.bank = null;
  }
  if (remarks !== undefined) income.remarks = remarks;
  if (attachments) income.attachments = attachments;

  await income.save();
  res.json(income);
});

router.delete('/:id', protect, async (req, res) => {
  const income = await OtherIncome.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!income) return res.status(404).json({ message: 'Income not found' });
  if (income.status === 'cancelled') return res.status(400).json({ message: 'Already cancelled' });
  if (await isDayBookClosed(req.companyId, income.date)) {
    return res.status(400).json({ message: 'Daybook is closed for this date. Cannot delete.' });
  }

  income.status = 'cancelled';
  await income.save();

  try {
    const ref = `INC-${income._id.toString().slice(-6).toUpperCase()}`;
    await cancelDaybookEntries({
      companyId: req.companyId,
      sourceModule: 'OTHER_INCOME',
      documentNumber: ref,
      createdBy: req.user._id,
      reason: req.body.reason || 'Cancelled by user',
    });

    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const cashOrBank = (income.paymentMethod === 'bank' || income.paymentMethod === 'cheque')
      ? bankAccount : cashAccount;

    let incomeAccount = await Account.findOne({ code: '40500', ...req.companyFilter });
    if (!incomeAccount) {
      incomeAccount = await Account.findOne({ code: '40300', ...req.companyFilter });
    }
    if (!incomeAccount) {
      incomeAccount = await Account.findOne({
        category: 'other_income', type: 'revenue', ...req.companyFilter,
      });
    }

    if (cashOrBank && incomeAccount) {
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(),
        reference: `CNCL-${ref}`,
        description: `Cancellation of Other Income ${income.incomeNo}`,
        lines: [
          { account: incomeAccount._id, debit: income.totalAmount, credit: 0 },
          { account: cashOrBank._id, debit: 0, credit: income.totalAmount },
        ],
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(new Date()),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        companyFilter: req.companyFilter,
        daybook: {
          date: new Date(),
          sourceModule: 'OTHER_INCOME',
          daybookType: 'CASH_BOOK',
          documentNumber: `CNCL-${ref}`,
          sourceRef: String(income._id),
          narration: `Cancellation: Other Income ${income.incomeNo}`,
          lines: [
            {
              account: incomeAccount._id,
              accountName: incomeAccount.name,
              debit: income.totalAmount,
              credit: 0,
              partyType: 'none',
              partyId: null,
              partyName: '',
            },
            {
              account: cashOrBank._id,
              accountName: cashOrBank.name || 'Cash',
              debit: 0,
              credit: income.totalAmount,
              partyType: 'none',
              partyId: null,
              partyName: '',
            },
          ],
          createdBy: req.user._id,
        },
      });
    }
  } catch (err) {
    console.error('OtherIncome cancel journal error:', err.message);
  }

  res.json(income);
});

module.exports = router;
