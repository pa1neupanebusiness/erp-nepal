/* eslint-disable no-console */
// Cleans all trial data across every company while keeping structural records:
// companies, users and the chart of accounts (Accounts).
// Also resets invoice/EMI counters so numbering restarts cleanly.
//
// Usage:
//   node scripts/cleanTrialData.js            # uses MONGO_URI from .env
//   set MONGO_URI=... && node scripts/cleanTrialData.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Company = require('../models/Company');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI is not set. Aborting.');
  process.exit(1);
}

const WIPE_COLLECTIONS = [
  'sales', 'purchases', 'products', 'categories', 'suppliers', 'customers',
  'vouchers', 'journalentries', 'emis', 'pettyexpenses', 'damages',
  'heldbills', 'banks', 'paymentins', 'paymentouts', 'refundrequests',
  'attendances', 'leaves', 'salaries', 'employees', 'inventorymovements',
  'daybookentries', 'daybooksequences', 'irdauditlogs', 'fiscalyears',
];

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to MongoDB');

  const stats = [];
  for (const name of WIPE_COLLECTIONS) {
    const coll = mongoose.connection.db.collection(name);
    const r = await coll.deleteMany({});
    stats.push(`${name}: ${r.deletedCount}`);
  }

  await Company.updateMany({}, { $set: { invoiceCounter: 0, emiCounter: 0, creditNoteCounter: 0, purchaseCounter: 0, voucherCounter: 0, receiptCounter: 0, paymentOutCounter: 0 } });
  stats.push('companies: all counters reset');

  console.log(stats.join('\n'));
  await mongoose.disconnect();
  console.log('Trial data cleanup complete.');
}

main().catch(err => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
