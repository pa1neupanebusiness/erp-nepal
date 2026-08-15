const express = require('express');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const Company = require('../models/Company');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Emi = require('../models/Emi');
const FiscalYear = require('../models/FiscalYear');
const { protect, adminOnly, superAdminOnly } = require('../middleware/auth');
const { getChartOfAccounts } = require('../utils/chartOfAccounts');
const { seedTallyTree } = require('../utils/tallyTree');
const router = express.Router();

const NEPAL_CHART_OF_ACCOUNTS = [
  { code: '10100', name: 'Cash (Teji/Nagad)', type: 'asset', category: 'current_asset' },
  { code: '10200', name: 'Bank Account', type: 'asset', category: 'current_asset' },
  { code: '10300', name: 'Accounts Receivable', type: 'asset', category: 'current_asset' },
  { code: '10400', name: 'Inventory Stock', type: 'asset', category: 'current_asset' },
  { code: '10501', name: 'VAT Input (13%)', type: 'asset', category: 'current_asset' },
  { code: '10600', name: 'Prepaid Expenses', type: 'asset', category: 'current_asset' },
  { code: '11100', name: 'Furniture & Fixtures', type: 'asset', category: 'fixed_asset' },
  { code: '11200', name: 'Office Equipment', type: 'asset', category: 'fixed_asset' },
  { code: '11300', name: 'Vehicles', type: 'asset', category: 'fixed_asset' },
  { code: '11400', name: 'Accumulated Depreciation', type: 'contra_asset', category: 'contra_asset' },
  { code: '20100', name: 'Accounts Payable', type: 'liability', category: 'current_liability' },
  { code: '20200', name: 'VAT Output (13%)', type: 'liability', category: 'current_liability' },
  { code: '20300', name: 'TDS Payable', type: 'liability', category: 'current_liability' },
  { code: '20400', name: 'Accrued Expenses', type: 'liability', category: 'current_liability' },
  { code: '20500', name: 'Short-term Loans', type: 'liability', category: 'current_liability' },
  { code: '21100', name: 'Bank Loans', type: 'liability', category: 'long_term_liability' },
  { code: '30100', name: 'Owner\'s Capital', type: 'equity', category: 'equity' },
  { code: '30200', name: 'Drawings', type: 'equity', category: 'equity' },
  { code: '30300', name: 'Retained Earnings', type: 'equity', category: 'equity' },
  { code: '30400', name: 'Profit & Loss (Current Year)', type: 'equity', category: 'equity' },
  { code: '40100', name: 'Sales Revenue (Bikri)', type: 'revenue', category: 'revenue' },
  { code: '40200', name: 'Sales Discount/Return', type: 'contra_revenue', category: 'contra_revenue' },
  { code: '40300', name: 'Other Income', type: 'revenue', category: 'other_income' },
  { code: '50100', name: 'Cost of Goods Sold (COGS)', type: 'expense', category: 'cogs' },
  { code: '50101', name: 'Purchase (Khareed)', type: 'expense', category: 'cogs' },
  { code: '50102', name: 'Purchase Return', type: 'expense', category: 'cogs' },
  { code: '50103', name: 'Transport & Customs Charges', type: 'expense', category: 'cogs' },
  { code: '60100', name: 'Salary & Wages', type: 'expense', category: 'operating_expense' },
  { code: '60200', name: 'Rent', type: 'expense', category: 'operating_expense' },
  { code: '60300', name: 'Electricity & Utilities', type: 'expense', category: 'operating_expense' },
  { code: '60400', name: 'Telephone & Internet', type: 'expense', category: 'operating_expense' },
  { code: '60500', name: 'Office Supplies', type: 'expense', category: 'operating_expense' },
  { code: '60510', name: 'Stationery', type: 'expense', category: 'operating_expense' },
  { code: '60600', name: 'Marketing & Advertising', type: 'expense', category: 'operating_expense' },
  { code: '60610', name: 'Sales Commission', type: 'expense', category: 'operating_expense' },
  { code: '60700', name: 'Repair & Maintenance', type: 'expense', category: 'operating_expense' },
  { code: '60710', name: 'Insurance', type: 'expense', category: 'operating_expense' },
  { code: '60720', name: 'Communication', type: 'expense', category: 'operating_expense' },
  { code: '60800', name: 'Depreciation', type: 'expense', category: 'operating_expense' },
  { code: '60900', name: 'Bank Charges & Fees', type: 'expense', category: 'operating_expense' },
  { code: '61000', name: 'TDS Expenses', type: 'expense', category: 'operating_expense' },
  { code: '61010', name: 'Bad Debts', type: 'expense', category: 'operating_expense' },
  { code: '61100', name: 'Miscellaneous Expenses', type: 'expense', category: 'operating_expense' },
  { code: '61200', name: 'Professional Fees', type: 'expense', category: 'operating_expense' },
  { code: '61300', name: 'Contract / Service Charges', type: 'expense', category: 'operating_expense' },
];

router.get('/', protect, async (req, res) => {
  const accounts = await Account.find({ ...req.companyFilter }).sort({ code: 1 });
  res.json(accounts);
});

router.post('/recalculate-balances', protect, adminOnly, async (req, res) => {
  const accounts = await Account.find({ ...req.companyFilter });
  const entries = await JournalEntry.find({ isPosted: true, ...req.companyFilter });
  const balances = {};
  accounts.forEach(a => { balances[a._id.toString()] = 0; });
  entries.forEach(entry => {
    entry.lines.forEach(line => {
      const id = line.account?.toString?.();
      if (balances[id] !== undefined) {
        balances[id] += (line.debit || 0) - (line.credit || 0);
      }
    });
  });
  let updated = 0;
  for (const a of accounts) {
    const isCreditNormal = ['liability', 'equity', 'income', 'contra_expense'].includes(a.type);
    const raw = Math.round((balances[a._id.toString()] || 0) * 100) / 100;
    const correct = isCreditNormal ? -raw : raw;
    if (a.balance !== correct) {
      await Account.findOneAndUpdate({ _id: a._id }, { balance: correct });
      updated++;
    }
  }
  res.json({ message: `Recalculated ${accounts.length} accounts, ${updated} updated` });
});

router.post('/seed', protect, adminOnly, async (req, res) => {
  const count = await Account.countDocuments({ ...req.companyFilter });
  if (count > 0) return res.status(400).json({ message: 'Chart of accounts already exists. Delete all first to re-seed.' });
  const company = await Company.findById(req.companyId);
  const chart = getChartOfAccounts(company?.country);
  const accounts = await Account.insertMany(
    (chart.accounts || NEPAL_CHART_OF_ACCOUNTS).map(a => ({ ...a, isSystem: true, company: req.companyId }))
  );

  const tallyResult = await seedTallyTree(req.companyId, req.companyFilter);

  res.status(201).json({
    message: `Created ${accounts.length} accounts for ${chart.name}. ${tallyResult.groupsCreated} groups, ${tallyResult.accountsLinked} accounts linked.`,
    accounts,
    groups: tallyResult.groupsCreated,
    linked: tallyResult.accountsLinked,
  });
});

router.post('/', protect, async (req, res) => {
  const item = await Account.create({ ...req.body, company: req.companyId });
  res.status(201).json(item);
});

router.put('/:id', protect, superAdminOnly, async (req, res) => {
  const { balance, ...safeBody } = req.body;
  const item = await Account.findOneAndUpdate({ _id: req.params.id, ...req.companyFilter }, safeBody, { new: true });
  res.json(item);
});

router.delete('/:id', protect, superAdminOnly, async (req, res) => {
  await Account.findOneAndDelete({ _id: req.params.id, ...req.companyFilter });
  res.json({ message: 'Deleted' });
});

router.post('/opening-balance', protect, async (req, res) => {
  const { accountId, amount, remarks } = req.body;
  if (!accountId || !amount || !remarks?.trim()) {
    return res.status(400).json({ message: 'Account, amount, and remarks are required' });
  }
  const account = await Account.findOne({ _id: accountId, ...req.companyFilter });
  if (!account) return res.status(404).json({ message: 'Account not found' });
  const equityAccount = await Account.findOne({ code: '30100', ...req.companyFilter });
  if (!equityAccount) return res.status(404).json({ message: "Owner's Capital account not found" });

  const { postJournalEntryAtomic } = require('../utils/postingEngine');
  const { adToBikramSambat } = require('../utils/dateUtils');
  const now = new Date();
  const amt = Math.abs(parseFloat(amount));
  const isLiability = account.type === 'liability' || account.type === 'equity';
  const isDebit = ['asset', 'expense', 'contra_revenue'].includes(account.type);

  const entry = await postJournalEntryAtomic({
    companyId: req.companyId,
    date: now,
    reference: `OPENING-BAL-${accountId.toString().slice(-6)}`,
    description: remarks,
    lines: isDebit
      ? [
          { account: account._id, debit: amt, credit: 0 },
          { account: equityAccount._id, debit: 0, credit: amt },
        ]
      : [
          { account: equityAccount._id, debit: amt, credit: 0 },
          { account: account._id, debit: 0, credit: amt },
        ],
    createdBy: req.user._id,
    fiscalYear: getFiscalYear(now),
    fiscalYearId: req.fiscalYearId || undefined,
    miti: adToBikramSambat(now),
    companyFilter: req.companyFilter,
  });

  res.status(201).json({ message: 'Opening balance posted', entry });
});

router.get('/trial-balance', protect, async (req, res) => {
  const entries = await JournalEntry.find({ ...req.companyFilter });
  const accounts = await Account.find({ ...req.companyFilter });
  const balances = {};
  accounts.forEach(a => { balances[a._id.toString()] = { debit: 0, credit: 0, account: a }; });
  entries.forEach(entry => {
    entry.lines.forEach(line => {
      const id = line.account.toString();
      if (balances[id]) {
        balances[id].debit += line.debit;
        balances[id].credit += line.credit;
      }
    });
  });
  const result = accounts.map(a => {
    const b = balances[a._id.toString()];
    const netDebit = Math.max(0, (b?.debit || 0) - (b?.credit || 0));
    const netCredit = Math.max(0, (b?.credit || 0) - (b?.debit || 0));
    return {
      _id: a._id, code: a.code, name: a.name, type: a.type, category: a.category,
      debit: netDebit, credit: netCredit,
    };
  });
  res.json(result);
});

router.get('/income-statement', protect, async (req, res) => {
  const fyFilter = req.fyFilter && Object.keys(req.fyFilter).length ? req.fyFilter : {};
  const trialBalance = await (async () => {
    const entries = await JournalEntry.find({ ...fyFilter, ...req.companyFilter });
    const accounts = await Account.find({ ...req.companyFilter });
    const bals = {};
    accounts.forEach(a => { bals[a._id.toString()] = { debit: 0, credit: 0, account: a }; });
    entries.forEach(e => e.lines.forEach(l => {
      const id = l.account.toString();
      if (bals[id]) { bals[id].debit += l.debit; bals[id].credit += l.credit; }
    }));
    return accounts.map(a => {
      const b = bals[a._id.toString()];
      return { account: a, balance: (b?.credit || 0) - (b?.debit || 0) };
    });
  })();

  const sumAccounts = (filterFn) => trialBalance.filter(filterFn).map(t => ({
    code: t.account.code, name: t.account.name, balance: t.balance, _id: t.account._id,
  }));

  const revenueItems = sumAccounts(t => t.account.type === 'revenue' && t.account.category !== 'contra_revenue' && t.balance !== 0);
  const contraRevenueItems = sumAccounts(t => t.account.category === 'contra_revenue' && t.balance !== 0);
  const cogsItems = sumAccounts(t => t.account.category === 'cogs' && t.balance !== 0);
  const expenseItems = sumAccounts(t => t.account.category === 'operating_expense' && t.balance !== 0);
  const otherIncomeItems = sumAccounts(t => t.account.category === 'other_income' && t.balance !== 0);

  const revenue = revenueItems.reduce((s, t) => s + t.balance, 0);
  const contraRevenue = contraRevenueItems.reduce((s, t) => s + Math.abs(t.balance), 0);
  const cogs = cogsItems.reduce((s, t) => s + Math.abs(t.balance), 0);
  const expenses = expenseItems.reduce((s, t) => s + Math.abs(t.balance), 0);
  const otherIncome = otherIncomeItems.reduce((s, t) => s + t.balance, 0);

  const netRevenue = revenue - Math.abs(contraRevenue);
  const grossProfit = netRevenue - cogs;
  const netProfit = grossProfit - expenses + otherIncome;

  res.json({ revenue, contraRevenue, netRevenue, cogs, grossProfit, expenses, otherIncome, netProfit, revenueItems, contraRevenueItems, cogsItems, expenseItems, otherIncomeItems });
});

router.get('/balance-sheet', protect, async (req, res) => {
  const fyFilter = req.fyFilter && Object.keys(req.fyFilter).length ? req.fyFilter : {};
  const dateFilter = {};
  if (req.query.asOf) {
    const asOf = new Date(req.query.asOf);
    asOf.setUTCHours(23, 59, 59, 999);
    dateFilter.date = { $lte: asOf };
  }
  const trialBalance = await (async () => {
    const entries = await JournalEntry.find({ ...fyFilter, ...dateFilter, ...req.companyFilter });
    const accounts = await Account.find({ ...req.companyFilter });
    const bals = {};
    accounts.forEach(a => { bals[a._id.toString()] = { debit: 0, credit: 0, account: a }; });
    entries.forEach(e => e.lines.forEach(l => {
      const id = l.account.toString();
      if (bals[id]) { bals[id].debit += l.debit; bals[id].credit += l.credit; }
    }));
    return accounts.map(a => {
      const b = bals[a._id.toString()];
      const isDebitNormal = ['asset', 'expense', 'contra_revenue'].includes(a.type);
      const balance = isDebitNormal
        ? (b?.debit || 0) - (b?.credit || 0)
        : (b?.credit || 0) - (b?.debit || 0);
      return { account: a, balance, debit: b?.debit || 0, credit: b?.credit || 0 };
    });
  })();

  const sumAccounts = (filterFn) => trialBalance.filter(filterFn).map(t => ({
    _id: t.account._id, code: t.account.code, name: t.account.name, balance: t.balance,
  }));

  const currentAssetItems = sumAccounts(t => t.account.category === 'current_asset' && t.balance !== 0);
  const fixedAssetItems = sumAccounts(t => t.account.category === 'fixed_asset' && t.balance !== 0);
  const contraAssetItems = sumAccounts(t => t.account.type === 'contra_asset' && t.balance !== 0);
  const currentLiabilityItems = sumAccounts(t => t.account.category === 'current_liability' && t.balance !== 0);
  const longTermLiabilityItems = sumAccounts(t => t.account.category === 'long_term_liability' && t.balance !== 0);
  const equityItems = sumAccounts(t => t.account.category === 'equity' && t.balance !== 0);

  const currentAssets = currentAssetItems.reduce((s, t) => s + t.balance, 0);
  const fixedAssets = fixedAssetItems.reduce((s, t) => s + t.balance, 0);
  const contraAssets = contraAssetItems.reduce((s, t) => s + Math.abs(t.balance), 0);
  const currentLiabilities = currentLiabilityItems.reduce((s, t) => s + t.balance, 0);
  const longTermLiabilities = longTermLiabilityItems.reduce((s, t) => s + t.balance, 0);
  const equity = equityItems.reduce((s, t) => s + t.balance, 0);

  const revenue = trialBalance.filter(t => t.account.type === 'revenue' && t.account.category !== 'contra_revenue').reduce((s, t) => s + t.balance, 0);
  const contraRevenue = trialBalance.filter(t => t.account.category === 'contra_revenue').reduce((s, t) => s + Math.abs(t.balance), 0);
  const cogs = trialBalance.filter(t => t.account.category === 'cogs').reduce((s, t) => s + Math.abs(t.balance), 0);
  const expenses = trialBalance.filter(t => t.account.category === 'operating_expense').reduce((s, t) => s + Math.abs(t.balance), 0);
  const otherIncome = trialBalance.filter(t => t.account.category === 'other_income').reduce((s, t) => s + t.balance, 0);
  const netIncome = (revenue - contraRevenue) - cogs - expenses + otherIncome;

  res.json({
    currentAssets, fixedAssets, contraAssets, totalAssets: currentAssets + fixedAssets - contraAssets,
    currentAssetsItems: currentAssetItems,
    fixedAssetsItems: fixedAssetItems,
    contraAssetsItems: contraAssetItems,
    currentLiabilities, longTermLiabilities, totalLiabilities: currentLiabilities + longTermLiabilities,
    currentLiabilitiesItems: currentLiabilityItems,
    longTermLiabilitiesItems: longTermLiabilityItems,
    equity, totalEquity: equity,
    equityItems,
    netIncome,
    netIncomeItems: [
      { name: 'Revenue', balance: revenue - contraRevenue },
      ...(contraRevenue > 0 ? [{ name: 'Less: Discount/Returns', balance: -contraRevenue }] : []),
      ...(cogs > 0 ? [{ name: 'Cost of Goods Sold', balance: -cogs }] : []),
      ...(expenses > 0 ? [{ name: 'Operating Expenses', balance: -expenses }] : []),
      ...(otherIncome > 0 ? [{ name: 'Other Income', balance: otherIncome }] : []),
    ],
  });
});

// ─── LEDGER ───
router.get('/ledger/:accountId', protect, async (req, res) => {
  const { startDate, endDate, fiscalYearId } = req.query;
  const dateFilter = {};
  if (startDate) dateFilter.date = { ...dateFilter.date, $gte: new Date(startDate) };
  if (endDate) dateFilter.date = { ...dateFilter.date, $lte: new Date(endDate) };

  const account = await Account.findOne({ _id: req.params.accountId, ...req.companyFilter });
  if (!account) return res.status(404).json({ message: 'Account not found' });

  // For parent accounts (10300 AR, 20100 AP), include all sub-accounts (103**, 201**)
  let accountIds = [account._id];
  const isParentAccount = ['10300', '20100'].includes(account.code);
  if (isParentAccount) {
    const subAccounts = await Account.find({ code: { $regex: `^${account.code.slice(0, 3)}` }, ...req.companyFilter });
    accountIds = subAccounts.map(a => a._id);
  }

  // Scope the ledger by the fiscal year the entry was recorded in when an explicit
  // fiscalYearId is supplied. Otherwise fall back to a date range (fiscal year bounds
  // derived from the selected FY, or explicit From/To dates).
  let scopeFilter = {};
  let scopeYear = null;
  let periodStart = null;

  if (fiscalYearId) {
    scopeFilter = { fiscalYearId };
    scopeYear = await FiscalYear.findById(fiscalYearId);
    if (scopeYear) periodStart = new Date(scopeYear.startDate);
  } else if (!startDate && !endDate) {
    if (req.fiscalYearId) {
      const year = await FiscalYear.findById(req.fiscalYearId);
      if (year) {
        scopeFilter = { date: { $gte: new Date(year.startDate), $lte: new Date(year.endDate) } };
        periodStart = new Date(year.startDate);
        scopeYear = year;
      }
    } else if (req.query.fyStart && req.query.fyEnd) {
      scopeFilter = { date: { $gte: new Date(req.query.fyStart), $lte: new Date(req.query.fyEnd) } };
      periodStart = new Date(req.query.fyStart);
    }
  }

  const isDebit = ['asset', 'expense', 'contra_revenue'].includes(account.type);

  // Opening balance: all posted entries dated before the period start.
  let opening = 0;
  if (periodStart) {
    const prior = await JournalEntry.find({
      'lines.account': { $in: accountIds }, isPosted: true,
      ...req.companyFilter, date: { $lt: periodStart },
    });
    for (const e of prior) {
      for (const acctId of accountIds) {
        const line = e.lines.find(l => l.account?._id?.toString() === acctId.toString() || l.account?.toString() === acctId.toString());
        if (line) {
          const debit = line?.debit || 0;
          const credit = line?.credit || 0;
          if (isDebit) opening += debit - credit;
          else opening += credit - debit;
        }
      }
    }
  }

  // Entries in the period: use the fiscal-year / date scope, not createdAt-based fyFilter
  const entries = await JournalEntry.find({ 'lines.account': { $in: accountIds }, isPosted: true, ...req.companyFilter, ...scopeFilter, ...dateFilter })
    .populate('lines.account', 'code name')
    .populate('createdBy', 'name')
    .sort({ date: 1, createdAt: 1 });

  let balance = opening;
  const rows = [];
  if (periodStart && opening !== 0) {
    rows.push({
      _id: 'opening',
      date: periodStart,
      reference: 'Opening',
      description: 'Opening Balance',
      debit: isDebit ? opening : 0,
      credit: isDebit ? 0 : opening,
      balance: opening,
    });
  }
  for (const e of entries) {
    let debit = 0, credit = 0;
    for (const acctId of accountIds) {
      const line = e.lines.find(l => l.account?._id?.toString() === acctId.toString() || l.account?.toString() === acctId.toString());
      if (line) {
        debit += line?.debit || 0;
        credit += line?.credit || 0;
      }
    }
    if (isDebit) balance += debit - credit;
    else balance += credit - debit;
    rows.push({
      _id: e._id, date: e.date, reference: e.reference, description: e.description,
      debit, credit, balance,
    });
  }

  res.json({ account, entries: rows, openingBalance: opening, currentBalance: balance, fiscalYear: scopeYear ? { _id: scopeYear._id, name: scopeYear.name } : null });
});

// ─── CASH FLOW ───
router.get('/cash-flow', protect, async (req, res) => {
  const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
  const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
  if (!cashAccount && !bankAccount) return res.json({ inflows: [], outflows: [], netCash: 0 });

  const accountIds = [cashAccount?._id, bankAccount?._id].filter(Boolean);
  const entries = await JournalEntry.find({ isPosted: true, 'lines.account': { $in: accountIds }, ...req.companyFilter }).sort({ date: -1 }).limit(200);
  const cashEntries = entries.filter(e => e.lines.some(l => l.account?.toString() === cashAccount?._id?.toString() && l.debit > 0));
  const cashOutflows = entries.filter(e => e.lines.some(l => l.account?.toString() === cashAccount?._id?.toString() && l.credit > 0));

  const inflows = cashEntries.slice(0, 20).map(e => ({
    date: e.date, reference: e.reference, description: e.description,
    amount: e.lines.reduce((s, l) => s + (l.account?.toString() === cashAccount?._id?.toString() ? l.debit : 0), 0),
  }));
  const outflows = cashOutflows.slice(0, 20).map(e => ({
    date: e.date, reference: e.reference, description: e.description,
    amount: e.lines.reduce((s, l) => s + (l.account?.toString() === cashAccount?._id?.toString() ? l.credit : 0), 0),
  }));

  const totalInflows = inflows.reduce((s, i) => s + i.amount, 0);
  const totalOutflows = outflows.reduce((s, i) => s + i.amount, 0);

  res.json({ inflows, outflows, netCash: cashAccount?.balance || 0, totalInflows, totalOutflows });
});

// ─── AGING REPORT ───
router.get('/aging', protect, async (req, res) => {
  const receivableAccount = await Account.findOne({ code: '10300', ...req.companyFilter });
  const payableAccount = await Account.findOne({ code: '20100', ...req.companyFilter });
  const sales = await Sale.find({ paymentMethod: 'credit', status: 'completed', ...req.companyFilter }).populate('customer', 'name phone').sort({ createdAt: -1 });
  const purchases = await Purchase.find({ dueAmount: { $gt: 0 }, ...req.companyFilter }).populate('supplier', 'name').sort({ createdAt: -1 });
  const emis = await Emi.find({ remainingAmount: { $gt: 0 }, ...req.companyFilter }).populate('customer', 'name phone').sort({ createdAt: -1 });

  const now = new Date();
  const getBucket = (date) => {
    const days = Math.floor((now - new Date(date)) / (1000 * 60 * 60 * 24));
    if (days <= 30) return '0-30 days';
    if (days <= 60) return '31-60 days';
    if (days <= 90) return '61-90 days';
    return '90+ days';
  };

  const receivable = sales.map(s => ({
    _id: s._id, customer: s.customer?.name || 'Unknown', phone: s.customer?.phone || '',
    invoice: s.invoiceNumber, date: s.createdAt, amount: s.grandTotal,
    bucket: getBucket(s.createdAt),
  }));

  const emiReceivable = emis.map(e => ({
    _id: e._id, customer: e.customer?.name || 'Unknown', phone: e.customer?.phone || '',
    invoice: e.emiNumber, date: e.createdAt, amount: e.remainingAmount,
    bucket: getBucket(e.createdAt), type: 'EMI',
    bank: e.bankName ? `EMI-(${e.bankName})` : '',
  }));

  const payable = purchases.map(p => ({
    _id: p._id, supplier: p.supplier?.name || 'Unknown',
    purchaseNumber: p.purchaseNumber, date: p.createdAt, amount: p.dueAmount,
    bucket: getBucket(p.createdAt),
  }));

  res.json({ receivable: [...receivable, ...emiReceivable], payable });
});

// ─── VAT REPORT ───
router.get('/vat-report', protect, async (req, res) => {
  const { startDate, endDate } = req.query;
  const filter = { isPosted: true };
  if (startDate) filter.date = { ...filter.date, $gte: new Date(startDate) };
  if (endDate) filter.date = { ...filter.date, $lte: new Date(endDate) };

  const vatOutputAccount = await Account.findOne({ code: '20200', ...req.companyFilter });
  const vatInputAccount = await Account.findOne({ code: '10501', ...req.companyFilter });

  let outputVAT = 0, inputVAT = 0, salesWithVAT = 0, purchasesWithVAT = 0, tdsOnPurchases = 0;

  if (vatOutputAccount) {
    const vatEntries = await JournalEntry.find({ 'lines.account': vatOutputAccount._id, ...filter, ...req.companyFilter });
    outputVAT = vatEntries.reduce((s, e) => s + e.lines.reduce((sum, l) => sum + (l.account?.toString() === vatOutputAccount._id?.toString() ? l.credit - l.debit : 0), 0), 0);
    salesWithVAT = vatEntries.length;
  }
  if (vatInputAccount) {
    const vatEntries = await JournalEntry.find({ 'lines.account': vatInputAccount._id, ...filter, ...req.companyFilter });
    inputVAT = vatEntries.reduce((s, e) => s + e.lines.reduce((sum, l) => sum + (l.account?.toString() === vatInputAccount._id?.toString() ? l.debit - l.credit : 0), 0), 0);
    purchasesWithVAT = vatEntries.length;
  }

  const purchaseFilter = { status: 'received' };
  if (startDate) purchaseFilter.date = { $gte: new Date(startDate) };
  if (endDate) purchaseFilter.date = { ...purchaseFilter.date, $lte: new Date(endDate) };
  const purchases = await Purchase.find({ ...purchaseFilter, ...req.companyFilter });
  tdsOnPurchases = purchases.reduce((s, p) => s + (p.tds || 0), 0);

  const netVATPayable = outputVAT - inputVAT;
  res.json({
    outputVAT, inputVAT, netVATPayable,
    salesWithVAT, purchasesWithVAT,
    tds: tdsOnPurchases,
    rate: 13,
    fiscalYear: getFiscalYear(startDate || new Date()),
  });
});

// ─── ANNEX 13 (Nepal VAT Return Summary) ───
router.get('/annex13', protect, async (req, res) => {
  const { startDate, endDate } = req.query;
  const saleFilter = {};
  const purchaseFilter = {};
  if (startDate) {
    saleFilter.createdAt = { $gte: new Date(startDate) };
    purchaseFilter.date = { $gte: new Date(startDate) };
  }
  if (endDate) {
    saleFilter.createdAt = { ...saleFilter.createdAt, $lte: new Date(endDate) };
    purchaseFilter.date = { ...purchaseFilter.date, $lte: new Date(endDate) };
  }

  const sales = await Sale.find({ status: 'completed', ...saleFilter, ...req.companyFilter });
  const purchases = await Purchase.find({ status: 'received', ...purchaseFilter, ...req.companyFilter });
  const vatOutputAccount = await Account.findOne({ code: '20200', ...req.companyFilter });
  const vatInputAccount = await Account.findOne({ code: '10501', ...req.companyFilter });

  const totalSales = sales.reduce((s, sale) => s + (sale.grandTotal || 0), 0);
  const totalPurchases = purchases.reduce((s, p) => s + (p.grandTotal || 0), 0);

  let outputVAT = sales.reduce((s, sale) => s + (sale.taxTotal || 0), 0);
  let inputVAT = purchases.reduce((s, p) => s + (p.tax || 0), 0);
  const tds = purchases.reduce((s, p) => s + (p.tds || 0), 0);
  const taxableSales = Math.max(0, totalSales - outputVAT);
  const taxablePurchases = Math.max(0, totalPurchases - inputVAT);

  res.json({
    fiscalYear: getFiscalYear(startDate || new Date()),
    period: startDate && endDate ? `${startDate} to ${endDate}` : 'Current period',
    totalSales, taxableSales, outputVAT,
    totalPurchases, taxablePurchases, inputVAT, tds,
    netVAT: outputVAT - inputVAT,
    salesCount: sales.length, purchaseCount: purchases.length,
    vatRate: 13,
  });
});

// ─── TDS REPORT (Purchases with TDS withheld) ───
router.get('/tds-report', protect, async (req, res) => {
  const { startDate, endDate } = req.query;
  const filter = { status: 'received', tds: { $gt: 0 } };
  if (startDate) filter.date = { $gte: new Date(startDate) };
  if (endDate) filter.date = { ...filter.date, $lte: new Date(endDate) };

  const purchases = await Purchase.find({ ...filter, ...req.companyFilter })
    .populate('supplier', 'name pan')
    .sort({ date: -1 });

  const bySupplier = {};
  for (const p of purchases) {
    const key = p.supplier?._id?.toString() || 'unknown';
    if (!bySupplier[key]) bySupplier[key] = { supplier: p.supplier, count: 0, amount: 0, tds: 0 };
    bySupplier[key].count += 1;
    bySupplier[key].amount += p.grandTotal || 0;
    bySupplier[key].tds += p.tds || 0;
  }

  res.json({
    fiscalYear: getFiscalYear(startDate || new Date()),
    period: startDate && endDate ? `${startDate} to ${endDate}` : 'Current period',
    totalTds: purchases.reduce((s, p) => s + (p.tds || 0), 0),
    totalAmount: purchases.reduce((s, p) => s + (p.grandTotal || 0), 0),
    totalPurchases: purchases.length,
    bySupplier: Object.values(bySupplier),
    purchases: purchases.map(p => ({
      _id: p._id, date: p.date, purchaseNumber: p.purchaseNumber,
      supplierInvoiceNo: p.supplierInvoiceNo || '',
      supplier: p.supplier, grandTotal: p.grandTotal || 0,
      vatPercent: p.vatPercent || 0, tdsRate: p.tdsRate || 0, tds: p.tds || 0,
      netPayable: (p.grandTotal || 0) - (p.tds || 0),
    })),
  });
});

const NEPALI_MONTHS = ['Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra', 'Baishakh', 'Jestha', 'Ashadh'];

// Months of the Nepali fiscal year starting from Shrawan 1 (~Jul 16 AD)
function nepaliMonths(fyStart) {
  const Y = fyStart.getFullYear();
  const starts = [];
  for (let i = 0; i < 12; i++) {
    const year = i < 6 ? Y : Y + 1;
    const adMonth = i < 6 ? 6 + i : i - 6;
    const day = i === 0 ? 16 : 17;
    starts.push(new Date(year, adMonth, day));
  }
  const ends = [];
  for (let i = 0; i < 12; i++) {
    ends.push(i < 11 ? starts[i + 1] : new Date(Y + 1, 6, 16));
  }
  return { starts, ends };
}

function nepaliMonthIndex(date, starts, ends) {
  const t = date.getTime();
  for (let i = 0; i < 12; i++) {
    if (t >= starts[i].getTime() && t < ends[i].getTime()) return i;
  }
  return -1;
}

// ─── VAT MONTHLY FILING PERIODS + REMINDER ───
router.get('/vat-periods', protect, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const fyStart = req.fyFilter?.createdAt?.$gte ? new Date(req.fyFilter.createdAt.$gte) : null;
  let startYear;
  if (fyStart) {
    startYear = fyStart.getFullYear();
  } else {
    const m = today.getMonth() + 1, d = today.getDate();
    startYear = (m > 7 || (m === 7 && d >= 16)) ? today.getFullYear() : today.getFullYear() - 1;
  }
  const base = new Date(startYear, 6, 16);
  const { starts, ends } = nepaliMonths(base);

  const vatOutputAccount = await Account.findOne({ code: '20200', ...req.companyFilter });
  const vatInputAccount = await Account.findOne({ code: '10501', ...req.companyFilter });
  const output = Array(12).fill(0);
  const input = Array(12).fill(0);

  const bucket = async (account, isOutput) => {
    if (!account) return;
    const entries = await JournalEntry.find({ 'lines.account': account._id, date: { $gte: base, $lt: ends[11] }, isPosted: true, ...req.companyFilter });
    for (const e of entries) {
      const idx = nepaliMonthIndex(e.date, starts, ends);
      if (idx < 0) continue;
      let val = 0;
      for (const l of e.lines) {
        if (l.account?.toString() === account._id.toString()) val += isOutput ? (l.credit - l.debit) : (l.debit - l.credit);
      }
      if (isOutput) output[idx] += val; else input[idx] += val;
    }
  };
  await bucket(vatOutputAccount, true);
  await bucket(vatInputAccount, false);

  const months = [];
  for (let i = 0; i < 12; i++) {
    const bsYear = i < 6 ? startYear + 57 : startYear + 56;
    const deadline = new Date(ends[i].getTime() + 24 * 86400000);
    const net = output[i] - input[i];
    const t = today.getTime();
    months.push({
      index: i,
      name: NEPALI_MONTHS[i],
      nextMonth: NEPALI_MONTHS[(i + 1) % 12],
      bsYear,
      label: `${NEPALI_MONTHS[i]} ${bsYear}`,
      start: starts[i], end: ends[i], deadline,
      outputVAT: Math.round(output[i] * 100) / 100,
      inputVAT: Math.round(input[i] * 100) / 100,
      netVAT: Math.round(net * 100) / 100,
      overdue: deadline.getTime() < t,
      daysToDeadline: Math.ceil((deadline.getTime() - t) / 86400000),
      isCurrent: t >= starts[i].getTime() && t < ends[i].getTime(),
      isFuture: starts[i].getTime() > t,
    });
  }

  let reminder = null;
  const curIdx = nepaliMonthIndex(today, starts, ends);
  if (curIdx >= 0) {
    const m = months[curIdx];
    const filingIdx = curIdx === 0 ? null : curIdx - 1;
    reminder = {
      currentMonth: m.label,
      filingMonth: filingIdx !== null ? months[filingIdx].label : null,
      netVAT: filingIdx !== null ? months[filingIdx].netVAT : null,
      deadline: m.deadline,
      overdue: m.overdue,
      daysLeft: m.daysToDeadline,
    };
  }

  res.json({
    fiscalYear: `${startYear + 57}/${startYear + 58}`,
    months, reminder,
  });
});

function getFiscalYear(date) {
  const d = new Date(date);
  const m = d.getMonth() + 1, y = d.getFullYear(), dy = d.getDate();
  const adStart = (m > 7 || (m === 7 && dy >= 16)) ? y : y - 1;
  const bsStart = adStart + 57;
  return `${String(bsStart).slice(-2)}/${String(bsStart + 1).slice(-2)}`;
}

module.exports = router;
