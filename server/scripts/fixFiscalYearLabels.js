/**
 * Migration: Fix purchase and sales invoice numbers / fiscalYear labels
 * that were generated with the wrong BS conversion (1966/67 instead of 2083/84).
 *
 * Usage: node scripts/fixFiscalYearLabels.js [dry]
 *   - without "dry": applies changes
 *   - with "dry":    reports only, no writes
 */
const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const { getBSFiscalYear } = require('../utils/dateUtils');

const isDryRun = process.argv.includes('dry');

async function run() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) { console.error('Set MONGO_URI env var'); process.exit(1); }
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE (will update documents)'}\n`);

  // ── Purchases ──
  const badPurchases = await Purchase.find({
    $or: [
      { fiscalYear: { $regex: /^196[6-9]\// } },
      { purchaseNumber: { $regex: /196[6-9]\// } },
    ],
  }).select('purchaseNumber fiscalYear date company');
  console.log(`Found ${badPurchases.length} purchase(s) with wrong fiscal year label`);

  for (const p of badPurchases) {
    const correctFY = getBSFiscalYear(p.date || new Date());
    const oldPurchaseNo = p.purchaseNumber;
    const oldFY = p.fiscalYear;

    // Extract the counter part from old purchase number: PUR-1966/67-0001 → 0001
    const counterMatch = oldPurchaseNo.match(/-(\d{4,})$/);
    const counter = counterMatch ? counterMatch[1] : '0001';
    const newPurchaseNo = `PUR-${correctFY.label}-${counter}`;

    console.log(`  Purchase ${oldPurchaseNo}: fiscalYear "${oldFY}" → "${correctFY.label}", purchaseNumber → "${newPurchaseNo}"`);

    if (!isDryRun) {
      await Purchase.updateOne(
        { _id: p._id },
        { $set: { fiscalYear: correctFY.label, purchaseNumber: newPurchaseNo } }
      );
    }
  }

  // ── Sales ──
  const badSales = await Sale.find({
    $or: [
      { fiscalYear: { $regex: /^196[6-9]\// } },
      { invoiceNumber: { $regex: /196[6-9]\// } },
    ],
  }).select('invoiceNumber fiscalYear date company');
  console.log(`\nFound ${badSales.length} sale(s) with wrong fiscal year label`);

  for (const s of badSales) {
    const correctFY = getBSFiscalYear(s.date || new Date());
    const oldInvNo = s.invoiceNumber;
    const oldFY = s.fiscalYear;

    // Extract counter: 1966/67-022 → 022
    const counterMatch = oldInvNo.match(/-(\d{3,})$/);
    const counter = counterMatch ? counterMatch[1] : '001';
    const newInvNo = `${correctFY.label}-${counter}`;

    console.log(`  Sale ${oldInvNo}: fiscalYear "${oldFY}" → "${correctFY.label}", invoiceNumber → "${newInvNo}"`);

    if (!isDryRun) {
      await Sale.updateOne(
        { _id: s._id },
        { $set: { fiscalYear: correctFY.label, invoiceNumber: newInvNo } }
      );
    }
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
