const express = require('express');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const Sale = require('../models/Sale');
const Emi = require('../models/Emi');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const InventoryMovement = require('../models/InventoryMovement');
const Company = require('../models/Company');
const { protect, adminOnly } = require('../middleware/auth');
const { runVatSettlement } = require('../utils/vatSettlement');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const { adjustBankBalance } = require('../utils/bankService');
const { getClientIp } = require('../utils/irdAudit');
const router = express.Router();

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
}

function formatNPR(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

router.post('/vat-settlement', protect, adminOnly, async (req, res) => {
  try {
    const result = await runVatSettlement(req.companyId, req.companyFilter);
    res.json(result);
  } catch (err) {
    console.error('VAT settlement error:', err.message);
    res.status(500).json({ message: 'VAT settlement failed', error: err.message });
  }
});

// ─── SALES REPORTS ───

async function getSalesRows(req) {
  const [sales, emis] = await Promise.all([
    Sale.find({ status: 'completed', ...req.fyFilter, ...req.companyFilter })
      .populate('customer', 'name')
      .populate('cashier', 'name')
      .sort({ createdAt: -1 }),
    Emi.find({ ...req.fyFilter, ...req.companyFilter })
      .populate('customer', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 }),
  ]);
  const saleRows = sales.map(s => ({
    Type: 'Sale',
    Invoice: s.invoiceNumber,
    Date: new Date(s.createdAt).toLocaleDateString('en-IN'),
    Customer: s.customer?.name || 'Walk-in',
    Items: (s.items || []).length,
    Subtotal: s.subtotal,
    'Tax (VAT)': s.taxTotal || '',
    Discount: s.discount,
    'Grand Total': s.grandTotal,
    Paid: s.amountPaid,
    Change: s.change,
    Method: s.paymentMethod,
    Cashier: s.cashier?.name || '',
  }));
  const emiRows = emis.map(e => ({
    Type: 'EMI',
    Invoice: e.emiNumber,
    Date: new Date(e.createdAt).toLocaleDateString('en-IN'),
    Customer: e.customer?.name || 'Walk-in',
    Items: 1,
    Subtotal: e.productTotal,
    'Tax (VAT)': 0,
    Discount: e.exchangeEnabled ? e.exchangeAmount : 0,
    'Grand Total': e.netAmount,
    Paid: e.downPayment,
    Change: 0,
    Method: 'EMI',
    Cashier: e.createdBy?.name || '',
  }));
  return { saleRows, emiRows, sales, emis };
}

router.get('/sales/excel', protect, async (req, res) => {
  const { saleRows, emiRows } = await getSalesRows(req);
  const data = [...saleRows, ...emiRows].sort((a, b) => new Date(b.Date) - new Date(a.Date));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', EXCEL_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');
  res.send(buf);
});

router.get('/sales/pdf', protect, async (req, res) => {
  const { saleRows, emiRows } = await getSalesRows(req);
  const all = [...saleRows, ...emiRows].sort((a, b) => new Date(b.Date) - new Date(a.Date));
  const total = all.reduce((s, i) => s + i['Grand Total'], 0);
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename=sales_report.pdf');
  doc.pipe(res);
  doc.fontSize(16).text('Sales Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(11).text(`Total Sales: ${formatNPR(total)}  |  Transactions: ${all.length}  |  Cash Sales: ${saleRows.length}  |  EMI: ${emiRows.length}`);
  doc.moveDown();
  doc.fontSize(8);
  all.forEach((s, i) => {
    if (i > 0 && i % 30 === 0) doc.addPage();
    doc.text(
      `${s.Type}  ${s.Invoice}  |  ${s.Date}  |  ${s.Customer}  |  ${formatNPR(s['Grand Total'])}  |  ${s.Method}`,
      { continued: false }
    );
  });
  doc.end();
});

// ─── STOCK REPORTS ───

router.get('/stock/excel', protect, async (req, res) => {
  const products = await Product.find({ ...req.companyFilter }).populate('category', 'name').populate('supplier', 'name');
  const data = products.map(p => ({
    SKU: p.sku, Name: p.name, Category: p.category?.name || '', Supplier: p.supplier?.name || '',
    'Cost Price': p.costPrice, 'Selling Price': p.sellingPrice, Stock: p.stock,
    'Min Stock': p.minStock, 'Stock Value': p.costPrice * p.stock, Unit: p.unit,
    Status: p.stock <= p.minStock ? 'Low Stock' : 'OK',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=stock_report.xlsx');
  res.send(buf);
});

router.get('/stock/pdf', protect, async (req, res) => {
  const products = await Product.find({ ...req.companyFilter }).populate('category', 'name');
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename=stock_report.pdf');
  doc.pipe(res);
  doc.fontSize(16).text('Stock / Inventory Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(9);
  products.forEach((p, i) => {
    if (i > 0 && i % 40 === 0) doc.addPage();
    const status = p.stock <= p.minStock ? '⚠ LOW' : 'OK';
    doc.text(`${p.sku}  |  ${p.name}  |  Stock: ${p.stock}  |  Price: ${formatNPR(p.sellingPrice)}  |  ${status}`);
  });
  doc.end();
});

// ─── STOCK OVERVIEW (date-range stock statement) ───

router.get('/stock-overview', protect, async (req, res) => {
  const { from, to } = req.query;

  // Match movements by their transaction date (back-dated entries show under the right period),
  // plus always include anything stamped to the selected fiscal year, mirroring the rest of the app.
  const rangeCond = (field) => {
    const r = {};
    if (from) r[field] = { $gte: new Date(from) };
    if (to) r[field] = { ...r[field], $lte: new Date(to) };
    return r;
  };
  const fyOr = (base, field) => {
    const conds = [];
    const r = rangeCond(field);
    if (Object.keys(r).length) conds.push(r);
    if (req.fiscalYearId) conds.push({ fiscalYearId: req.fiscalYearId });
    return conds.length ? { ...base, $or: conds } : base;
  };

  const [products, movements, purchases, sales] = await Promise.all([
    Product.find({ ...req.companyFilter }).populate('category', 'name'),
    InventoryMovement.find(fyOr({ ...req.companyFilter }, 'date')),
    Purchase.find(fyOr({ status: 'received', ...req.companyFilter }, 'createdAt')),
    Sale.find(fyOr({ status: 'completed', ...req.companyFilter }, 'createdAt')),
  ]);

  const mov = {};
  for (const m of movements) {
    const key = m.product.toString();
    mov[key] = mov[key] || { in: 0, out: 0, salesReturn: 0, purchaseReturn: 0, adj: 0 };
    if (m.type === 'in') mov[key].in += m.quantity;
    else if (m.type === 'out') mov[key].out += m.quantity;
    else if (m.type === 'sales_return') mov[key].salesReturn += m.quantity;
    else if (m.type === 'purchase_return') mov[key].purchaseReturn += m.quantity;
    else mov[key].adj += m.quantity;
  }

  const cost = {}, sell = {};
  for (const p of purchases) for (const it of p.items || []) {
    const key = String(it.product);
    cost[key] = cost[key] || { qty: 0, amt: 0 };
    cost[key].qty += it.quantity;
    cost[key].amt += (it.costPrice || 0) * it.quantity;
  }
  for (const s of sales) for (const it of s.items || []) {
    const key = String(it.product);
    sell[key] = sell[key] || { qty: 0, amt: 0 };
    sell[key].qty += it.quantity;
    sell[key].amt += (it.price || 0) * it.quantity;
  }

  const rows = products.map(p => {
    const key = p._id.toString();
    const m = mov[key] || { in: 0, out: 0, salesReturn: 0, purchaseReturn: 0, adj: 0 };
    const stockIn = m.in + (m.adj > 0 ? m.adj : 0);
    const stockOut = m.out + (m.adj < 0 ? m.adj : 0);
    const salesReturn = m.salesReturn;
    const purchaseReturn = m.purchaseReturn;
    const net = m.in + m.out + m.salesReturn + m.purchaseReturn + m.adj;
    const remaining = p.stock || 0;
    const opening = Math.max(0, Math.round((remaining - net) * 100) / 100);
    const avgCost = cost[key] && cost[key].qty > 0 ? cost[key].amt / cost[key].qty : p.costPrice || 0;
    const avgSell = sell[key] && sell[key].qty > 0 ? sell[key].amt / sell[key].qty : p.sellingPrice || 0;
    const valuation = Math.round(remaining * avgCost * 100) / 100;
    const minStock = p.minStock || 0;
    return {
      _id: p._id, sku: p.sku, name: p.name, unit: p.unit,
      category: p.category?.name || '-',
      opening, stockIn, stockOut, salesReturn, purchaseReturn,
      remaining, minStock, costPrice: avgCost, sellingPrice: avgSell, valuation,
      stockLevel: remaining <= 0 ? 'out' : remaining <= minStock ? 'low' : 'ok',
      status: remaining <= 0 ? 'Out of Stock' : remaining <= minStock ? 'Low Stock' : 'In Stock',
    };
  });

  const summary = {
    products: rows.length,
    stockIn: rows.reduce((s, r) => s + r.stockIn, 0),
    stockOut: rows.reduce((s, r) => s + r.stockOut, 0),
    salesReturn: rows.reduce((s, r) => s + r.salesReturn, 0),
    purchaseReturn: rows.reduce((s, r) => s + r.purchaseReturn, 0),
    valuation: rows.reduce((s, r) => s + r.valuation, 0),
  };
  res.json({ rows, summary });
});

// ─── ACCOUNTING REPORTS ───

async function getTrialBalanceData(filter = {}, companyFilter = {}) {
  const entries = await JournalEntry.find({ ...filter, ...companyFilter });
  const accounts = await Account.find({ ...companyFilter });
  const bals = {};
  accounts.forEach(a => { bals[a._id.toString()] = { debit: 0, credit: 0, account: a }; });
  entries.forEach(e => e.lines.forEach(l => {
    const id = l.account.toString();
    if (bals[id]) { bals[id].debit += l.debit; bals[id].credit += l.credit; }
  }));
  return accounts.map(a => {
    const b = bals[a._id.toString()];
    return {
      code: a.code, name: a.name, type: a.type, category: a.category,
      debit: Math.max(0, (b?.debit || 0) - (b?.credit || 0)),
      credit: Math.max(0, (b?.credit || 0) - (b?.debit || 0)),
    };
  });
}

router.get('/trial-balance/excel', protect, async (req, res) => {
  const data = await getTrialBalanceData(req.fyFilter || {}, req.companyFilter);
  const filtered = data.filter(a => a.debit > 0 || a.credit > 0);
  const totalDebit = filtered.reduce((s, a) => s + a.debit, 0);
  const totalCredit = filtered.reduce((s, a) => s + a.credit, 0);
  const rows = filtered.map(a => ({ Code: a.code, Account: a.name, Type: a.type, 'Debit (Rs.)': a.debit, 'Credit (Rs.)': a.credit }));
  rows.push({ Code: '', Account: 'TOTAL', Type: '', 'Debit (Rs.)': totalDebit, 'Credit (Rs.)': totalCredit });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', EXCEL_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename=trial_balance.xlsx');
  res.send(buf);
});

router.get('/trial-balance/pdf', protect, async (req, res) => {
  const data = await getTrialBalanceData(req.fyFilter || {}, req.companyFilter);
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename=trial_balance.pdf');
  doc.pipe(res);
  doc.fontSize(16).text('Trial Balance', { align: 'center' });
  doc.moveDown();
  const filtered = data.filter(a => a.debit > 0 || a.credit > 0);
  const totalDebit = filtered.reduce((s, a) => s + a.debit, 0);
  const totalCredit = filtered.reduce((s, a) => s + a.credit, 0);
  filtered.forEach((a, i) => {
    if (i > 0 && i % 45 === 0) doc.addPage();
    doc.fontSize(9).text(`${a.code}  |  ${a.name}  |  D: ${formatNPR(a.debit)}  |  C: ${formatNPR(a.credit)}`);
  });
  doc.moveDown();
  doc.fontSize(10).text(`Total Debit: ${formatNPR(totalDebit)}  |  Total Credit: ${formatNPR(totalCredit)}`);
  doc.end();
});

router.get('/income-statement/excel', protect, async (req, res) => {
  const tb = await getTrialBalanceData(req.fyFilter || {}, req.companyFilter);
  const revenue = tb.filter(t => t.type === 'revenue').reduce((s, a) => s + a.credit, 0);
  const contraRev = tb.filter(t => t.type === 'contra_revenue').reduce((s, a) => s + a.debit, 0);
  const cogs = tb.filter(t => t.category === 'cogs').reduce((s, a) => s + a.debit, 0);
  const expenses = tb.filter(t => t.category === 'operating_expense').reduce((s, a) => s + a.debit, 0);
  const otherIncome = tb.filter(t => t.category === 'other_income').reduce((s, a) => s + a.credit, 0);
  const rows = [
    { Description: 'Sales Revenue', Amount: revenue },
    { Description: 'Less: Returns/Discount', Amount: -contraRev },
    { Description: 'Net Revenue', Amount: revenue - contraRev },
    { Description: 'Cost of Goods Sold', Amount: -cogs },
    { Description: 'Gross Profit', Amount: revenue - contraRev - cogs },
    { Description: 'Operating Expenses', Amount: -expenses },
    { Description: 'Other Income', Amount: otherIncome },
    { Description: 'Net Profit / (Loss)', Amount: revenue - contraRev - cogs - expenses + otherIncome },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Income Statement');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', EXCEL_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename=income_statement.xlsx');
  res.send(buf);
});

router.get('/income-statement/pdf', protect, async (req, res) => {
  const tb = await getTrialBalanceData(req.fyFilter || {}, req.companyFilter);
  const revenue = tb.filter(t => t.type === 'revenue').reduce((s, a) => s + a.credit, 0);
  const contraRev = tb.filter(t => t.type === 'contra_revenue').reduce((s, a) => s + a.debit, 0);
  const cogs = tb.filter(t => t.category === 'cogs').reduce((s, a) => s + a.debit, 0);
  const expenses = tb.filter(t => t.category === 'operating_expense').reduce((s, a) => s + a.debit, 0);
  const otherIncome = tb.filter(t => t.category === 'other_income').reduce((s, a) => s + a.credit, 0);
  const netProfit = revenue - contraRev - cogs - expenses + otherIncome;

  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename=income_statement.pdf');
  doc.pipe(res);
  doc.fontSize(16).text('Income Statement (Profit & Loss)', { align: 'center' });
  doc.moveDown();
  doc.fontSize(11).text(`Revenue: ${formatNPR(revenue)}`);
  doc.text(`Less: Returns: ${formatNPR(contraRev)}`);
  doc.text(`Net Revenue: ${formatNPR(revenue - contraRev)}`);
  doc.text(`COGS: ${formatNPR(cogs)}`);
  doc.text(`Gross Profit: ${formatNPR(revenue - contraRev - cogs)}`);
  doc.text(`Expenses: ${formatNPR(expenses)}`);
  doc.text(`Other Income: ${formatNPR(otherIncome)}`);
  doc.moveDown();
  doc.fontSize(14).text(`Net Profit / (Loss): ${formatNPR(netProfit)}`, { align: 'center' });
  doc.end();
});

router.get('/balance-sheet/excel', protect, async (req, res) => {
  const tb = await getTrialBalanceData(req.fyFilter || {}, req.companyFilter);
  const currentAssets = tb.filter(t => t.category === 'current_asset').reduce((s, a) => s + a.debit, 0);
  const fixedAssets = tb.filter(t => t.category === 'fixed_asset').reduce((s, a) => s + a.debit, 0);
  const contraAssets = tb.filter(t => t.type === 'contra_asset').reduce((s, a) => s + a.credit, 0);
  const currentLiab = tb.filter(t => t.category === 'current_liability').reduce((s, a) => s + a.credit, 0);
  const longTermLiab = tb.filter(t => t.category === 'long_term_liability').reduce((s, a) => s + a.credit, 0);
  const equity = tb.filter(t => t.category === 'equity').reduce((s, a) => s + a.credit, 0);
  const rows = [
    { Description: 'ASSETS', Amount: '' },
    { Description: '  Current Assets', Amount: currentAssets },
    { Description: '  Fixed Assets', Amount: fixedAssets },
    { Description: '  Less: Accum. Depreciation', Amount: -contraAssets },
    { Description: 'TOTAL ASSETS', Amount: currentAssets + fixedAssets - contraAssets },
    { Description: '', Amount: '' },
    { Description: 'LIABILITIES & EQUITY', Amount: '' },
    { Description: '  Current Liabilities', Amount: currentLiab },
    { Description: '  Long-term Liabilities', Amount: longTermLiab },
    { Description: '  Equity', Amount: equity },
    { Description: 'TOTAL LIABILITIES & EQUITY', Amount: currentLiab + longTermLiab + equity },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', EXCEL_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename=balance_sheet.xlsx');
  res.send(buf);
});

router.get('/balance-sheet/pdf', protect, async (req, res) => {
  const tb = await getTrialBalanceData(req.fyFilter || {}, req.companyFilter);
  const currentAssets = tb.filter(t => t.category === 'current_asset').reduce((s, a) => s + a.debit, 0);
  const fixedAssets = tb.filter(t => t.category === 'fixed_asset').reduce((s, a) => s + a.debit, 0);
  const contraAssets = tb.filter(t => t.type === 'contra_asset').reduce((s, a) => s + a.credit, 0);
  const currentLiab = tb.filter(t => t.category === 'current_liability').reduce((s, a) => s + a.credit, 0);
  const longTermLiab = tb.filter(t => t.category === 'long_term_liability').reduce((s, a) => s + a.credit, 0);
  const equity = tb.filter(t => t.category === 'equity').reduce((s, a) => s + a.credit, 0);

  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename=balance_sheet.pdf');
  doc.pipe(res);
  doc.fontSize(16).text('Balance Sheet', { align: 'center' });
  doc.moveDown();
  doc.fontSize(11).text(`Current Assets: ${formatNPR(currentAssets)}`);
  doc.text(`Fixed Assets: ${formatNPR(fixedAssets)}`);
  doc.text(`Less: Depreciation: ${formatNPR(contraAssets)}`);
  doc.text(`Total Assets: ${formatNPR(currentAssets + fixedAssets - contraAssets)}`);
  doc.moveDown();
  doc.text(`Current Liabilities: ${formatNPR(currentLiab)}`);
  doc.text(`Long-term Liabilities: ${formatNPR(longTermLiab)}`);
  doc.text(`Equity: ${formatNPR(equity)}`);
  doc.text(`Total Liabilities & Equity: ${formatNPR(currentLiab + longTermLiab + equity)}`);
  doc.end();
});

// ─── JOURNAL REPORTS ───

router.get('/journal/excel', protect, async (req, res) => {
  const filter = { ...req.companyFilter };
  if (req.query.excludeSource === 'MONTH_END') filter.description = { $not: /^Month-End/i };
  const entries = await JournalEntry.find(filter).populate('lines.account', 'code name');
  const rows = [];
  entries.forEach(e => {
    e.lines.forEach(l => {
      rows.push({
        Date: new Date(e.date).toLocaleDateString('en-IN'),
        'Fiscal Year': e.fiscalYear || '',
        Reference: e.reference || '',
        Description: e.description,
        Account: l.account?.name || '',
        'Account Code': l.account?.code || '',
        Debit: l.debit,
        Credit: l.credit,
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Journal');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', EXCEL_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename=journal_entries.xlsx');
  res.send(buf);
});

router.get('/journal/pdf', protect, async (req, res) => {
  const { startDate, endDate } = req.query;
  const dateFilter = {};
  if (startDate) dateFilter.date = { $gte: new Date(startDate) };
  if (endDate) dateFilter.date = { ...dateFilter.date, $lte: new Date(endDate) };

  const entries = await JournalEntry.find({ ...req.fyFilter, ...req.companyFilter, ...dateFilter, ...(req.query.excludeSource === 'MONTH_END' ? { description: { $not: /^Month-End/i } } : {}) })
    .populate('lines.account', 'code name')
    .sort({ date: 1 });

  const company = req.companyId ? await Company.findById(req.companyId) : null;
  const companyName = company?.name || '';

  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename=journal_entries.pdf');
  doc.pipe(res);
  doc.fontSize(18).text(companyName, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(14).text('Journal Entries', { align: 'center' });
  doc.fontSize(10).text(
    startDate || endDate
      ? `Period: ${startDate ? new Date(startDate).toLocaleDateString('en-IN') : 'Start'} to ${endDate ? new Date(endDate).toLocaleDateString('en-IN') : 'End'}`
      : 'Period: All Time',
    { align: 'center' }
  );
  doc.moveDown(0.5);

  let lineCount = 0;
  entries.forEach(e => {
    e.lines.forEach(l => {
      if (lineCount > 0 && lineCount % 48 === 0) doc.addPage();
      lineCount++;
      doc.fontSize(8).text(
        `${new Date(e.date).toLocaleDateString('en-IN')}  |  ${(e.reference || '-').padEnd(14)}  |  ${(l.account?.code || '').padEnd(6)} ${(l.account?.name || '').padEnd(24)}  |  D: ${formatNPR(l.debit)}  |  C: ${formatNPR(l.credit)}`
      );
      if (e.description) doc.fontSize(7).text(`      ${e.description}`, { indent: 12 });
    });
  });
  doc.end();
});

// ─── LEDGER REPORT ───

async function getLedgerData(accountId, companyFilter, dateFilter) {
  const filter = { 'lines.account': accountId, isPosted: true, ...companyFilter, ...dateFilter };
  const entries = await JournalEntry.find(filter)
    .populate('lines.account', 'code name')
    .sort({ date: 1 });
  const account = await Account.findOne({ _id: accountId, ...companyFilter });
  if (!account) return null;
  let balance = 0;
  const rows = entries.map(e => {
    const line = e.lines.find(l => l.account?._id?.toString() === accountId || l.account?.toString() === accountId);
    const debit = line?.debit || 0;
    const credit = line?.credit || 0;
    const isDebit = ['asset', 'expense', 'contra_revenue'].includes(account.type);
    if (isDebit) balance += debit - credit;
    else balance += credit - debit;
    return { date: e.date, reference: e.reference, description: e.description, debit, credit, balance };
  });
  return { account, rows, currentBalance: balance };
}

router.get('/ledger/:accountId/excel', protect, async (req, res) => {
  const { startDate, endDate, fiscalYearId } = req.query;
  const extra = {};
  if (fiscalYearId) extra.fiscalYearId = fiscalYearId;
  else {
    if (startDate) extra.date = { $gte: new Date(startDate) };
    if (endDate) extra.date = { ...extra.date, $lte: new Date(endDate) };
  }

  const data = await getLedgerData(req.params.accountId, req.companyFilter, extra);
  if (!data) return res.status(404).json({ message: 'Account not found' });

  const company = req.companyId ? await Company.findById(req.companyId) : null;
  const companyName = company?.name || '';

  const periodText = fiscalYearId
    ? `Fiscal Year: ${fiscalYearId}`
    : `Period: ${startDate || 'All'} to ${endDate || 'All'}`;

  const rows = data.rows.map(r => ({
    Date: new Date(r.date).toLocaleDateString('en-IN'), Reference: r.reference || '',
    Description: r.description, 'Debit (Rs.)': r.debit, 'Credit (Rs.)': r.credit,
    'Balance (Rs.)': r.balance,
  }));
  rows.unshift({ Date: '', Reference: '', Description: `${companyName}`, 'Debit (Rs.)': '', 'Credit (Rs.)': '', 'Balance (Rs.)': '' });
  rows.unshift({ Date: '', Reference: '', Description: periodText, 'Debit (Rs.)': '', 'Credit (Rs.)': '', 'Balance (Rs.)': '' });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movements');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', EXCEL_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename=inventory_movements.xlsx');
  res.send(buf);
});

router.get('/ledger/:accountId/pdf', protect, async (req, res) => {
  const { startDate, endDate, fiscalYearId } = req.query;
  const extra = {};
  if (fiscalYearId) extra.fiscalYearId = fiscalYearId;
  else {
    if (startDate) extra.date = { $gte: new Date(startDate) };
    if (endDate) extra.date = { ...extra.date, $lte: new Date(endDate) };
  }

  const data = await getLedgerData(req.params.accountId, req.companyFilter, extra);
  if (!data) return res.status(404).json({ message: 'Account not found' });

  const company = req.companyId ? await Company.findById(req.companyId) : null;
  const companyName = company?.name || '';

  const periodText = fiscalYearId
    ? `Fiscal Year: ${fiscalYearId}`
    : (startDate || endDate
      ? `Period: ${startDate ? new Date(startDate).toLocaleDateString('en-IN') : 'Start'} to ${endDate ? new Date(endDate).toLocaleDateString('en-IN') : 'End'}`
      : 'Period: All Time');

  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=ledger_${data.account.code}.pdf`);
  doc.pipe(res);
  doc.fontSize(18).text(companyName, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(14).text(`Ledger: ${data.account.code} - ${data.account.name}`, { align: 'center' });
  doc.fontSize(10).text(periodText, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Type: ${data.account.type} | Balance: ${formatNPR(data.currentBalance)}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(8);
  data.rows.forEach((r, i) => {
    if (i > 0 && i % 45 === 0) doc.addPage();
    doc.text(
      `${new Date(r.date).toLocaleDateString('en-IN')}  |  ${(r.reference || '-').padEnd(12)}  |  ${r.description.padEnd(30)}  |  D: ${formatNPR(r.debit)}  |  C: ${formatNPR(r.credit)}  |  Bal: ${formatNPR(r.balance)}`
    );
  });
  doc.moveDown();
  doc.fontSize(10).text(`Current Balance: ${formatNPR(data.currentBalance)}`);
  doc.end();
});

// ─── INVENTORY MOVEMENT REPORT ───

router.get('/movements/excel', protect, async (req, res) => {
  const movs = await InventoryMovement.find({ ...req.companyFilter }).populate('product', 'name sku').sort({ createdAt: -1 });
  const data = movs.map(m => ({
    Date: new Date(m.createdAt).toLocaleDateString('en-IN'),
    Product: m.product?.name || '',
    SKU: m.product?.sku || '',
    Type: m.type,
    Quantity: m.quantity,
    Reference: m.reference || '',
    Note: m.note || '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movements');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=inventory_movements.xlsx');
  res.send(buf);
});

// ─── VAT REPORT ───
router.get('/vat', protect, async (req, res) => {
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

  const sales = await Sale.find({ ...saleFilter, taxTotal: { $gt: 0 }, status: { $in: ['completed', 'refunded'] }, ...req.companyFilter })
    .populate('customer', 'name')
    .sort({ createdAt: -1 });
  const purchases = await Purchase.find({ ...purchaseFilter, tax: { $gt: 0 }, status: 'received', ...req.companyFilter })
    .populate('supplier', 'name')
    .sort({ date: -1 });

  const transactions = [
    ...sales.map(s => ({
      date: s.createdAt,
      reference: s.invoiceNumber || '',
      partyName: s.customer?.name || 'Walk-in',
      taxableAmount: s.subtotal || 0,
      taxRate: s.taxTotal && s.subtotal ? Math.round((s.taxTotal / s.subtotal) * 1000) / 10 : 0,
      outputTax: s.taxTotal || 0,
      type: 'output',
    })),
    ...purchases.map(p => ({
      date: p.date,
      reference: p.purchaseNumber || '',
      partyName: p.supplier?.name || '',
      taxableAmount: p.subtotal || 0,
      taxRate: p.vatPercent || 0,
      inputTax: p.tax || 0,
      type: 'input',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ transactions });
});

// ─── TDS REPORT (Purchases with TDS withheld) ───
router.get('/tds', protect, async (req, res) => {
  const { startDate, endDate } = req.query;
  const filter = { status: 'received', tds: { $gt: 0 } };
  if (startDate) filter.date = { ...filter.date, $gte: new Date(startDate) };
  if (endDate) filter.date = { ...filter.date, $lte: new Date(endDate) };

  const purchases = await Purchase.find({ ...filter, ...req.companyFilter })
    .populate('supplier', 'name')
    .sort({ date: -1 });

  const transactions = purchases.map(p => ({
    date: p.date,
    reference: p.purchaseNumber || '',
    partyName: p.supplier?.name || '',
    category: 'purchase',
    amount: p.grandTotal || 0,
    rate: p.tdsRate || 0,
    tdsAmount: p.tds || 0,
    status: (p.dueAmount || 0) > 0 ? 'due' : 'paid',
  }));

  res.json({ transactions });
});

// ─── POS DAILY SUMMARY ───
router.get('/pos-summary', protect, async (req, res) => {
  const { date } = req.query;
  const start = new Date(date || new Date());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const filter = { createdAt: { $gte: start, $lte: end }, ...req.fyFilter, ...req.companyFilter };
  const allSales = await Sale.find({ ...filter, status: { $in: ['completed', 'refunded'] } });
  const refunded = await Sale.find({ ...filter, status: 'refunded' });
  const completed = allSales.filter(s => s.status === 'completed');
  const totalSales = allSales.reduce((s, sale) => s + sale.grandTotal, 0);
  const totalCash = completed.filter(s => s.paymentMethod === 'cash').reduce((s, sale) => s + sale.grandTotal, 0);
  const totalQR = completed.filter(s => s.paymentMethod === 'qr').reduce((s, sale) => s + sale.grandTotal, 0);
  const totalCredit = completed.filter(s => s.paymentMethod === 'credit').reduce((s, sale) => s + sale.grandTotal, 0);
  const totalRefunded = refunded.reduce((s, sale) => s + sale.grandTotal, 0);
  res.json({
    date: start.toISOString().split('T')[0],
    transactionCount: completed.length,
    refundCount: refunded.length,
    totalSales, totalCash, totalQR, totalCredit, totalRefunded,
    netSales: totalSales - totalRefunded,
  });
});

// ─── MONTHLY SALES REGISTER (IRD Annex-5 style) ───
router.get('/monthly-sales-register', protect, async (req, res) => {
  try {
    const { month, invoice } = req.query;
    const today = new Date();
    const year = month ? parseInt(month.split('-')[0]) : today.getFullYear();
    const mon = month ? parseInt(month.split('-')[1]) : today.getMonth() + 1;
    const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, mon, 1, 0, 0, 0));

    const dateFilter = { $or: [
      { invoiceDate: { $gte: start, $lt: end } },
      { createdAt: { $gte: start, $lt: end } },
      { date: { $gte: start, $lt: end } },
    ] };
    let filter = { ...req.companyFilter, ...dateFilter };
    if (invoice) filter.invoiceNumber = { $regex: invoice, $options: 'i' };

    const sales = await Sale.find(filter)
      .populate('customer', 'name pan address')
      .populate('cashier', 'name')
      .sort({ createdAt: -1 });

    const rows = sales.map(s => {
      const gross = (s.subtotal || 0) + (s.taxTotal || 0);
      const discount = s.discount || 0;
      const taxable = Math.max(0, (s.subtotal || 0) - discount);
      const nonTaxable = 0;
      const vat = s.taxTotal || 0;
      const net = s.grandTotal || 0;
      const date = s.invoiceDate || s.createdAt;
      return {
        invoiceNumber: s.invoiceNumber,
        date: date.toISOString ? date.toISOString().split('T')[0] : date,
        miti: adToBikramSambat(date),
        buyerName: s.customer?.name || 'Cash Sale',
        buyerPan: s.customer?.pan || '',
        paymentMethod: s.paymentMethod,
        totalGross: gross,
        discount,
        taxableAmount: taxable,
        nonTaxableAmount: nonTaxable,
        vatAmount: vat,
        netTotal: net,
        status: s.status,
        cashier: s.cashier?.name || '',
      };
    });

    const completed = rows.filter(r => r.status === 'completed');
    const summary = {
      month: `${year}-${String(mon).padStart(2, '0')}`,
      transactionCount: completed.length,
      totalGross: completed.reduce((s, r) => s + r.totalGross, 0),
      totalDiscount: completed.reduce((s, r) => s + r.discount, 0),
      totalTaxable: completed.reduce((s, r) => s + r.taxableAmount, 0),
      totalNonTaxable: completed.reduce((s, r) => s + r.nonTaxableAmount, 0),
      totalVat: completed.reduce((s, r) => s + r.vatAmount, 0),
      totalNet: completed.reduce((s, r) => s + r.netTotal, 0),
    };
    res.json({ rows, summary });
  } catch (err) {
    console.error('Monthly sales register error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── PURCHASES REPORT (PDF) ───

router.get('/purchases/pdf', protect, async (req, res) => {
  const { startDate, endDate } = req.query;
  const dateFilter = {};
  if (startDate) dateFilter.date = { $gte: new Date(startDate) };
  if (endDate) dateFilter.date = { ...dateFilter.date, $lte: new Date(endDate) };

  const purchases = await Purchase.find({ status: 'received', ...req.fyFilter, ...req.companyFilter, ...dateFilter })
    .populate('supplier', 'name')
    .populate('createdBy', 'name')
    .sort({ date: 1 });

  const company = req.companyId ? await Company.findById(req.companyId) : null;
  const companyName = company?.name || '';

  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename=purchases.pdf');
  doc.pipe(res);
  doc.fontSize(18).text(companyName, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(14).text('Purchase Register', { align: 'center' });
  doc.fontSize(10).text(
    startDate || endDate
      ? `Period: ${startDate ? new Date(startDate).toLocaleDateString('en-IN') : 'Start'} to ${endDate ? new Date(endDate).toLocaleDateString('en-IN') : 'End'}`
      : 'Period: All Time',
    { align: 'center' }
  );
  doc.moveDown(0.5);

  let total = 0;
  purchases.forEach((p, i) => {
    if (i > 0 && i % 45 === 0) doc.addPage();
    doc.fontSize(8).text(
      `${new Date(p.date).toLocaleDateString('en-IN')}  |  ${(p.purchaseNumber || '-').padEnd(14)}  |  ${(p.supplier?.name || '-').padEnd(22)}  |  Items: ${String(p.items?.length || 0).padEnd(3)}  |  Sub: ${formatNPR(p.subtotal)}  |  VAT: ${formatNPR(p.tax || 0)}  |  TDS: ${formatNPR(p.tds || 0)}  |  Net: ${formatNPR(p.grandTotal)}`
    );
    total += p.grandTotal || 0;
  });
  doc.moveDown();
  doc.fontSize(10).text(`Total Purchases: ${formatNPR(total)}`);
  doc.end();
});

// ─── CHART OF ACCOUNTS REPORT (PDF) ───

router.get('/accounts/pdf', protect, async (req, res) => {
  const accounts = await Account.find({ ...req.companyFilter }).sort({ code: 1 });
  const company = req.companyId ? await Company.findById(req.companyId) : null;
  const companyName = company?.name || '';

  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename=chart_of_accounts.pdf');
  doc.pipe(res);
  doc.fontSize(18).text(companyName, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(14).text('Chart of Accounts', { align: 'center' });
  doc.moveDown(0.5);

  accounts.forEach((a, i) => {
    if (i > 0 && i % 45 === 0) doc.addPage();
    doc.fontSize(8).text(
      `${(a.code || '').padEnd(8)}  ${(a.name || '').padEnd(32)}  ${(a.type || '').padEnd(18)}  ${(a.category || '').padEnd(18)}  Bal: ${formatNPR(a.balance || 0)}`
    );
  });
  doc.end();
});

// ─── TAX PAYMENT (VAT / TDS) ───
router.post('/pay-tax', protect, adminOnly, async (req, res) => {
  try {
    const { taxType, amount, paymentMethod, bank, date } = req.body;
    if (!taxType || !amount || amount <= 0) return res.status(400).json({ message: 'taxType and positive amount required' });

    const taxAccountCode = taxType === 'vat' ? '20200' : '20300';
    const taxAccount = await Account.findOne({ code: taxAccountCode, ...req.companyFilter });
    if (!taxAccount) return res.status(404).json({ message: `${taxType.toUpperCase()} account not found. Please seed chart of accounts.` });

    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const payAccount = paymentMethod === 'bank' && bank ? bankAccount : cashAccount;
    if (!payAccount) return res.status(404).json({ message: 'Payment account not found' });

    const payDate = date ? new Date(date) : new Date();
    const ref = `${taxType.toUpperCase()}-PAY-${Date.now().toString(36).slice(-6).toUpperCase()}`;

    const { postJournalEntryAtomic } = require('../utils/postingEngine');

    await postJournalEntryAtomic({
      companyId: req.companyId,
      date: payDate,
      reference: ref,
      description: `${taxType.toUpperCase()} Payment - Rs. ${amount}`,
      lines: [
        { account: taxAccount._id, debit: amount, credit: 0 },
        { account: payAccount._id, debit: 0, credit: amount },
      ],
      createdBy: req.user._id,
      fiscalYear: getFiscalYear(payDate),
      fiscalYearId: req.fiscalYearId || undefined,
      miti: adToBikramSambat(payDate),
      companyFilter: req.companyFilter,
      daybook: {
        date: payDate,
        sourceModule: 'TAX_PAYMENT',
        daybookType: 'CASH_BOOK',
        documentNumber: ref,
        sourceRef: ref,
        narration: `${taxType.toUpperCase()} Payment - Rs. ${amount}`,
        lines: [
          { account: taxAccount._id, accountName: taxAccount.name, debit: amount, credit: 0, partyType: 'none', partyId: null, partyName: '' },
          { account: payAccount._id, accountName: payAccount.name || (paymentMethod === 'bank' ? 'Bank' : 'Cash'), debit: 0, credit: amount, partyType: 'none', partyId: null, partyName: '' },
        ],
        createdBy: req.user._id,
      },
    });

    if (paymentMethod === 'bank' && bank) {
      const { adjustBankBalance } = require('../utils/bankService');
      await adjustBankBalance(bank, -amount, req.companyFilter).catch(() => {});
    }

    res.json({ message: `${taxType.toUpperCase()} payment recorded`, reference: ref });
  } catch (err) {
    console.error('Tax payment error:', err.message);
    res.status(500).json({ message: 'Tax payment failed: ' + err.message });
  }
});

router.get('/month-end-status', protect, async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.json({ total: 0, posted: 0, unposted: 0 });

    const [yearStr, monStr] = month.split('-');
    const year = parseInt(yearStr);
    const mon = parseInt(monStr);
    const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, mon, 1, 0, 0, 0));

    const sales = await Sale.find({ ...req.companyFilter, status: { $ne: 'refunded' }, $or: [{ invoiceDate: { $gte: start, $lt: end } }, { createdAt: { $gte: start, $lt: end } }] }).select('invoiceNumber grandTotal paymentMethod').lean();
    const returns = await Sale.find({ ...req.companyFilter, status: 'refunded', $or: [{ invoiceDate: { $gte: start, $lt: end } }, { createdAt: { $gte: start, $lt: end } }] }).select('invoiceNumber grandTotal').lean();

    const mthEndRef = await JournalEntry.findOne({ reference: `MTHEND-${month}`, ...req.companyFilter }).select('reference date').lean();
    const mthEndCogsRef = await JournalEntry.findOne({ reference: `MTHEND-${month}-COGS`, ...req.companyFilter }).select('reference').lean();
    const mthEndRetRef = await JournalEntry.findOne({ reference: `MTHEND-${month}-RET`, ...req.companyFilter }).select('reference').lean();
    const allPosted = !!mthEndRef;

    res.json({
      month,
      sales: { total: sales.length, posted: allPosted ? sales.length : 0, unposted: allPosted ? 0 : sales.length },
      returns: { total: returns.length, posted: allPosted ? returns.length : 0, unposted: allPosted ? 0 : returns.length },
      total: sales.length + returns.length,
      postedTotal: allPosted ? sales.length + returns.length : 0,
      unpostedTotal: allPosted ? 0 : sales.length + returns.length,
      mthEndPosted: allPosted,
      mthEndRef: mthEndRef?.reference || null,
      mthEndDate: mthEndRef?.date || null,
      hasCogs: !!mthEndCogsRef,
      hasReturns: !!mthEndRetRef,
    });
  } catch (err) { console.error('Month-end status error:', err.message); res.json({ total: 0, posted: 0, unposted: 0 }); }
});

router.post('/month-end-summary', protect, adminOnly, async (req, res) => {
  try {
    const { month } = req.body;
    if (!month) return res.status(400).json({ message: 'Month (YYYY-MM) is required' });

    const [yearStr, monStr] = month.split('-');
    const year = parseInt(yearStr);
    const mon = parseInt(monStr);
    const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, mon, 1, 0, 0, 0));

    const allSales = await Sale.find({ ...req.companyFilter, $or: [{ invoiceDate: { $gte: start, $lt: end } }, { createdAt: { $gte: start, $lt: end } }] }).lean();

    const sales = allSales.filter(s => s.status !== 'refunded');
    const returns = allSales.filter(s => s.status === 'refunded');

    if (sales.length === 0 && returns.length === 0) return res.status(400).json({ message: `No sales found for ${month}` });

    const ref = `MTHEND-${month}`;
    const existingMthEnd = await JournalEntry.findOne({ reference: ref, ...req.companyFilter }).lean();
    if (existingMthEnd) {
      return res.status(400).json({ message: `Month-end summary for ${month} already posted (${ref}). Nothing to post.`, nothingToPost: true });
    }

    let totalCash = 0, totalBank = 0, totalCredit = 0, totalDiscount = 0, totalSalesRevenue = 0, totalVat = 0, totalCogs = 0;
    for (const s of sales) {
      totalSalesRevenue += (s.subtotal || 0) - (s.discount || 0);
      totalVat += (s.taxTotal || 0);
      totalDiscount += (s.discount || 0);
      for (const item of (s.items || [])) totalCogs += (item.costPrice || 0) * item.quantity;

      if (s.paymentMethod === 'split' && s.paymentSplits?.length) {
        for (const sp of s.paymentSplits) {
          if (sp.method === 'cash') totalCash += sp.amount;
          else if (sp.method === 'qr' || sp.method === 'bank') totalBank += sp.amount;
          else if (sp.method === 'credit') totalCredit += sp.amount;
        }
      } else if (s.paymentMethod === 'credit') {
        totalCredit += s.grandTotal;
      } else if (s.paymentMethod === 'qr' || s.paymentMethod === 'bank') {
        totalBank += s.amountPaid || s.grandTotal;
        if ((s.grandTotal - (s.amountPaid || 0)) > 0) totalCredit += s.grandTotal - (s.amountPaid || 0);
      } else {
        totalCash += s.amountPaid || s.grandTotal;
        if ((s.grandTotal - (s.amountPaid || 0)) > 0) totalCredit += s.grandTotal - (s.amountPaid || 0);
      }
    }

    let totalCashRefund = 0, totalBankRefund = 0, totalReturnsRevenue = 0, totalReturnsVat = 0, totalReturnsCogs = 0;
    for (const r of returns) {
      totalReturnsRevenue += (r.subtotal || 0) - (r.discount || 0);
      totalReturnsVat += (r.taxTotal || 0);
      for (const item of (r.items || [])) totalReturnsCogs += (item.costPrice || 0) * item.quantity;
      if (r.paymentMethod === 'qr' || r.paymentMethod === 'bank') totalBankRefund += r.grandTotal;
      else totalCashRefund += r.grandTotal;
    }

    const cashAcc = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAcc = await Account.findOne({ code: '10200', ...req.companyFilter });
    const arAcc = await Account.findOne({ code: '10300', ...req.companyFilter });
    const discountAcc = await Account.findOne({ code: '40200', ...req.companyFilter });
    const salesRevAcc = await Account.findOne({ code: '40100', ...req.companyFilter });
    const vatOutAcc = await Account.findOne({ code: '20200', ...req.companyFilter });
    const cogsAcc = await Account.findOne({ code: '50100', ...req.companyFilter });
    const invAcc = await Account.findOne({ code: '10400', ...req.companyFilter });

    const postDate = new Date(Date.UTC(year, mon, 0, 12, 0, 0));
    const fiscalYear = getFiscalYear(postDate);
    const miti = adToBikramSambat(postDate);

    if (sales.length > 0) {
      const revLines = [];
      if (totalCash > 0 && cashAcc) revLines.push({ account: cashAcc._id, debit: Math.round(totalCash * 100) / 100, credit: 0 });
      if (totalBank > 0 && bankAcc) revLines.push({ account: bankAcc._id, debit: Math.round(totalBank * 100) / 100, credit: 0 });
      if (totalCredit > 0 && arAcc) revLines.push({ account: arAcc._id, debit: Math.round(totalCredit * 100) / 100, credit: 0 });
      if (totalDiscount > 0 && discountAcc) revLines.push({ account: discountAcc._id, debit: Math.round(totalDiscount * 100) / 100, credit: 0 });
      if (salesRevAcc) revLines.push({ account: salesRevAcc._id, debit: 0, credit: Math.round((totalSalesRevenue + totalDiscount) * 100) / 100 });
      if (totalVat > 0 && vatOutAcc) revLines.push({ account: vatOutAcc._id, debit: 0, credit: Math.round(totalVat * 100) / 100 });

      const totalRevDebit = revLines.filter(l => l.debit > 0).reduce((s, l) => s + l.debit, 0);
      const totalRevCredit = revLines.filter(l => l.credit > 0).reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalRevDebit - totalRevCredit) > 0.01 && salesRevAcc) {
        const diff = totalRevDebit - totalRevCredit;
        if (diff > 0) revLines.push({ account: salesRevAcc._id, debit: 0, credit: Math.round(diff * 100) / 100 });
      }

      if (revLines.length >= 2) {
        await postJournalEntryAtomic({
          companyId: req.companyId, date: postDate, reference: ref,
          description: `Month-End Sales Summary - ${month} (${sales.length} sales)`,
          lines: revLines, createdBy: req.user._id, fiscalYear,
          fiscalYearId: req.fiscalYearId || undefined, miti, companyFilter: req.companyFilter,
          daybook: {
            date: postDate, sourceModule: 'MONTH_END', daybookType: 'GENERAL_JOURNAL',
            documentNumber: ref, sourceRef: ref,
            narration: `Month-End Sales Summary - ${month}: Cash ${totalCash}, Bank ${totalBank}, Credit ${totalCredit}, Discount ${totalDiscount}, Revenue ${totalSalesRevenue}, VAT ${totalVat}`,
            lines: revLines.map(l => ({ ...l, accountName: '', partyType: 'none', partyId: null, partyName: '' })),
            createdBy: req.user._id, terminalIp: getClientIp(req),
          },
        });
      }

      if (totalCogs > 0 && cogsAcc && invAcc) {
        await postJournalEntryAtomic({
          companyId: req.companyId, date: postDate, reference: `${ref}-COGS`,
          description: `Month-End COGS - ${month}`,
          lines: [
            { account: cogsAcc._id, debit: Math.round(totalCogs * 100) / 100, credit: 0 },
            { account: invAcc._id, debit: 0, credit: Math.round(totalCogs * 100) / 100 },
          ],
          createdBy: req.user._id, fiscalYear, fiscalYearId: req.fiscalYearId || undefined, miti, companyFilter: req.companyFilter,
          daybook: {
            date: postDate, sourceModule: 'MONTH_END', daybookType: 'GENERAL_JOURNAL',
            documentNumber: `${ref}-COGS`, sourceRef: ref,
            narration: `Month-End COGS - ${month}: ${totalCogs}`,
            lines: [
              { account: cogsAcc._id, accountName: 'COGS', debit: Math.round(totalCogs * 100) / 100, credit: 0, partyType: 'none', partyId: null, partyName: '' },
              { account: invAcc._id, accountName: 'Inventory', debit: 0, credit: Math.round(totalCogs * 100) / 100, partyType: 'none', partyId: null, partyName: '' },
            ],
            createdBy: req.user._id, terminalIp: getClientIp(req),
          },
        });
      }
    }

    if (returns.length > 0 && (totalCashRefund + totalBankRefund + totalReturnsRevenue) > 0) {
      const salesRetAcc = await Account.findOne({ code: '40200', ...req.companyFilter });
      const retRef = `${ref}-RET`;
      const retLines = [];
      if (salesRetAcc) retLines.push({ account: salesRetAcc._id, debit: Math.round((totalReturnsRevenue + totalReturnsVat) * 100) / 100, credit: 0 });
      if (totalReturnsVat > 0 && vatOutAcc) retLines.push({ account: vatOutAcc._id, debit: Math.round(totalReturnsVat * 100) / 100, credit: 0 });
      if (totalCashRefund > 0 && cashAcc) retLines.push({ account: cashAcc._id, debit: 0, credit: Math.round(totalCashRefund * 100) / 100 });
      if (totalBankRefund > 0 && bankAcc) retLines.push({ account: bankAcc._id, debit: 0, credit: Math.round(totalBankRefund * 100) / 100 });

      if (retLines.length >= 2) {
        await postJournalEntryAtomic({
          companyId: req.companyId, date: postDate, reference: retRef,
          description: `Month-End Returns Summary - ${month} (${returns.length} returns)`,
          lines: retLines, createdBy: req.user._id, fiscalYear,
          fiscalYearId: req.fiscalYearId || undefined, miti, companyFilter: req.companyFilter,
          daybook: {
            date: postDate, sourceModule: 'MONTH_END', daybookType: 'GENERAL_JOURNAL',
            documentNumber: retRef, sourceRef: retRef,
            narration: `Month-End Returns Summary - ${month}`,
            lines: retLines.map(l => ({ ...l, accountName: '', partyType: 'none', partyId: null, partyName: '' })),
            createdBy: req.user._id, terminalIp: getClientIp(req),
          },
        });
      }

      if (totalReturnsCogs > 0 && cogsAcc && invAcc) {
        await postJournalEntryAtomic({
          companyId: req.companyId, date: postDate, reference: `${retRef}-COGS`,
          description: `Month-End Returns COGS Restock - ${month}`,
          lines: [
            { account: invAcc._id, debit: Math.round(totalReturnsCogs * 100) / 100, credit: 0 },
            { account: cogsAcc._id, debit: 0, credit: Math.round(totalReturnsCogs * 100) / 100 },
          ],
          createdBy: req.user._id, fiscalYear, fiscalYearId: req.fiscalYearId || undefined, miti, companyFilter: req.companyFilter,
          daybook: {
            date: postDate, sourceModule: 'MONTH_END', daybookType: 'GENERAL_JOURNAL',
            documentNumber: `${retRef}-COGS`, sourceRef: retRef,
            narration: `Month-End Returns COGS Restock - ${month}: ${totalReturnsCogs}`,
            lines: [
              { account: invAcc._id, accountName: 'Inventory', debit: Math.round(totalReturnsCogs * 100) / 100, credit: 0, partyType: 'none', partyId: null, partyName: '' },
              { account: cogsAcc._id, accountName: 'COGS', debit: 0, credit: Math.round(totalReturnsCogs * 100) / 100, partyType: 'none', partyId: null, partyName: '' },
            ],
            createdBy: req.user._id, terminalIp: getClientIp(req),
          },
        });
      }
    }

    res.json({
      message: `Posted ${sales.length} sales + ${returns.length} returns to ledger for ${month}`,
      reference: ref,
      posted: { sales: sales.length, returns: returns.length },
      alreadyPosted: { sales: 0, returns: 0 },
      summary: {
        totalSalesRevenue, totalDiscount, totalVat, totalCogs,
        totalCash, totalBank, totalCredit,
        totalReturnsRevenue, totalReturnsVat, totalReturnsCogs, totalCashRefund, totalBankRefund,
      },
    });
  } catch (err) {
    console.error('Month-end summary error:', err.message);
    res.status(500).json({ message: 'Month-end summary failed: ' + err.message });
  }
});

module.exports = router;
