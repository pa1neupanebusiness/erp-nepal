const express = require('express');
const Account = require('../models/Account');
const AccountGroup = require('../models/AccountGroup');
const JournalEntry = require('../models/JournalEntry');
const Voucher = require('../models/Voucher');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Company = require('../models/Company');
const FiscalYear = require('../models/FiscalYear');
const { protect } = require('../middleware/auth');
const { getPrintStyles } = require('../utils/printStyles');
const { adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const router = express.Router();

/* ───────────────────────────── HELPERS ────────────────────────── */

function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
}

function getFiscalYearLabel(date) {
  return getBSFiscalYear(date).label;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function getCompanyHeader(companyId) {
  const company = await Company.findById(companyId).lean().catch(() => null);
  if (!company) return { name: 'Company', pan: '', address: '', phone: '', city: '' };
  return {
    name: company.name || 'Company',
    pan: company.pan || '',
    address: company.address || '',
    phone: company.phone || '',
    city: company.city || '',
    currency: company.currency || 'NPR',
  };
}

/* ──────────────── HTML SHELL ──────────────── */

function htmlShell({ title, subtitle, company, period, body, printJs, showTimestamp = true }) {
  const now = new Date();
  const bsDate = adToBikramSambat(now);
  const bsTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const timestampHtml = showTimestamp
    ? `<span>Generated: ${escapeHtml(bsDate)}, ${escapeHtml(bsTime)}</span>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — ${escapeHtml(company.name)}</title>
<style>${getPrintStyles()}</style>
</head>
<body>
<div class="page-frame">
  <div class="report-header">
    <div class="company-name">${escapeHtml(company.name)}</div>
    ${company.pan ? `<div class="subtitle">PAN No: ${escapeHtml(company.pan)}</div>` : ''}
    ${company.address || company.city ? `<div class="subtitle">${escapeHtml(company.address)}${company.city ? ', ' + escapeHtml(company.city) : ''}</div>` : ''}
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">${escapeHtml(period)}</div>
  </div>

  ${body}

  <div class="report-footer">
    ${timestampHtml}
    <span>Page <span class="page-num"></span> of <span class="pages-total"></span></span>
  </div>
</div>

<script>
(function() {
  ${printJs || ''}
  window.onload = function() { setTimeout(function() { window.print(); }, 300); };
})();
</script>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════════
   TRIAL BALANCE
   ═══════════════════════════════════════════════════════════════════ */

async function generateTrialBalance(companyFilter, companyId, fyFilter) {
  const company = await getCompanyHeader(companyId);
  const fiscalYear = fyFilter?.createdAt?.$gte
    ? getFiscalYearLabel(fyFilter.createdAt.$gte)
    : getFiscalYearLabel(new Date());

  const accounts = await Account.find({ ...companyFilter, isActive: true }).sort({ code: 1 }).lean();
  const entries = await JournalEntry.find({ isPosted: true, ...companyFilter, ...fyFilter }).lean();

  const accountMap = new Map(accounts.map(a => [a._id.toString(), { ...a, totalDebit: 0, totalCredit: 0 }]));

  for (const entry of entries) {
    for (const line of entry.lines) {
      const id = line.account?.toString?.() || line.account;
      const acc = accountMap.get(id);
      if (acc) {
        acc.totalDebit += line.debit || 0;
        acc.totalCredit += line.credit || 0;
      }
    }
  }

  const rows = [];
  let grandDebit = 0, grandCredit = 0;

  for (const acc of accountMap.values()) {
    const net = acc.totalDebit - acc.totalCredit;
    if (acc.totalDebit === 0 && acc.totalCredit === 0) continue;
    const isDebit = net >= 0;
    rows.push({
      code: acc.code,
      name: acc.name,
      debit: isDebit ? net : 0,
      credit: isDebit ? 0 : -net,
      type: acc.type,
    });
    grandDebit += isDebit ? net : 0;
    grandCredit += isDebit ? 0 : -net;
  }

  const tableRows = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.code)}</td>
      <td class="indent-1">${escapeHtml(r.name)}</td>
      <td class="num">${r.debit > 0 ? fmt(r.debit) : ''}</td>
      <td class="num">${r.credit > 0 ? fmt(r.credit) : ''}</td>
    </tr>
  `).join('');

  const body = `
<table class="report-table">
  <thead>
    <tr>
      <th style="width:10%">Code</th>
      <th>Account Name</th>
      <th class="num" style="width:20%">Debit (Rs.)</th>
      <th class="num" style="width:20%">Credit (Rs.)</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
  <tfoot>
    <tr class="grand-total-row">
      <td colspan="2" class="text-right font-bold">TOTAL</td>
      <td class="num">${fmt(grandDebit)}</td>
      <td class="num">${fmt(grandCredit)}</td>
    </tr>
  </tfoot>
</table>

<div class="signature-block">
  <div><div class="sig-line">Prepared By</div></div>
  <div><div class="sig-line">Verified By</div></div>
  <div><div class="sig-line">Authorized Signatory</div></div>
</div>`;

  return htmlShell({
    title: 'Trial Balance',
    subtitle: '',
    company,
    period: `Fiscal Year ${fiscalYear}`,
    body,
    printJs: '',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   PROFIT & LOSS (INCOME STATEMENT)
   ═══════════════════════════════════════════════════════════════════ */

async function generateProfitLoss(companyFilter, companyId, fyFilter) {
  const company = await getCompanyHeader(companyId);
  const fiscalYear = fyFilter?.createdAt?.$gte
    ? getFiscalYearLabel(fyFilter.createdAt.$gte)
    : getFiscalYearLabel(new Date());

  const accounts = await Account.find({ ...companyFilter, isActive: true }).sort({ code: 1 }).lean();
  const entries = await JournalEntry.find({ isPosted: true, ...companyFilter, ...fyFilter }).lean();

  const accountMap = new Map(accounts.map(a => [a._id.toString(), { ...a, totalDebit: 0, totalCredit: 0 }]));

  for (const entry of entries) {
    for (const line of entry.lines) {
      const id = line.account?.toString?.() || line.account;
      const acc = accountMap.get(id);
      if (acc) {
        acc.totalDebit += line.debit || 0;
        acc.totalCredit += line.credit || 0;
      }
    }
  }

  const allAccounts = Array.from(accountMap.values());

  const revenue = allAccounts
    .filter(a => a.type === 'revenue')
    .map(a => ({ ...a, balance: a.totalCredit - a.totalDebit }))
    .filter(a => a.balance !== 0);

  const contraRevenue = allAccounts
    .filter(a => a.type === 'contra_revenue')
    .map(a => ({ ...a, balance: a.totalDebit - a.totalCredit }))
    .filter(a => a.balance !== 0);

  const cogs = allAccounts
    .filter(a => a.category === 'cogs')
    .map(a => ({ ...a, balance: a.totalDebit - a.totalCredit }))
    .filter(a => a.balance !== 0);

  const operatingExpenses = allAccounts
    .filter(a => a.category === 'operating_expense')
    .map(a => ({ ...a, balance: a.totalDebit - a.totalCredit }))
    .filter(a => a.balance !== 0);

  const otherIncome = allAccounts
    .filter(a => a.category === 'other_income')
    .map(a => ({ ...a, balance: a.totalCredit - a.totalDebit }))
    .filter(a => a.balance !== 0);

  const otherExpense = allAccounts
    .filter(a => a.category === 'other_expense')
    .map(a => ({ ...a, balance: a.totalDebit - a.totalCredit }))
    .filter(a => a.balance !== 0);

  const totalRevenue = revenue.reduce((s, a) => s + a.balance, 0);
  const totalContraRevenue = contraRevenue.reduce((s, a) => s + a.balance, 0);
  const netRevenue = totalRevenue - totalContraRevenue;
  const totalCOGS = cogs.reduce((s, a) => s + a.balance, 0);
  const grossProfit = netRevenue - totalCOGS;
  const totalOpEx = operatingExpenses.reduce((s, a) => s + a.balance, 0);
  const totalOtherIncome = otherIncome.reduce((s, a) => s + a.balance, 0);
  const totalOtherExpense = otherExpense.reduce((s, a) => s + a.balance, 0);
  const netProfit = grossProfit - totalOpEx + totalOtherIncome - totalOtherExpense;

  function sectionRows(items, indent) {
    return items.map(a => `
      <tr>
        <td class="${indent}">${escapeHtml(a.code)}</td>
        <td class="${indent}">${escapeHtml(a.name)}</td>
        <td class="num">${fmt(a.balance)}</td>
      </tr>
    `).join('');
  }

  const body = `
<table class="report-table">
  <thead>
    <tr>
      <th style="width:10%">Code</th>
      <th>Particulars</th>
      <th class="num" style="width:22%">Amount (Rs.)</th>
    </tr>
  </thead>
  <tbody>
    <!-- Revenue -->
    <tr class="group-header"><td colspan="3">Income</td></tr>
    ${sectionRows(revenue, 'indent-1')}
    ${contraRevenue.length ? `<tr class="subtotal-row"><td colspan="2" class="text-right">Less: Discounts & Returns</td><td class="num">${fmt(totalContraRevenue)}</td></tr>` : ''}
    <tr class="subtotal-row"><td colspan="2" class="text-right font-bold">Net Revenue</td><td class="num font-bold">${fmt(netRevenue)}</td></tr>

    <!-- COGS -->
    <tr class="group-header"><td colspan="3">Cost of Goods Sold</td></tr>
    ${sectionRows(cogs, 'indent-1')}
    <tr class="subtotal-row"><td colspan="2" class="text-right font-bold">Total COGS</td><td class="num font-bold">${fmt(totalCOGS)}</td></tr>

    <!-- Gross Profit -->
    <tr class="grand-total-row">
      <td colspan="2" class="text-right">GROSS PROFIT</td>
      <td class="num">${fmt(grossProfit)}</td>
    </tr>

    <!-- Operating Expenses -->
    <tr class="group-header"><td colspan="3">Operating Expenses</td></tr>
    ${sectionRows(operatingExpenses, 'indent-1')}
    <tr class="subtotal-row"><td colspan="2" class="text-right font-bold">Total Operating Expenses</td><td class="num font-bold">${fmt(totalOpEx)}</td></tr>

    <!-- Other Income / Expense -->
    ${otherIncome.length ? `
    <tr class="group-header"><td colspan="3">Other Income</td></tr>
    ${sectionRows(otherIncome, 'indent-1')}
    <tr class="subtotal-row"><td colspan="2" class="text-right">Total Other Income</td><td class="num">${fmt(totalOtherIncome)}</td></tr>
    ` : ''}

    ${otherExpense.length ? `
    <tr class="group-header"><td colspan="3">Other Expenses</td></tr>
    ${sectionRows(otherExpense, 'indent-1')}
    <tr class="subtotal-row"><td colspan="2" class="text-right">Total Other Expenses</td><td class="num">${fmt(totalOtherExpense)}</td></tr>
    ` : ''}

    <!-- Net Profit -->
    <tr class="grand-total-row">
      <td colspan="2" class="text-right">${netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS'}</td>
      <td class="num">${fmt(Math.abs(netProfit))}</td>
    </tr>
  </tbody>
</table>

<div class="signature-block">
  <div><div class="sig-line">Prepared By</div></div>
  <div><div class="sig-line">Verified By</div></div>
  <div><div class="sig-line">Authorized Signatory</div></div>
</div>`;

  return htmlShell({
    title: 'Profit & Loss Statement',
    subtitle: '',
    company,
    period: `Fiscal Year ${fiscalYear}`,
    body,
    printJs: '',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   BALANCE SHEET
   ═══════════════════════════════════════════════════════════════════ */

async function generateBalanceSheet(companyFilter, companyId, fyFilter) {
  const company = await getCompanyHeader(companyId);
  const fiscalYear = fyFilter?.createdAt?.$gte
    ? getFiscalYearLabel(fyFilter.createdAt.$gte)
    : getFiscalYearLabel(new Date());

  const accounts = await Account.find({ ...companyFilter, isActive: true }).sort({ code: 1 }).lean();
  const entries = await JournalEntry.find({ isPosted: true, ...companyFilter, ...fyFilter }).lean();

  const accountMap = new Map(accounts.map(a => [a._id.toString(), { ...a, totalDebit: 0, totalCredit: 0 }]));

  for (const entry of entries) {
    for (const line of entry.lines) {
      const id = line.account?.toString?.() || line.account;
      const acc = accountMap.get(id);
      if (acc) {
        acc.totalDebit += line.debit || 0;
        acc.totalCredit += line.credit || 0;
      }
    }
  }

  const allAccounts = Array.from(accountMap.values());

  const currentAssets = allAccounts
    .filter(a => a.category === 'current_asset')
    .map(a => ({ ...a, balance: a.totalDebit - a.totalCredit }))
    .filter(a => a.balance !== 0);

  const fixedAssets = allAccounts
    .filter(a => a.category === 'fixed_asset')
    .map(a => ({ ...a, balance: a.totalDebit - a.totalCredit }))
    .filter(a => a.balance !== 0);

  const contraAssets = allAccounts
    .filter(a => a.type === 'contra_asset')
    .map(a => ({ ...a, balance: a.totalCredit - a.totalDebit }))
    .filter(a => a.balance !== 0);

  const currentLiabilities = allAccounts
    .filter(a => a.category === 'current_liability')
    .map(a => ({ ...a, balance: a.totalCredit - a.totalDebit }))
    .filter(a => a.balance !== 0);

  const longTermLiabilities = allAccounts
    .filter(a => a.category === 'long_term_liability')
    .map(a => ({ ...a, balance: a.totalCredit - a.totalDebit }))
    .filter(a => a.balance !== 0);

  const equity = allAccounts
    .filter(a => a.category === 'equity')
    .map(a => ({ ...a, balance: a.totalCredit - a.totalDebit }))
    .filter(a => a.balance !== 0);

  const totalCurrentAssets = currentAssets.reduce((s, a) => s + a.balance, 0);
  const totalFixedAssets = fixedAssets.reduce((s, a) => s + a.balance, 0);
  const totalContraAssets = contraAssets.reduce((s, a) => s + a.balance, 0);
  const totalAssets = totalCurrentAssets + totalFixedAssets - totalContraAssets;

  const totalCurrentLiabilities = currentLiabilities.reduce((s, a) => s + a.balance, 0);
  const totalLongTermLiabilities = longTermLiabilities.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0);
  const totalLiabAndEquity = totalLiabilities + totalEquity;

  function sectionRows(items, indent) {
    return items.map(a => `
      <tr>
        <td class="${indent}">${escapeHtml(a.code)}</td>
        <td class="${indent}">${escapeHtml(a.name)}</td>
        <td class="num">${fmt(a.balance)}</td>
      </tr>
    `).join('');
  }

  const body = `
<table class="report-table">
  <thead>
    <tr>
      <th style="width:10%">Code</th>
      <th>Particulars</th>
      <th class="num" style="width:22%">Amount (Rs.)</th>
    </tr>
  </thead>
  <tbody>
    <!-- ASSETS -->
    <tr class="group-header"><td colspan="3">Assets</td></tr>

    <tr><td colspan="2" class="indent-1 font-bold">Current Assets</td><td></td></tr>
    ${sectionRows(currentAssets, 'indent-2')}
    <tr class="subtotal-row"><td colspan="2" class="text-right">Total Current Assets</td><td class="num">${fmt(totalCurrentAssets)}</td></tr>

    <tr><td colspan="2" class="indent-1 font-bold">Fixed Assets</td><td></td></tr>
    ${sectionRows(fixedAssets, 'indent-2')}
    ${contraAssets.length ? `
    <tr><td colspan="2" class="indent-2 color-muted">Less: Accumulated Depreciation</td><td class="num color-muted">(${fmt(totalContraAssets)})</td></tr>
    ` : ''}
    <tr class="subtotal-row"><td colspan="2" class="text-right">Net Fixed Assets</td><td class="num">${fmt(totalFixedAssets - totalContraAssets)}</td></tr>

    <tr class="grand-total-row">
      <td colspan="2" class="text-right">TOTAL ASSETS</td>
      <td class="num">${fmt(totalAssets)}</td>
    </tr>

    <!-- LIABILITIES -->
    <tr class="group-header"><td colspan="3">Liabilities</td></tr>

    <tr><td colspan="2" class="indent-1 font-bold">Current Liabilities</td><td></td></tr>
    ${sectionRows(currentLiabilities, 'indent-2')}
    <tr class="subtotal-row"><td colspan="2" class="text-right">Total Current Liabilities</td><td class="num">${fmt(totalCurrentLiabilities)}</td></tr>

    ${longTermLiabilities.length ? `
    <tr><td colspan="2" class="indent-1 font-bold">Long-term Liabilities</td><td></td></tr>
    ${sectionRows(longTermLiabilities, 'indent-2')}
    <tr class="subtotal-row"><td colspan="2" class="text-right">Total Long-term Liabilities</td><td class="num">${fmt(totalLongTermLiabilities)}</td></tr>
    ` : ''}

    <tr class="subtotal-row"><td colspan="2" class="text-right font-bold">Total Liabilities</td><td class="num font-bold">${fmt(totalLiabilities)}</td></tr>

    <!-- EQUITY -->
    <tr class="group-header"><td colspan="3">Equity</td></tr>
    ${sectionRows(equity, 'indent-1')}
    <tr class="subtotal-row"><td colspan="2" class="text-right font-bold">Total Equity</td><td class="num font-bold">${fmt(totalEquity)}</td></tr>

    <tr class="grand-total-row">
      <td colspan="2" class="text-right">TOTAL LIABILITIES & EQUITY</td>
      <td class="num">${fmt(totalLiabAndEquity)}</td>
    </tr>
  </tbody>
</table>

<div class="signature-block">
  <div><div class="sig-line">Prepared By</div></div>
  <div><div class="sig-line">Verified By</div></div>
  <div><div class="sig-line">Authorized Signatory</div></div>
</div>`;

  return htmlShell({
    title: 'Balance Sheet',
    subtitle: '',
    company,
    period: `As of ${fmtDate(new Date())} — Fiscal Year ${fiscalYear}`,
    body,
    printJs: '',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   VOUCHER PRINT
   ═══════════════════════════════════════════════════════════════════ */

async function generateVoucherPrint(voucherId, companyFilter, companyId) {
  const company = await getCompanyHeader(companyId);

  const voucher = await Voucher.findOne({ _id: voucherId, ...companyFilter })
    .populate('account', 'code name')
    .populate('createdBy', 'name')
    .lean();

  if (!voucher) return null;

  const journalEntry = await JournalEntry.findOne({ reference: voucher.voucherNumber, ...companyFilter })
    .populate('lines.account', 'code name')
    .lean();

  const typeLabel = { payment: 'Payment Voucher', receipt: 'Receipt Voucher', contra: 'Contra Voucher', journal: 'Journal Voucher' }[voucher.type] || 'Voucher';
  const bsMiti = voucher.date ? adToBikramSambat(voucher.date) : '';

  const lines = journalEntry?.lines || [];
  const tableRows = lines.map(l => {
    const acc = l.account;
    return `
    <tr>
      <td>${escapeHtml(acc?.code || '')}</td>
      <td class="indent-1">${escapeHtml(acc?.name || '')}</td>
      <td class="num">${l.debit > 0 ? fmt(l.debit) : ''}</td>
      <td class="num">${l.credit > 0 ? fmt(l.credit) : ''}</td>
    </tr>`;
  }).join('');

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

  const paymentSplits = (voucher.payments || []).map(p => `${p.method.toUpperCase()}: Rs. ${fmt(p.amount)}`).join('  |  ');

  const body = `
<div class="voucher-header">
  <div class="left">
    <div class="voucher-title">${escapeHtml(typeLabel)}</div>
    <div class="voucher-no">${escapeHtml(voucher.voucherNumber)}</div>
  </div>
  <div class="right">
    <div><span class="label">Date: </span>${fmtDate(voucher.date)}</div>
    ${bsMiti ? `<div><span class="label">Miti: </span>${escapeHtml(bsMiti)}</div>` : ''}
    <div><span class="label">FY: </span>${escapeHtml(voucher.fiscalYear || '')}</div>
  </div>
</div>

<div class="voucher-meta">
  <div><span class="label">Description: </span>${escapeHtml(voucher.description)}</div>
  ${voucher.reference ? `<div><span class="label">Reference: </span>${escapeHtml(voucher.reference)}</div>` : ''}
  <div><span class="label">Amount: </span>Rs. ${fmt(voucher.amount)}</div>
  ${paymentSplits ? `<div><span class="label">Payment: </span>${escapeHtml(paymentSplits)}</div>` : ''}
  <div><span class="label">Status: </span>${escapeHtml(voucher.status?.toUpperCase() || 'ACTIVE')}</div>
  <div><span class="label">Created by: </span>${escapeHtml(voucher.createdBy?.name || '')}</div>
</div>

${journalEntry?.description ? `<div class="voucher-narration">${escapeHtml(journalEntry.description)}</div>` : ''}

<table class="report-table">
  <thead>
    <tr>
      <th style="width:10%">Code</th>
      <th>Ledger Account</th>
      <th class="num" style="width:20%">Debit (Rs.)</th>
      <th class="num" style="width:20%">Credit (Rs.)</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
  <tfoot>
    <tr class="grand-total-row">
      <td colspan="2" class="text-right font-bold">TOTAL</td>
      <td class="num">${fmt(totalDebit)}</td>
      <td class="num">${fmt(totalCredit)}</td>
    </tr>
  </tfoot>
</table>

<div class="signature-block">
  <div><div class="sig-line">Prepared By</div></div>
  <div><div class="sig-line">Approved By</div></div>
  <div><div class="sig-line">Received By</div></div>
</div>`;

  return htmlShell({
    title: typeLabel,
    subtitle: '',
    company,
    period: '',
    body,
    printJs: '',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   LEDGER PRINT
   ═══════════════════════════════════════════════════════════════════ */

async function generateLedgerPrint(accountId, companyFilter, companyId, fyFilter) {
  const company = await getCompanyHeader(companyId);

  const account = await Account.findOne({ _id: accountId, ...companyFilter }).lean();
  if (!account) return null;

  const entries = await JournalEntry.find({ 'lines.account': accountId, isPosted: true, ...companyFilter, ...fyFilter })
    .populate('lines.account', 'code name')
    .populate('createdBy', 'name')
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const isDebit = ['asset', 'expense', 'contra_revenue'].includes(account.type);

  let balance = 0;
  const rows = entries.map(e => {
    const line = e.lines.find(l => {
      const id = l.account?._id?.toString?.() || l.account?.toString?.();
      return id === accountId;
    });
    const debit = line?.debit || 0;
    const credit = line?.credit || 0;
    if (isDebit) balance += debit - credit;
    else balance += credit - debit;
    return { date: e.date, reference: e.reference, description: e.description, debit, credit, balance };
  });

  const tableRows = rows.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${escapeHtml(r.reference || '')}</td>
      <td class="indent-1">${escapeHtml(r.description || '')}</td>
      <td class="num">${r.debit > 0 ? fmt(r.debit) : ''}</td>
      <td class="num">${r.credit > 0 ? fmt(r.credit) : ''}</td>
      <td class="num font-bold">${fmt(r.balance)}</td>
    </tr>
  `).join('');

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  const body = `
<div class="section-title">${escapeHtml(account.code)} — ${escapeHtml(account.name)}</div>

<table class="report-table">
  <thead>
    <tr>
      <th style="width:12%">Date</th>
      <th style="width:12%">Reference</th>
      <th>Description</th>
      <th class="num" style="width:16%">Debit (Rs.)</th>
      <th class="num" style="width:16%">Credit (Rs.)</th>
      <th class="num" style="width:16%">Balance (Rs.)</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
  <tfoot>
    <tr class="subtotal-row">
      <td colspan="3" class="text-right font-bold">Total</td>
      <td class="num font-bold">${fmt(totalDebit)}</td>
      <td class="num font-bold">${fmt(totalCredit)}</td>
      <td class="num font-bold">${fmt(balance)}</td>
    </tr>
    <tr class="grand-total-row">
      <td colspan="3" class="text-right">CLOSING BALANCE</td>
      <td colspan="2" class="text-right">${isDebit ? 'Dr' : 'Cr'}</td>
      <td class="num">${fmt(Math.abs(balance))}</td>
    </tr>
  </tfoot>
</table>

<div class="signature-block">
  <div><div class="sig-line">Prepared By</div></div>
  <div><div class="sig-line">Verified By</div></div>
</div>`;

  return htmlShell({
    title: 'Account Ledger',
    subtitle: '',
    company,
    period: `Fiscal Year ${getFiscalYearLabel(new Date())}`,
    body,
    printJs: '',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   SALES REGISTER
   ═══════════════════════════════════════════════════════════════════ */

async function generateSalesPrint(companyFilter, companyId, fyFilter) {
  const company = await getCompanyHeader(companyId);

  const sales = await Sale.find({ status: 'completed', ...companyFilter, ...fyFilter })
    .populate('customer', 'name')
    .populate('cashier', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const rows = sales.map(s => `
    <tr>
      <td>${fmtDate(s.createdAt)}</td>
      <td>${escapeHtml(s.invoiceNumber)}</td>
      <td class="indent-1">${escapeHtml(s.customer?.name || 'Walk-in')}</td>
      <td class="num">${(s.items || []).length}</td>
      <td class="num">${fmt(s.subtotal)}</td>
      <td class="num">${s.discount ? fmt(s.discount) : ''}</td>
      <td class="num">${s.taxTotal ? fmt(s.taxTotal) : ''}</td>
      <td class="num font-bold">${fmt(s.grandTotal)}</td>
      <td class="num">${fmt(s.amountPaid)}</td>
    </tr>
  `).join('') || '<tr><td colspan="9" class="text-center">No sales for this period</td></tr>';

  const totalGrand = sales.reduce((s, x) => s + (x.grandTotal || 0), 0);
  const totalPaid = sales.reduce((s, x) => s + (x.amountPaid || 0), 0);
  const totalTax = sales.reduce((s, x) => s + (x.taxTotal || 0), 0);

  const body = `
<table class="report-table">
  <thead>
    <tr>
      <th style="width:11%">Date</th>
      <th style="width:13%">Invoice No</th>
      <th>Customer</th>
      <th class="num" style="width:6%">Items</th>
      <th class="num" style="width:13%">Subtotal</th>
      <th class="num" style="width:12%">Discount</th>
      <th class="num" style="width:12%">VAT</th>
      <th class="num" style="width:14%">Grand Total</th>
      <th class="num" style="width:12%">Paid</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr class="grand-total-row">
      <td colspan="4" class="text-right font-bold">TOTAL (${sales.length} invoices)</td>
      <td class="num">${fmt(sales.reduce((s, x) => s + (x.subtotal || 0), 0))}</td>
      <td class="num">${fmt(sales.reduce((s, x) => s + (x.discount || 0), 0))}</td>
      <td class="num">${fmt(totalTax)}</td>
      <td class="num">${fmt(totalGrand)}</td>
      <td class="num">${fmt(totalPaid)}</td>
    </tr>
  </tfoot>
</table>

<div class="signature-block">
  <div><div class="sig-line">Prepared By</div></div>
  <div><div class="sig-line">Verified By</div></div>
  <div><div class="sig-line">Authorized Signatory</div></div>
</div>`;

  return htmlShell({
    title: 'Sales Register',
    subtitle: '',
    company,
    period: `Fiscal Year ${getFiscalYearLabel(new Date())}`,
    body,
    printJs: '',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   PURCHASE REGISTER
   ═══════════════════════════════════════════════════════════════════ */

async function generatePurchasesPrint(companyFilter, companyId, fyFilter) {
  const company = await getCompanyHeader(companyId);

  const purchases = await Purchase.find({ status: 'received', ...companyFilter, ...fyFilter })
    .populate('supplier', 'name')
    .sort({ date: -1 })
    .lean();

  const rows = purchases.map(p => `
    <tr>
      <td>${fmtDate(p.date)}</td>
      <td>${escapeHtml(p.purchaseNumber)}</td>
      <td class="indent-1">${escapeHtml(p.supplier?.name || '-')}</td>
      <td class="num">${(p.items || []).length}</td>
      <td class="num">${fmt(p.subtotal)}</td>
      <td class="num">${p.discount ? fmt(p.discount) : ''}</td>
      <td class="num">${p.tax ? fmt(p.tax) : ''}</td>
      <td class="num font-bold">${fmt(p.grandTotal)}</td>
      <td class="num">${fmt(p.paidAmount)}</td>
    </tr>
  `).join('') || '<tr><td colspan="9" class="text-center">No purchases for this period</td></tr>';

  const body = `
<table class="report-table">
  <thead>
    <tr>
      <th style="width:11%">Date</th>
      <th style="width:13%">Purchase No</th>
      <th>Supplier</th>
      <th class="num" style="width:6%">Items</th>
      <th class="num" style="width:13%">Subtotal</th>
      <th class="num" style="width:12%">Discount</th>
      <th class="num" style="width:12%">VAT</th>
      <th class="num" style="width:14%">Grand Total</th>
      <th class="num" style="width:12%">Paid</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr class="grand-total-row">
      <td colspan="4" class="text-right font-bold">TOTAL (${purchases.length} purchases)</td>
      <td class="num">${fmt(purchases.reduce((s, x) => s + (x.subtotal || 0), 0))}</td>
      <td class="num">${fmt(purchases.reduce((s, x) => s + (x.discount || 0), 0))}</td>
      <td class="num">${fmt(purchases.reduce((s, x) => s + (x.tax || 0), 0))}</td>
      <td class="num">${fmt(purchases.reduce((s, x) => s + (x.grandTotal || 0), 0))}</td>
      <td class="num">${fmt(purchases.reduce((s, x) => s + (x.paidAmount || 0), 0))}</td>
    </tr>
  </tfoot>
</table>

<div class="signature-block">
  <div><div class="sig-line">Prepared By</div></div>
  <div><div class="sig-line">Verified By</div></div>
  <div><div class="sig-line">Authorized Signatory</div></div>
</div>`;

  return htmlShell({
    title: 'Purchase Register',
    subtitle: '',
    company,
    period: `Fiscal Year ${getFiscalYearLabel(new Date())}`,
    body,
    printJs: '',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   CHART OF ACCOUNTS
   ═══════════════════════════════════════════════════════════════════ */

async function generateChartOfAccountsPrint(companyFilter, companyId) {
  const company = await getCompanyHeader(companyId);

  const accounts = await Account.find({ ...companyFilter, isActive: true }).sort({ code: 1 }).lean();

  const rows = accounts.map(a => `
    <tr>
      <td>${escapeHtml(a.code)}</td>
      <td class="indent-1">${escapeHtml(a.name)}</td>
      <td>${escapeHtml(a.type.replace('_', ' '))}</td>
      <td>${escapeHtml((a.category || '').replace('_', ' '))}</td>
      <td class="num">${fmt(a.balance || 0)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="text-center">No accounts found</td></tr>';

  const body = `
<table class="report-table">
  <thead>
    <tr>
      <th style="width:12%">Code</th>
      <th>Account Name</th>
      <th style="width:16%">Type</th>
      <th style="width:20%">Category</th>
      <th class="num" style="width:18%">Balance (Rs.)</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="signature-block">
  <div><div class="sig-line">Prepared By</div></div>
  <div><div class="sig-line">Verified By</div></div>
  <div><div class="sig-line">Authorized Signatory</div></div>
</div>`;

  return htmlShell({
    title: 'Chart of Accounts',
    subtitle: '',
    company,
    period: `${accounts.length} active accounts`,
    body,
    printJs: '',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   JOURNAL ENTRIES REGISTER
   ═══════════════════════════════════════════════════════════════════ */

async function generateJournalEntriesPrint(companyFilter, companyId, fyFilter) {
  const company = await getCompanyHeader(companyId);

  const entries = await JournalEntry.find({ isPosted: true, ...companyFilter, ...fyFilter })
    .populate('lines.account', 'code name')
    .sort({ date: 1 })
    .lean();

  const body = entries.map(e => {
    const lines = (e.lines || []).map(l => `
      <tr>
        <td>${escapeHtml(l.account?.code || '')}</td>
        <td class="indent-1">${escapeHtml(l.account?.name || '')}</td>
        <td class="num">${l.debit > 0 ? fmt(l.debit) : ''}</td>
        <td class="num">${l.credit > 0 ? fmt(l.credit) : ''}</td>
      </tr>
    `).join('');
    return `
    <div class="section-title">${fmtDate(e.date)} — ${escapeHtml(e.reference || 'JE')}</div>
    <div class="voucher-narration">${escapeHtml(e.description || '')}</div>
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:12%">Code</th>
          <th>Ledger Account</th>
          <th class="num" style="width:20%">Debit (Rs.)</th>
          <th class="num" style="width:20%">Credit (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        ${lines}
        <tr class="subtotal-row">
          <td colspan="2" class="text-right">Total</td>
          <td class="num">${fmt((e.lines || []).reduce((s, l) => s + (l.debit || 0), 0))}</td>
          <td class="num">${fmt((e.lines || []).reduce((s, l) => s + (l.credit || 0), 0))}</td>
        </tr>
      </tbody>
    </table>`;
  }).join('') || '<div class="section-title">No journal entries for this period</div>';

  return htmlShell({
    title: 'Journal Entries Register',
    subtitle: '',
    company,
    period: `${entries.length} entries`,
    body,
    printJs: '',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   ROUTES
   ═══════════════════════════════════════════════════════════════════ */

router.get('/print/trial-balance', protect, async (req, res) => {
  try {
    const html = await generateTrialBalance(req.companyFilter, req.companyId, req.fyFilter);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Print trial-balance error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/print/income-statement', protect, async (req, res) => {
  try {
    const html = await generateProfitLoss(req.companyFilter, req.companyId, req.fyFilter);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Print income-statement error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/print/balance-sheet', protect, async (req, res) => {
  try {
    const html = await generateBalanceSheet(req.companyFilter, req.companyId, req.fyFilter);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Print balance-sheet error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/print/voucher/:id', protect, async (req, res) => {
  try {
    const html = await generateVoucherPrint(req.params.id, req.companyFilter, req.companyId);
    if (!html) return res.status(404).json({ message: 'Voucher not found' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Print voucher error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/print/ledger/:accountId', protect, async (req, res) => {
  try {
    const html = await generateLedgerPrint(req.params.accountId, req.companyFilter, req.companyId, req.fyFilter);
    if (!html) return res.status(404).json({ message: 'Account not found' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Print ledger error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/print/sales', protect, async (req, res) => {
  try {
    const html = await generateSalesPrint(req.companyFilter, req.companyId, req.fyFilter);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Print sales error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/print/purchases', protect, async (req, res) => {
  try {
    const html = await generatePurchasesPrint(req.companyFilter, req.companyId, req.fyFilter);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Print purchases error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/print/chart-of-accounts', protect, async (req, res) => {
  try {
    const html = await generateChartOfAccountsPrint(req.companyFilter, req.companyId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Print chart-of-accounts error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/print/journal-entries', protect, async (req, res) => {
  try {
    const html = await generateJournalEntriesPrint(req.companyFilter, req.companyId, req.fyFilter);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Print journal-entries error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
