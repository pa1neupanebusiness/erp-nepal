const mongoose = require('mongoose');
const Voucher = require('../models/Voucher');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const Emi = require('../models/Emi');
const Migration = require('../models/Migration');
const Company = require('../models/Company');
const User = require('../models/User');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const CourierOrder = require('../models/CourierOrder');
const OrderTracking = require('../models/OrderTracking');
const { getChartOfAccounts } = require('../utils/chartOfAccounts');
const { getBSFiscalYear } = require('../utils/dateUtils');
const { DEFAULT_MODULES } = Company;

const SUPER_ADMIN_EMAIL = 'pa1neupane.business@gmail.com';

async function setupSuperAdminAndModules() {
  const records = await User.find({ email: SUPER_ADMIN_EMAIL });
  for (const rec of records) {
    if (rec.company) {
      await User.findByIdAndDelete(rec._id);
      console.log(`Deleted company-bound duplicate of ${SUPER_ADMIN_EMAIL}`);
    }
  }
  let sa = await User.findOne({ email: SUPER_ADMIN_EMAIL });
  if (!sa) {
    sa = await User.create({
      name: 'Super Admin',
      email: SUPER_ADMIN_EMAIL,
      password: 'P@1neupane',
      role: 'super_admin',
      groups: ['pos', 'inventory', 'accounts', 'hr'],
    });
    console.log(`Created super admin ${SUPER_ADMIN_EMAIL}`);
  } else {
    if (sa.role !== 'super_admin') {
      sa.role = 'super_admin';
      sa.groups = ['pos', 'inventory', 'accounts', 'hr'];
      await sa.save();
    }
    if (sa.company) {
      sa.company = null;
      await sa.save();
    }
  }

  await Company.updateMany(
    { $or: [{ enabledModules: { $exists: false } }, { enabledModules: { $size: 0 } }] },
    { $set: { enabledModules: DEFAULT_MODULES } }
  );

  const companies = await Company.find().select('_id name email');
  for (const c of companies) {
    let owner = await User.findOne({ company: c._id, email: c.email });
    if (!owner) owner = await User.findOne({ company: c._id, role: 'admin' });
    if (owner && !owner.isCompanySuperAdmin) {
      owner.isCompanySuperAdmin = true;
      await owner.save();
    }
  }
  console.log(`Super admin setup complete (${companies.length} companies checked).`);
}

async function seedMissingChartAccounts() {
  const companies = await Company.find({}).lean();
  let added = 0, updatedCompanies = 0;
  for (const c of companies) {
    const chart = getChartOfAccounts(c.country);
    const chartAccounts = (chart && chart.accounts) || [];
    if (!chartAccounts.length) continue;
    const existing = await Account.find({ company: c._id }).select('code').lean();
    const existingCodes = new Set(existing.map(a => a.code));
    const missing = chartAccounts.filter(a => !existingCodes.has(a.code));
    if (missing.length === 0) continue;
    await Account.insertMany(missing.map(a => ({ ...a, isSystem: true, company: c._id })));
    added += missing.length;
    updatedCompanies++;
    console.log(`Seeded ${missing.length} missing chart accounts for company ${c.name || c._id}`);
  }
  console.log(`Chart seeding complete: ${added} accounts added across ${updatedCompanies} companies`);
}

async function backfillVoucherJournal() {
  const vouchers = await Voucher.find({}).select(
    'voucherNumber type date fiscalYear account amount paymentMethod payments reference description createdBy company status'
  ).lean();

  const refDocs = await JournalEntry.find({}, 'reference').lean();
  const refSet = new Set(refDocs.map(r => r.reference));

  const companyAccounts = {};
  async function getMethodAccounts(companyId) {
    if (companyAccounts[companyId]) return companyAccounts[companyId];
    const cashAccount = await Account.findOne({ code: '10100', company: companyId });
    const bankAccount = await Account.findOne({ code: '10200', company: companyId });
    companyAccounts[companyId] = { cashAccount, bankAccount };
    return companyAccounts[companyId];
  }

  let created = 0, reversals = 0, skipped = 0;

  for (const v of vouchers) {
    const accs = await getMethodAccounts(v.company);
    const methodAccount = (m) => (m === 'cash' ? accs.cashAccount?._id : accs.bankAccount?._id);

    const splitPayments = v.payments?.length
      ? v.payments
      : [{ method: v.paymentMethod || 'cash', amount: v.amount }];
    const total = splitPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const valid = (lines) => lines.length > 0 && lines.every(l => l.account);
    const post = async (lines, reference, description, date, fiscalYear) => {
      await JournalEntry.create({
        date, reference, description, fiscalYear,
        lines, createdBy: v.createdBy, company: v.company,
      });
      for (const line of lines) {
        await Account.findOneAndUpdate(
          { _id: line.account, company: v.company },
          { $inc: { balance: line.debit - line.credit } }
        );
      }
    };

    const hasOriginal = refSet.has(v.voucherNumber);
    const hasReversal = refSet.has(`CNCL-${v.voucherNumber}`);

    if (v.status === 'active' && !hasOriginal) {
      const lines = [];
      if (v.type === 'receipt') {
        for (const p of splitPayments) lines.push({ account: methodAccount(p.method), debit: p.amount, credit: 0 });
        lines.push({ account: v.account, debit: 0, credit: total });
      } else if (v.type === 'payment') {
        lines.push({ account: v.account, debit: total, credit: 0 });
        for (const p of splitPayments) lines.push({ account: methodAccount(p.method), debit: 0, credit: p.amount });
      }
      if (!valid(lines)) { skipped++; continue; }
      await post(lines, v.voucherNumber, `[Voucher] ${v.description}`, v.date || new Date(), v.fiscalYear);
      created++;
    } else if (v.status === 'cancelled' && hasOriginal && !hasReversal) {
      const lines = [];
      if (v.type === 'receipt') {
        for (const p of splitPayments) lines.push({ account: methodAccount(p.method), debit: 0, credit: p.amount });
        lines.push({ account: v.account, debit: total, credit: 0 });
      } else if (v.type === 'payment') {
        lines.push({ account: v.account, debit: 0, credit: total });
        for (const p of splitPayments) lines.push({ account: methodAccount(p.method), debit: p.amount, credit: 0 });
      }
      if (!valid(lines)) { skipped++; continue; }
      await post(lines, `CNCL-${v.voucherNumber}`, `Cancellation of voucher ${v.voucherNumber}`, new Date(), v.fiscalYear);
      reversals++;
    }
  }

  console.log(`Voucher ledger backfill: ${created} entries created, ${reversals} reversal entries created, ${skipped} skipped (missing cash/bank account or non-posting type).`);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function backfillEmiJournalBankLabels() {
  const emis = await Emi.find({ bankName: { $exists: true, $ne: '' } }).select('emiNumber bankName').lean();
  let updated = 0;
  for (const e of emis) {
    const label = `(EMI-${e.bankName})`;
    const already = new RegExp(escapeRegExp(label));
    const res = await JournalEntry.updateMany(
      { reference: e.emiNumber, description: { $not: already } },
      [{ $set: { description: { $concat: ['$description', ' ', label] } } }]
    );
    updated += res.modifiedCount || 0;
  }
  console.log(`EMI ledger bank label backfill: ${updated} journal entries updated.`);
}

async function backfillEmiCogsDetail() {
  const emis = await Emi.find({}).populate('product', 'name costPrice').lean();
  let updated = 0;
  for (const e of emis) {
    if (!e.product || !e.product.name) continue;
    const bankLabel = e.bankName ? ` (EMI-(${e.bankName}))` : '';
    const newDesc = `COGS for EMI ${e.emiNumber} - ${e.product.name} (Unit Cost ${e.product.costPrice || 0})${bankLabel}`;
    const already = new RegExp(`^${escapeRegExp(`COGS for EMI ${e.emiNumber} - `)}`);
    const res = await JournalEntry.updateMany({
      reference: e.emiNumber,
      $and: [
        { description: { $regex: /^COGS for EMI / } },
        { description: { $not: already } },
      ],
    }, { $set: { description: newDesc } });
    updated += res.modifiedCount || 0;
  }
  console.log(`EMI COGS detail backfill: ${updated} journal entries updated.`);
}

async function dedupeCompanyField(col, field) {
  const pipe = [
    { $match: { [field]: { $exists: true, $ne: null, $ne: '' } } },
    { $group: { _id: { company: '$company', key: '$' + field }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ];
  const dupes = await col.aggregate(pipe).toArray();
  let removed = 0;
  for (const d of dupes) {
    const keep = d.ids[0];
    await col.deleteMany({ _id: { $in: d.ids.slice(1) } });
    removed += d.ids.length - 1;
  }
  if (removed > 0) console.log(`Dedupe: removed ${removed} duplicate(s) from ${col.collectionName} on ${field}`);
}

async function companyScopedIndexes() {
  const conn = mongoose.connection;
  const plans = [
    { coll: 'sales', old: 'invoiceNumber_1', field: 'invoiceNumber', sparse: false },
    { coll: 'emis', old: 'emiNumber_1', field: 'emiNumber', sparse: false },
    { coll: 'purchases', old: 'purchaseNumber_1', field: 'purchaseNumber', sparse: false },
    { coll: 'vouchers', old: 'voucherNumber_1', field: 'voucherNumber', sparse: false },
    { coll: 'paymentins', old: 'receiptNumber_1', field: 'receiptNumber', sparse: false },
    { coll: 'paymentouts', old: 'paymentNumber_1', field: 'paymentNumber', sparse: false },
    { coll: 'heldbills', old: 'billNumber_1', field: 'billNumber', sparse: false },
    { coll: 'categories', old: 'name_1', field: 'name', sparse: false },
    { coll: 'products', old: 'sku_1', field: 'sku', sparse: true },
    { coll: 'employees', old: 'employeeId_1', field: 'employeeId', sparse: false },
  ];
  let changed = 0;
  for (const p of plans) {
    let col;
    try { col = conn.collection(p.coll); } catch { console.warn(`Collection ${p.coll} not available; skipping`); continue; }
    let idxs;
    try { idxs = await col.indexes(); } catch { console.warn(`Collection ${p.coll} not found; skipping`); continue; }
    if (idxs.find(i => i.name === p.old)) {
      await col.dropIndex(p.old);
      changed++;
      console.log(`Dropped global index ${p.coll}.${p.old}`);
    }
    const compoundName = `company_1_${p.field}_1`;
    if (!idxs.find(i => i.name === compoundName)) {
      try {
        await col.createIndex({ company: 1, [p.field]: 1 }, { unique: true, sparse: p.sparse });
        changed++;
        console.log(`Created company-scoped unique index on ${p.coll}.${p.field}`);
      } catch (err) {
        if (err && (err.code === 11000 || /duplicate/.test(err.message || ''))) {
          await dedupeCompanyField(col, p.field);
          await col.createIndex({ company: 1, [p.field]: 1 }, { unique: true, sparse: p.sparse });
          changed++;
          console.log(`Deduped then created company-scoped unique index on ${p.coll}.${p.field}`);
        } else {
          console.warn(`Index on ${p.coll}.${p.field} not changed: ${err.message}`);
        }
      }
    }
  }
  console.log(`Company-scoped index migration complete (${changed} index operations).`);
}

function generateShortName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30);
}

async function backfillCompanyShortNames() {
  const companies = await Company.find({ $or: [{ shortName: { $exists: false } }, { shortName: null }, { shortName: '' }] });
  let updated = 0;
  for (const c of companies) {
    c.shortName = generateShortName(c.name);
    await c.save();
    updated++;
    console.log(`Set shortName "${c.shortName}" for company "${c.name}"`);
  }
  console.log(`Company shortName backfill complete: ${updated} companies updated.`);
}

async function fixTdsAccountNames() {
  const renames = [
    { filter: { name: 'TDS Payable - Service [15%]' }, newName: 'TDS Payable - Service' },
    { filter: { name: 'TDS Payable - Goods/Contracts [1.5%]' }, newName: 'TDS Payable - Contract/Goods' },
  ];
  for (const r of renames) {
    const result = await Account.updateMany(r.filter, { $set: { name: r.newName } });
    if (result.modifiedCount > 0) console.log(`  Renamed ${result.modifiedCount} accounts to "${r.newName}"`);
  }

  // Catch ALL names containing TDS Payable with any percentage in brackets
  const allTds = await Account.find({ name: { $regex: /TDS Payable.*\[\d+\.?\d*%\]/i } });
  for (const acc of allTds) {
    let newName = 'TDS Payable';
    if (/service/i.test(acc.name)) newName = 'TDS Payable - Service';
    else if (/contract|goods/i.test(acc.name)) newName = 'TDS Payable - Contract/Goods';
    if (acc.name !== newName) {
      await Account.updateOne({ _id: acc._id }, { $set: { name: newName } });
      console.log(`  Renamed "${acc.name}" → "${newName}"`);
    }
  }
  console.log('TDS account name fix complete.');
}

async function fixFiscalYearLabels() {
  const badPurchases = await Purchase.find({
    $or: [
      { fiscalYear: { $regex: /^196[6-9]\// } },
      { purchaseNumber: { $regex: /196[6-9]\// } },
    ],
  }).select('purchaseNumber fiscalYear date company');
  console.log(`FiscalYear fix: ${badPurchases.length} purchase(s) with wrong label`);

  for (const p of badPurchases) {
    const correctFY = getBSFiscalYear(p.date || new Date());
    const counterMatch = p.purchaseNumber.match(/-(\d{4,})$/);
    const counter = counterMatch ? counterMatch[1] : '0001';
    const newPurchaseNo = `PUR-${correctFY.label}-${counter}`;
    await Purchase.updateOne({ _id: p._id }, { $set: { fiscalYear: correctFY.label, purchaseNumber: newPurchaseNo } });
    console.log(`  ${p.purchaseNumber} → ${newPurchaseNo}`);
  }

  const badSales = await Sale.find({
    $or: [
      { fiscalYear: { $regex: /^196[6-9]\// } },
      { invoiceNumber: { $regex: /196[6-9]\// } },
    ],
  }).select('invoiceNumber fiscalYear date company');
  console.log(`FiscalYear fix: ${badSales.length} sale(s) with wrong label`);

  for (const s of badSales) {
    const correctFY = getBSFiscalYear(s.date || new Date());
    const counterMatch = s.invoiceNumber.match(/-(\d{3,})$/);
    const counter = counterMatch ? counterMatch[1] : '001';
    const newInvNo = `${correctFY.label}-${counter}`;
    await Sale.updateOne({ _id: s._id }, { $set: { fiscalYear: correctFY.label, invoiceNumber: newInvNo } });
    console.log(`  ${s.invoiceNumber} → ${newInvNo}`);
  }
  console.log('FiscalYear label fix complete.');
}

async function backfillInclusiveVatFlag() {
  const sales = await Sale.find({ taxTotal: { $gt: 0 }, inclusiveVat: { $ne: true } }).select('items discount taxTotal grandTotal inclusiveVat').lean();
  let updated = 0;
  for (const s of sales) {
    const rawSubTotalGross = (s.items || []).reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 0), 0);
    const rawAfterDiscount = Math.max(0, rawSubTotalGross - (s.discount || 0));
    const looksExclusive = Math.abs((rawAfterDiscount + (s.taxTotal || 0)) - (s.grandTotal || 0)) < 0.5;
    if (!looksExclusive) {
      await Sale.updateOne({ _id: s._id }, { $set: { inclusiveVat: true } });
      updated++;
    }
  }
  console.log(`Backfill inclusiveVat: ${updated} sales marked as inclusive out of ${sales.length} with VAT`);
}

async function backfillBranchDeliverySource() {
  // Propagate sourceBranch from CourierOrder -> OrderTracking where it exists.
  // Old courier records were created without a source branch and cannot be
  // reliably attributed to a source, so only genuine sourceBranch values are
  // copied. Records without a source will still appear under their destination
  // branch ("received") rather than being misattributed.
  let trackingUpdated = 0;

  const couriers = await CourierOrder.find({
    sourceBranch: { $exists: true, $ne: null },
  }).select('tracking sourceBranch').lean();
  for (const c of couriers) {
    if (!c.tracking) continue;
    const res = await OrderTracking.updateOne(
      { _id: c.tracking, sourceBranch: { $exists: false } },
      { $set: { sourceBranch: c.sourceBranch } }
    );
    trackingUpdated += res.modifiedCount || 0;
  }

  console.log(`Branch delivery source backfill: ${couriers.length} courier orders with sourceBranch, ${trackingUpdated} tracking records updated.`);
}

async function backfillCourierSaleCustomer() {
  // For courier orders the person paying for the service is the SENDER, so the
  // generated sale must reference the sender as its customer (shown on invoices
  // and recent-transactions). Older records stored the receiver instead.
  const couriers = await CourierOrder.find({ sale: { $exists: true, $ne: null } })
    .select('sale sender senderCustomer').lean();
  let updated = 0;
  for (const c of couriers) {
    const senderId = c.senderCustomer || null;
    if (!senderId) continue;
    const sale = await Sale.findById(c.sale).select('customer').lean();
    if (!sale) continue;
    if (!sale.customer || sale.customer.toString() !== senderId.toString()) {
      await Sale.updateOne({ _id: sale._id }, { $set: { customer: senderId } });
      updated++;
    }
  }
  console.log(`Courier sale customer backfill: ${updated} sale(s) updated to sender customer out of ${couriers.length} courier orders`);
}

const migrations = [
  { name: 'setupSuperAdminAndModules', run: setupSuperAdminAndModules },
  { name: 'seedMissingChartAccounts', run: seedMissingChartAccounts },
  { name: 'voucherLedgerBackfill', run: backfillVoucherJournal },
  { name: 'voucherLedgerBackfill-v2', run: backfillVoucherJournal },
  { name: 'emiLedgerBankLabel', run: backfillEmiJournalBankLabels },
  { name: 'emiLedgerCogsDetail', run: backfillEmiCogsDetail },
  { name: 'companyScopedIndexes', run: companyScopedIndexes },
  { name: 'backfillCompanyShortNames', run: backfillCompanyShortNames },
  { name: 'fixTdsAccountNames', run: fixTdsAccountNames },
  { name: 'fixFiscalYearLabels', run: fixFiscalYearLabels },
  { name: 'backfillInclusiveVatFlag', run: backfillInclusiveVatFlag },
  { name: 'backfillBranchDeliverySource', run: backfillBranchDeliverySource },
  { name: 'backfillCourierSaleCustomer', run: backfillCourierSaleCustomer },
];

async function runMigrations() {
  for (const m of migrations) {
    const applied = await Migration.findOne({ name: m.name });
    if (applied) continue;
    try {
      await Migration.create({ name: m.name });
    } catch (err) {
      if (err && err.code === 11000) {
        console.log(`Migration ${m.name} already running/applied; skipping.`);
        continue;
      }
      throw err;
    }
    console.log(`Running migration: ${m.name}...`);
    try {
      await m.run();
      console.log(`Migration complete: ${m.name}`);
    } catch (err) {
      await Migration.deleteOne({ name: m.name });
      console.error(`Migration ${m.name} failed:`, err.message);
    }
  }
}

module.exports = runMigrations;
