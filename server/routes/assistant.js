const express = require('express');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Emi = require('../models/Emi');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const { protect } = require('../middleware/auth');
const router = express.Router();

function fmt(n) { return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function dateRange(period) {
  const now = new Date();
  const start = new Date(now);
  switch (period) {
    case 'today': start.setHours(0, 0, 0, 0); break;
    case 'week': start.setDate(now.getDate() - 7); break;
    case 'month': start.setMonth(now.getMonth() - 1); break;
    case 'quarter': start.setMonth(now.getMonth() - 3); break;
    case 'year': start.setFullYear(now.getFullYear() - 1); break;
    default: start.setMonth(now.getMonth() - 1);
  }
  return { start, end: now };
}

/* ──────────── FUZZY MATCHING ──────────── */

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

function fuzzyMatch(word, candidates, maxDist) {
  const w = word.toLowerCase();
  for (const c of candidates) {
    if (w === c.toLowerCase()) return true;
    if (w.includes(c.toLowerCase()) || c.toLowerCase().includes(w)) return true;
    const maxD = maxDist || Math.max(1, Math.floor(c.length / 3));
    if (levenshtein(w, c.toLowerCase()) <= maxD) return true;
  }
  return false;
}

const INTENT_ALIASES = {
  errors: ['error', 'errors', 'mistake', 'mistakes', 'issue', 'issues', 'problem', 'problems', 'bug', 'bugs', 'fail', 'failed', 'failure', 'warning', 'warnings', 'health', 'check'],
  trial_balance: ['trial', 'balance', 'trialbalance', 'trial balance', 'trialbal'],
  profit_loss: ['profit', 'loss', 'pnl', 'p&l', 'income', 'statement', 'earning', 'earnings'],
  balance_sheet: ['balance sheet', 'bs', 'balsheet'],
  help: ['help', 'what can', 'command', 'guide', 'how to', 'usage'],
  today_summary: ['today', 'day', 'daily', 'aaj', 'summary'],
  products_list: ['product', 'products', 'item', 'items', 'good', 'goods', 'sku', 'catalogue', 'catalog', 'stock list', 'inventory list', 'product list'],
  categories_list: ['category', 'categories', 'cat', 'cats', 'group', 'subcat', 'subcategory'],
  customers_list: ['customer', 'customers', 'client', 'clients', 'debtor', 'debtors', 'cust', 'custs'],
  suppliers_list: ['supplier', 'suppliers', 'vendor', 'vendors', 'creditor', 'creditors', 'supp', 'supps'],
  sales: ['sale', 'sales', 'revenue', 'selling', 'bikri', 'invoice', 'sold', 'sold items'],
  purchases: ['purchase', 'purchases', 'buy', 'bought', 'khareed', 'purchase entry', 'bought items'],
  emi: ['emi', 'emis', 'installment', 'installments', 'hire purchase', 'loan', 'loans', 'emi list'],
  inventory: ['inventory', 'stock', 'stocks', 'stock summary', 'stock status', 'warehouse'],
  vat: ['vat', 'tax', 'gst', 'taxation'],
  cash_bank: ['cash', 'bank', 'balance', 'fund', 'liquid', 'cash balance', 'bank balance'],
  journal: ['journal', 'entries', 'vouchers', 'journal entry', 'je', 'jv'],
  outstanding: ['due', 'outstanding', 'pending', 'unpaid', 'receivable', 'payable', 'owing', 'owes'],
  employees: ['employee', 'staff', 'hr', 'attendance', 'salary', 'payroll', 'worker'],
  daybook: ['daybook', 'daily report', 'daily summary', 'day book'],
  accounts: ['account', 'accounts', 'ledger', 'chart', 'chart of account', 'coa', 'account list'],
};

const PERIOD_ALIASES = {
  today: ['today', 'aaj', 'this day', 'current day', 'tonight'],
  week: ['week', '7 day', '7 days', 'saptaha', 'weekly', 'last week'],
  month: ['month', 'mahina', 'monthly', 'this month', 'last month'],
  quarter: ['quarter', '3 month', '3 months', 'trimester', 'quarterly'],
  year: ['year', 'barsh', 'annual', 'yearly', 'this year', 'fy'],
};

const CONTEXT_MAP = {
  '/products': 'products',
  '/categories': 'products',
  '/sales': 'sales',
  '/sales/new': 'sales',
  '/sales/payment-in': 'sales',
  '/purchases': 'purchases',
  '/purchases/new': 'purchases',
  '/purchases/payment-out': 'purchases',
  '/emi': 'emi',
  '/emi/sell': 'emi',
  '/accounts': 'accounts',
  '/journal': 'journal',
  '/ledger': 'accounts',
  '/reports/daybook': 'daybook',
  '/reports/vat': 'vat',
  '/reports/tds': 'vat',
  '/customers': 'customers',
  '/suppliers': 'suppliers',
  '/hr': 'employees',
  '/hr/employees': 'employees',
};

function detectIntent(message, context) {
  const m = message.toLowerCase().trim();

  /* ── Exact alias match (fast path) ── */
  for (const [intent, aliases] of Object.entries(INTENT_ALIASES)) {
    for (const alias of aliases) {
      if (m.includes(alias)) return intent;
    }
  }

  /* ── Fuzzy word match (typo-tolerant path) ── */
  const words = m.split(/\s+/);
  for (const [intent, aliases] of Object.entries(INTENT_ALIASES)) {
    for (const word of words) {
      if (word.length < 2) continue;
      if (fuzzyMatch(word, aliases, 2)) return intent;
    }
    /* Also try two-word combos (e.g. "trial balnc") */
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words[i] + ' ' + words[i + 1];
      if (fuzzyMatch(bigram, aliases, 2)) return intent;
    }
  }

  /* ── Context-boosted: on a page with short/vague query → show that page ── */
  if (context && CONTEXT_MAP[context]) {
    const ctx = CONTEXT_MAP[context];
    if (/^(show|list|view|display|all|details?|summary|status|count|how many|total|search|find|data|open)$/i.test(m)) {
      const ctxIntents = {
        products: 'products_list', customers: 'customers_list', suppliers: 'suppliers_list',
        sales: 'sales', purchases: 'purchases', emi: 'emi', accounts: 'trial_balance',
        journal: 'journal', vat: 'vat', employees: 'employees', daybook: 'daybook',
      };
      if (ctxIntents[ctx]) return ctxIntents[ctx];
    }
  }

  return 'general';
}

function detectPeriod(message) {
  const m = message.toLowerCase();
  for (const [period, aliases] of Object.entries(PERIOD_ALIASES)) {
    for (const alias of aliases) {
      if (m.includes(alias)) return period;
    }
    for (const word of m.split(/\s+/)) {
      if (word.length >= 3 && fuzzyMatch(word, aliases, 2)) return period;
    }
  }
  return 'month';
}

/* ──────────── FAST QUERY HANDLERS ──────────── */

async function handleErrors(cf) {
  const [accounts, products, emis] = await Promise.all([
    Account.find({ ...cf }).select('code name balance isSystem isActive').lean(),
    Product.find({ ...cf, stock: { $lt: 0 } }).select('name stock').lean(),
    Emi.find({ ...cf, remainingAmount: { $gt: 0 }, paidStatus: 'completed' }).select('_id').lean(),
  ]);

  const issues = [];
  const missing = accounts.filter(a => !a.code || !a.name);
  if (missing.length) issues.push(`${missing.length} account(s) missing code or name.`);
  if (products.length) issues.push(`${products.length} product(s) have negative stock: ${products.map(p => p.name).join(', ')}`);
  const zeroAcc = accounts.filter(a => a.balance === 0 && a.isSystem);
  if (zeroAcc.length > 5) issues.push(`${zeroAcc.length} system accounts have zero balance (may need opening balances).`);
  if (emis.length) issues.push(`${emis.length} EMI(s) marked completed but still have outstanding balance.`);

  const entries = await JournalEntry.find({ ...cf }).select('lines').sort({ createdAt: -1 }).limit(200).lean();
  let imbalanced = 0;
  for (const e of entries) {
    const dr = e.lines.reduce((s, l) => s + (l.debit || 0), 0);
    const cr = e.lines.reduce((s, l) => s + (l.credit || 0), 0);
    if (Math.abs(dr - cr) > 0.001) imbalanced++;
  }
  if (imbalanced) issues.push(`${imbalanced} journal entry(ies) have debits ≠ credits.`);
  if (!issues.length) issues.push('No errors detected. All checks passed.');

  return { title: 'System Health Check', items: issues.map(i => ({ icon: i.startsWith('No') ? '✓' : '⚠', text: i })) };
}

async function handleTrialBalance(cf, fy) {
  const [accounts, entries] = await Promise.all([
    Account.find({ ...cf, isActive: true }).select('code name type balance').sort({ code: 1 }).lean(),
    JournalEntry.find({ isPosted: true, ...cf, ...fy }).select('lines').lean(),
  ]);
  const map = new Map(accounts.map(a => [a._id.toString(), { ...a, dr: 0, cr: 0 }]));
  for (const e of entries) {
    for (const l of e.lines) {
      const acc = map.get(l.account?.toString());
      if (acc) { acc.dr += l.debit || 0; acc.cr += l.credit || 0; }
    }
  }
  const rows = Array.from(map.values()).filter(a => a.dr || a.cr).map(a => {
    const net = a.dr - a.cr;
    return { code: a.code, name: a.name, debit: net >= 0 ? net : 0, credit: net < 0 ? -net : 0 };
  });
  const totalDr = rows.reduce((s, r) => s + r.debit, 0);
  const totalCr = rows.reduce((s, r) => s + r.credit, 0);
  return { title: 'Trial Balance', rows, totalDr, totalCr, balanced: Math.abs(totalDr - totalCr) < 0.01 };
}

async function handleProfitLoss(cf, fy) {
  const [accounts, entries] = await Promise.all([
    Account.find({ ...cf, isActive: true }).select('type category balance').lean(),
    JournalEntry.find({ isPosted: true, ...cf, ...fy }).select('lines').lean(),
  ]);
  const map = new Map(accounts.map(a => [a._id.toString(), { ...a, dr: 0, cr: 0 }]));
  for (const e of entries) {
    for (const l of e.lines) {
      const acc = map.get(l.account?.toString());
      if (acc) { acc.dr += l.debit || 0; acc.cr += l.credit || 0; }
    }
  }
  const all = Array.from(map.values());
  const revenue = all.filter(a => a.type === 'revenue').reduce((s, a) => s + (a.cr - a.dr), 0);
  const cogs = all.filter(a => a.category === 'cogs').reduce((s, a) => s + (a.dr - a.cr), 0);
  const expenses = all.filter(a => a.category === 'operating_expense').reduce((s, a) => s + (a.dr - a.cr), 0);
  const otherIncome = all.filter(a => a.category === 'other_income').reduce((s, a) => s + (a.cr - a.dr), 0);
  const gross = revenue - cogs;
  const net = gross - expenses + otherIncome;
  return { title: 'Profit & Loss Summary', revenue, cogs, grossProfit: gross, expenses, otherIncome, netProfit: net };
}

async function handleSales(cf, period) {
  const { start, end } = dateRange(period);
  const sales = await Sale.find({ ...cf, createdAt: { $gte: start, $lte: end } })
    .select('grandTotal taxTotal paymentMethod').lean();
  const total = sales.reduce((s, sale) => s + (sale.grandTotal || 0), 0);
  const vat = sales.reduce((s, sale) => s + (sale.taxTotal || 0), 0);
  const credit = sales.filter(s => s.paymentMethod === 'credit');
  return { title: `Sales — Last ${period}`, count: sales.length, total, vat, creditSales: credit.length, creditAmount: credit.reduce((s, sale) => s + (sale.grandTotal || 0), 0), avgSale: sales.length ? total / sales.length : 0 };
}

async function handlePurchases(cf, period) {
  const { start, end } = dateRange(period);
  const purchases = await Purchase.find({ ...cf, date: { $gte: start, $lte: end } })
    .select('grandTotal dueAmount tax').lean();
  return { title: `Purchases — Last ${period}`, count: purchases.length, total: purchases.reduce((s, p) => s + (p.grandTotal || 0), 0), due: purchases.reduce((s, p) => s + (p.dueAmount || 0), 0), vat: purchases.reduce((s, p) => s + (p.tax || 0), 0) };
}

async function handleEmi(cf) {
  const emis = await Emi.find({ ...cf }).select('remainingAmount netAmount paidStatus').lean();
  const active = emis.filter(e => e.remainingAmount > 0);
  return { title: 'EMI Summary', total: emis.length, active: active.length, totalSales: emis.reduce((s, e) => s + (e.netAmount || 0), 0), totalRemaining: active.reduce((s, e) => s + (e.remainingAmount || 0), 0) };
}

async function handleInventory(cf) {
  const products = await Product.find({ ...cf, isActive: true }).select('name stock minStock costPrice unit').lean();
  const lowStock = products.filter(p => p.stock <= (p.minStock || 5));
  return { title: 'Inventory Summary', totalProducts: products.length, totalValue: products.reduce((s, p) => s + (p.stock || 0) * (p.costPrice || 0), 0), lowStock: lowStock.length, outOfStock: products.filter(p => p.stock <= 0).length, lowStockItems: lowStock.slice(0, 10).map(p => `${p.name} (${p.stock})`) };
}

async function handleCustomerList(cf) {
  const [customers, sales] = await Promise.all([
    Customer.find({ ...cf }).select('name phone email pan').sort({ name: 1 }).lean(),
    Sale.find({ ...cf, paymentMethod: 'credit', status: 'completed' }).select('customer grandTotal').lean(),
  ]);
  const receivableByCustomer = {};
  sales.forEach(s => { const cid = s.customer?.toString(); if (cid) receivableByCustomer[cid] = (receivableByCustomer[cid] || 0) + (s.grandTotal || 0); });
  if (!customers.length) return { title: 'Customers', items: [{ icon: '!', text: 'No customers found.' }] };
  const rows = customers.map(c => ({ Name: c.name, Phone: c.phone || '-', Email: c.email || '-', PAN: c.pan || '-', Receivable: fmt(receivableByCustomer[c._id.toString()] || 0) }));
  return { title: `Customers — ${customers.length} total`, rows };
}

async function handleCustomerSummary(cf) {
  const sales = await Sale.find({ ...cf, paymentMethod: 'credit', status: 'completed' }).select('grandTotal').lean();
  const customers = await Customer.countDocuments(cf);
  return { title: 'Customers', total: customers, creditSales: sales.length, totalReceivable: sales.reduce((s, sale) => s + (sale.grandTotal || 0), 0) };
}

async function handleSupplierList(cf) {
  const [suppliers, purchases] = await Promise.all([
    Supplier.find({ ...cf }).select('name phone email pan').sort({ name: 1 }).lean(),
    Purchase.find({ ...cf, dueAmount: { $gt: 0 } }).select('supplier dueAmount').lean(),
  ]);
  const payableBySupplier = {};
  purchases.forEach(p => { const sid = p.supplier?.toString(); if (sid) payableBySupplier[sid] = (payableBySupplier[sid] || 0) + (p.dueAmount || 0); });
  if (!suppliers.length) return { title: 'Suppliers', items: [{ icon: '!', text: 'No suppliers found.' }] };
  const rows = suppliers.map(s => ({ Name: s.name, Phone: s.phone || '-', Email: s.email || '-', PAN: s.pan || '-', Payable: fmt(payableBySupplier[s._id.toString()] || 0) }));
  return { title: `Suppliers — ${suppliers.length} total`, rows };
}

async function handleSupplierSummary(cf) {
  const purchases = await Purchase.find({ ...cf, dueAmount: { $gt: 0 } }).select('dueAmount').lean();
  const suppliers = await Supplier.countDocuments(cf);
  return { title: 'Suppliers', total: suppliers, unpaidPurchases: purchases.length, totalPayable: purchases.reduce((s, p) => s + (p.dueAmount || 0), 0) };
}

async function handleProductList(cf) {
  const products = await Product.find({ ...cf, isActive: true }).select('name sku stock unit sellingPrice costPrice minStock category taxRate priceIncludesTax').sort({ name: 1 }).lean();
  if (!products.length) return { title: 'Products', items: [{ icon: '!', text: 'No products found.' }] };
  const rows = products.map(p => ({
    Name: p.name, SKU: p.sku || '-', Stock: `${p.stock || 0} ${p.unit || 'pcs'}`,
    Price: fmt(p.sellingPrice), Cost: fmt(p.costPrice),
    Status: p.stock <= 0 ? 'Out' : p.stock <= (p.minStock || 5) ? 'Low' : 'OK',
  }));
  return { title: `Products — ${products.length} items`, rows };
}

async function handleVat(cf, fy) {
  const [accounts, entries] = await Promise.all([
    Account.find({ ...cf }).select('code').lean(),
    JournalEntry.find({ isPosted: true, ...cf, ...fy }).select('lines').lean(),
  ]);
  const vatOut = accounts.find(a => a.code === '20200');
  const vatIn = accounts.find(a => a.code === '10501');
  let outputVat = 0, inputVat = 0;
  for (const e of entries) {
    for (const l of e.lines) {
      if (vatOut && l.account?.toString() === vatOut._id.toString()) outputVat += (l.credit || 0) - (l.debit || 0);
      if (vatIn && l.account?.toString() === vatIn._id.toString()) inputVat += (l.debit || 0) - (l.credit || 0);
    }
  }
  return { title: 'VAT Summary', outputVat, inputVat, netPayable: outputVat - inputVat };
}

async function handleCashBank(cf) {
  const [cash, bank] = await Promise.all([
    Account.findOne({ code: '10100', ...cf }).select('balance').lean(),
    Account.findOne({ code: '10200', ...cf }).select('balance').lean(),
  ]);
  return { title: 'Cash & Bank', cashBalance: cash?.balance || 0, bankBalance: bank?.balance || 0, totalLiquid: (cash?.balance || 0) + (bank?.balance || 0) };
}

async function handleTodaySummary(cf) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const [sales, purchases] = await Promise.all([
    Sale.find({ ...cf, createdAt: { $gte: today, $lt: tomorrow } }).select('grandTotal').lean(),
    Purchase.find({ ...cf, date: { $gte: today, $lt: tomorrow } }).select('grandTotal').lean(),
  ]);
  const totalSales = sales.reduce((s, sale) => s + (sale.grandTotal || 0), 0);
  const totalPurchases = purchases.reduce((s, p) => s + (p.grandTotal || 0), 0);
  return { title: "Today's Summary", salesCount: sales.length, totalSales, purchaseCount: purchases.length, totalPurchases, netFlow: totalSales - totalPurchases };
}

async function handleEmployees(cf) {
  try {
    const Employee = require('../models/Employee');
    const employees = await Employee.find(cf).select('name position department phone').sort({ name: 1 }).lean();
    if (!employees.length) return { title: 'Employees', items: [{ icon: '!', text: 'No employees found.' }] };
    return { title: `Employees — ${employees.length} total`, items: employees.slice(0, 20).map(e => ({
      icon: '👤', text: `${e.name} — ${e.position || e.department || 'Staff'}${e.phone ? ` (${e.phone})` : ''}`
    }))};
  } catch { return { title: 'Employees', items: [{ icon: '!', text: 'Employee module not available.' }] }; }
}

async function handleDaybook(cf) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const entries = await JournalEntry.find({ ...cf, createdAt: { $gte: today, $lt: tomorrow } })
    .select('reference totalDebit totalCredit')
    .sort({ createdAt: 1 }).lean();
  if (!entries.length) return { title: 'Daybook — Today', items: [{ icon: '!', text: 'No entries today.' }] };
  const rows = entries.map(e => ({ Ref: e.reference || '-', Debit: fmt(e.totalDebit), Credit: fmt(e.totalCredit) }));
  const totalDr = entries.reduce((s, e) => s + (e.totalDebit || 0), 0);
  const totalCr = entries.reduce((s, e) => s + (e.totalCredit || 0), 0);
  return { title: `Daybook — ${entries.length} entries today`, rows, totalDr, totalCr };
}

async function handleAccounts(cf) {
  const accounts = await Account.find({ ...cf, isActive: true }).select('code name type balance').sort({ code: 1 }).lean();
  if (!accounts.length) return { title: 'Chart of Accounts', items: [{ icon: '!', text: 'No accounts found.' }] };
  const rows = accounts.slice(0, 30).map(a => ({ Code: a.code || '-', Name: a.name, Type: a.type || '-', Balance: fmt(a.balance) }));
  return { title: `Chart of Accounts — ${accounts.length} total`, rows };
}

function handleHelp() {
  return {
    title: 'ERP Assistant — What I Can Do',
    items: [
      { icon: '📦', text: '"Show products" — Full product list with stock & prices' },
      { icon: '👤', text: '"Show customers" — All customers with receivables' },
      { icon: '🏭', text: '"Show suppliers" — All suppliers with payables' },
      { icon: '🧾', text: '"Sales this month" — Sales summary for any period' },
      { icon: '📋', text: '"Purchases this week" — Purchase summary' },
      { icon: '📊', text: '"Trial balance" — Current trial balance' },
      { icon: '💰', text: '"Profit and loss" or "P&L" — Income statement' },
      { icon: '💳', text: '"EMI summary" — Active EMIs and receivables' },
      { icon: '📦', text: '"Inventory" or "Stock" — Stock overview' },
      { icon: '🔢', text: '"How many customers" — Count entities' },
      { icon: '⚠', text: '"Low stock" — Items running low' },
      { icon: '💸', text: '"Who owes me money" — Outstanding receivables' },
      { icon: '🏦', text: '"Cash and bank" — Liquid balances' },
      { icon: '✅', text: '"Check errors" — System health check' },
      { icon: '📒', text: '"Show accounts" — Chart of accounts' },
      { icon: '📅', text: '"Daybook" — Today\'s journal entries' },
      { icon: '💡', text: 'Tip: Typos are OK! "show prodcts", "salss report" still work.' },
    ]
  };
}

async function handleGeneralQuery(message, cf, fy, context) {
  const m = message.toLowerCase();

  if (/\b(how many|count|total|number)\b/.test(m)) {
    const results = [];
    const queries = [];
    if (/\b(product|item|good|sku)\b/.test(m)) queries.push(Product.countDocuments({ ...cf, isActive: true }).then(c => results.push({ icon: '📦', text: `Total products: ${c}` })));
    if (/\b(customer|client|debtor)\b/.test(m)) queries.push(Customer.countDocuments(cf).then(c => results.push({ icon: '👤', text: `Total customers: ${c}` })));
    if (/\b(supplier|vendor|creditor)\b/.test(m)) queries.push(Supplier.countDocuments(cf).then(c => results.push({ icon: '🏭', text: `Total suppliers: ${c}` })));
    if (/\b(sale|invoice)\b/.test(m)) queries.push(Sale.countDocuments(cf).then(c => results.push({ icon: '🧾', text: `Total sales invoices: ${c}` })));
    if (/\b(purchase)\b/.test(m)) queries.push(Purchase.countDocuments(cf).then(c => results.push({ icon: '📋', text: `Total purchase entries: ${c}` })));
    if (/\b(emi|installment)\b/.test(m)) queries.push(Emi.countDocuments(cf).then(c => results.push({ icon: '💳', text: `Total EMI records: ${c}` })));
    if (/\b(account|ledger)\b/.test(m)) queries.push(Account.countDocuments(cf).then(c => results.push({ icon: '📒', text: `Total accounts: ${c}` })));
    if (/\b(employee|staff)\b/.test(m)) { try { const Employee = require('../models/Employee'); queries.push(Employee.countDocuments(cf).then(c => results.push({ icon: '👤', text: `Total employees: ${c}` }))); } catch {} }
    await Promise.all(queries);
    if (results.length) return { title: 'Count', items: results };
  }

  if (/\b(low\s*stock|out\s*of\s*stock|shortage)\b/.test(m)) {
    const low = await Product.find({ ...cf, isActive: true }).select('name stock minStock unit').lean();
    const lowStock = low.filter(p => p.stock <= (p.minStock || 5));
    if (!lowStock.length) return { title: 'Low Stock Check', items: [{ icon: '✓', text: 'All products are well-stocked.' }] };
    return { title: `Low Stock — ${lowStock.length} items`, items: lowStock.slice(0, 15).map(p => ({
      icon: p.stock <= 0 ? '❌' : '⚠', text: `${p.name} — ${p.stock || 0} ${p.unit || 'pcs'} (min: ${p.minStock || 5})`
    }))};
  }

  if (/\b(who|which)\s+(customer|supplier|person)\b/.test(m) || /\b(owes|owing|due|pending|unpaid|receivable|payable)\b/.test(m)) {
    const isCustomer = /\b(customer|debtor|receivable)\b/.test(m);
    const isSupplier = /\b(supplier|creditor|payable)\b/.test(m);
    if (isCustomer || (!isSupplier && /\b(owes|receivable|due)\b/.test(m))) {
      const sales = await Sale.find({ ...cf, paymentMethod: 'credit', status: 'completed' }).select('customer grandTotal amountPaid').lean();
      const dueByCustomer = {};
      for (const s of sales) { const due = (s.grandTotal || 0) - (s.amountPaid || 0); if (due > 0) { const cid = s.customer?.toString(); if (cid) dueByCustomer[cid] = (dueByCustomer[cid] || 0) + due; } }
      if (!Object.keys(dueByCustomer).length) return { title: 'Outstanding Receivables', items: [{ icon: '✓', text: 'No outstanding receivables.' }] };
      const customers = await Customer.find({ _id: { $in: Object.keys(dueByCustomer) }, ...cf }).select('name').lean();
      const custMap = new Map(customers.map(c => [c._id.toString(), c]));
      const rows = Object.keys(dueByCustomer).map(cid => ({ Name: custMap.get(cid)?.name || 'Unknown', Amount: fmt(dueByCustomer[cid]) })).sort((a, b) => parseFloat(b.Amount.replace(/,/g, '')) - parseFloat(a.Amount.replace(/,/g, '')));
      return { title: `Outstanding Receivables — ${rows.length} customers`, rows };
    }
    if (isSupplier || /\b(payable)\b/.test(m)) {
      const purchases = await Purchase.find({ ...cf, dueAmount: { $gt: 0 } }).select('supplier dueAmount').lean();
      if (!purchases.length) return { title: 'Outstanding Payables', items: [{ icon: '✓', text: 'No outstanding payables.' }] };
      const dueBySupplier = {};
      for (const p of purchases) { const sid = p.supplier?.toString(); if (sid) dueBySupplier[sid] = (dueBySupplier[sid] || 0) + (p.dueAmount || 0); }
      const suppliers = await Supplier.find({ _id: { $in: Object.keys(dueBySupplier) }, ...cf }).select('name').lean();
      const supMap = new Map(suppliers.map(s => [s._id.toString(), s]));
      const rows = Object.keys(dueBySupplier).map(sid => ({ Name: supMap.get(sid)?.name || 'Unknown', Amount: fmt(dueBySupplier[sid]) })).sort((a, b) => parseFloat(b.Amount.replace(/,/g, '')) - parseFloat(a.Amount.replace(/,/g, '')));
      return { title: `Outstanding Payables — ${rows.length} suppliers`, rows };
    }
  }

  if (/\b(employee|staff|hr|attendance|salary)\b/.test(m)) return handleEmployees(cf);
  if (/\b(daybook|daily)\b/.test(m)) return handleDaybook(cf);
  if (/\b(account|ledger|chart)\b/.test(m)) return handleAccounts(cf);

  /* ─── Context fallback: vague query on a page → show that page ─── */
  if (context && CONTEXT_MAP[context]) {
    const ctx = CONTEXT_MAP[context];
    if (m.length <= 3 || /^(show|list|view|all|data|details|status|summary|total|count)$/i.test(m.trim())) {
      const ctxHandlers = {
        products: handleProductList, customers: handleCustomerList, suppliers: handleSupplierList,
        sales: (cf) => handleSales(cf, 'month'), purchases: (cf) => handlePurchases(cf, 'month'),
        emi: handleEmi, accounts: handleAccounts, journal: handleDaybook,
        vat: (cf) => handleVat(cf, fy), employees: handleEmployees, daybook: handleDaybook,
      };
      if (ctxHandlers[ctx]) return ctxHandlers[ctx](cf);
    }
  }

  /* ─── Free-text search (products, customers, suppliers, accounts) ─── */
  const searchTerm = m.replace(/[^a-z0-9\s]/g, '').trim();
  if (searchTerm.length >= 2) {
    const [products, custs, sups, accounts] = await Promise.all([
      Product.find({ ...cf, isActive: true, $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { sku: { $regex: searchTerm, $options: 'i' } },
      ]}).select('name sku stock unit sellingPrice').lean(),
      Customer.find({ ...cf, $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
      ]}).select('name phone').lean(),
      Supplier.find({ ...cf, $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
      ]}).select('name phone').lean(),
      Account.find({ ...cf, isActive: true, $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { code: { $regex: searchTerm, $options: 'i' } },
      ]}).select('code name balance').lean(),
    ]);
    const results = [];
    products.forEach(p => results.push({ icon: '📦', text: `${p.name} (${p.sku || 'no SKU'}) — Stock: ${p.stock || 0} ${p.unit || 'pcs'}, Price: ${fmt(p.sellingPrice)}` }));
    custs.forEach(c => results.push({ icon: '👤', text: `${c.name}${c.phone ? ` (${c.phone})` : ''} — Customer` }));
    sups.forEach(s => results.push({ icon: '🏭', text: `${s.name}${s.phone ? ` (${s.phone})` : ''} — Supplier` }));
    accounts.forEach(a => results.push({ icon: '📒', text: `${a.code || '-'} ${a.name} — Balance: ${fmt(a.balance)}` }));
    if (results.length) return { title: 'Search Results', items: results.slice(0, 15) };
  }

  return { title: 'I can help with that', items: [
    { icon: '💡', text: 'Try asking naturally — e.g. "show products", "how many customers", "low stock", "who owes me money"' },
    { icon: '💡', text: 'You can ask about: sales, purchases, products, customers, suppliers, EMI, VAT, accounts, employees, errors, today\'s summary.' },
    { icon: '💡', text: 'Add periods: "this week", "this month", "this quarter", "this year".' },
    { icon: '💡', text: 'On any page, just type "show" or "list" to see that module\'s data.' },
    { icon: '💡', text: 'Typos are OK! Try "salss", "prodcts", "suplyr" — I\'ll figure it out.' },
  ]};
}

/* ──────────── ROUTE ──────────── */

router.post('/assistant', protect, async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message?.trim()) return res.json({ reply: { title: 'Error', items: [{ icon: '!', text: 'Please type a question.' }] } });

    const intent = detectIntent(message, context);
    const period = detectPeriod(message);
    const cf = req.companyFilter;
    const fy = req.fyFilter;

    let result;
    switch (intent) {
      case 'errors': result = await handleErrors(cf); break;
      case 'trial_balance': result = await handleTrialBalance(cf, fy); break;
      case 'profit_loss': result = await handleProfitLoss(cf, fy); break;
      case 'balance_sheet': result = await handleTrialBalance(cf, fy); break;
      case 'sales': result = await handleSales(cf, period); break;
      case 'purchases': result = await handlePurchases(cf, period); break;
      case 'emi': result = await handleEmi(cf); break;
      case 'inventory': result = await handleInventory(cf); break;
      case 'customers': result = await handleCustomerSummary(cf); break;
      case 'suppliers': result = await handleSupplierSummary(cf); break;
      case 'customers_list': result = await handleCustomerList(cf); break;
      case 'suppliers_list': result = await handleSupplierList(cf); break;
      case 'products_list': result = await handleProductList(cf); break;
      case 'categories_list': result = await handleProductList(cf); break;
      case 'vat': result = await handleVat(cf, fy); break;
      case 'cash_bank': result = await handleCashBank(cf); break;
      case 'journal': result = await handleDaybook(cf); break;
      case 'outstanding': result = await handleCustomerSummary(cf); break;
      case 'today_summary': result = await handleTodaySummary(cf); break;
      case 'employees': result = await handleEmployees(cf); break;
      case 'daybook': result = await handleDaybook(cf); break;
      case 'accounts': result = await handleAccounts(cf); break;
      case 'help': result = handleHelp(); break;
      default: result = await handleGeneralQuery(message, cf, fy, context);
    }

    res.json({ reply: result });
  } catch (err) {
    console.error('Assistant error:', err);
    res.json({ reply: { title: 'Error', items: [{ icon: '!', text: `Something went wrong: ${err.message}` }] } });
  }
});

module.exports = router;
