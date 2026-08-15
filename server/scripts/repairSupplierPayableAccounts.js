const mongoose = require('mongoose');
const Account = require('../models/Account');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const PaymentOut = require('../models/PaymentOut');
const JournalEntry = require('../models/JournalEntry');
const { findOrCreateSupplierPayable } = require('../utils/supplierPayable');

const DRY_RUN = process.env.DRY_RUN !== '0';

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Find the supplier id behind a journal entry that references a payable account.
async function resolveSupplierForEntry(entry) {
  // 1) subLedger.supplier set on the payable line.
  const payableLine = entry.lines.find(l => l.subLedger && l.subLedger.supplier);
  if (payableLine && payableLine.subLedger.supplier) return payableLine.subLedger.supplier;

  // 2) reference may be a purchase number (purchase journal / purchase payment).
  const ref = entry.reference || '';
  if (ref) {
    const purchase = await Purchase.findOne({ purchaseNumber: ref }).select('supplier');
    if (purchase && purchase.supplier) return purchase.supplier;
    const payment = await PaymentOut.findOne({ paymentNumber: ref }).select('supplier');
    if (payment && payment.supplier) return payment.supplier;
  }

  // 3) description carries a purchase / payment number.
  const descMatch = String(entry.description || '').match(/(PO-\d+|PMT-\d+)/);
  if (descMatch) {
    const purchase = await Purchase.findOne({ purchaseNumber: descMatch[0] }).select('supplier');
    if (purchase && purchase.supplier) return purchase.supplier;
    const payment = await PaymentOut.findOne({ paymentNumber: descMatch[0] }).select('supplier');
    if (payment && payment.supplier) return payment.supplier;
  }
  return null;
}

async function repair() {
  try {
    const directUri = 'mongodb://pa1neupanebusiness_db_user:kQldJ8RuQTjwu4CK@ac-xwhm0aj-shard-00-00.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-01.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-02.mcq0er7.mongodb.net:27017/erp_nepal?ssl=true&replicaSet=atlas-vz8u1r-shard-0&authSource=admin&retryWrites=true&w=majority';
    const mongoUri = process.env.MONGO_URI || directUri;
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log(`Connected to MongoDB (DRY_RUN=${DRY_RUN})\n`);

    const undefinedAccounts = await Account.find({ name: 'Accounts Payable - undefined' });
    console.log(`Found ${undefinedAccounts.length} account(s) named 'Accounts Payable - undefined'\n`);
    if (undefinedAccounts.length === 0) {
      console.log('Nothing to repair.');
      return;
    }

    let entriesRepaired = 0;
    let linesRepaired = 0;
    let unresolvedEntries = 0;

    for (const badAccount of undefinedAccounts) {
      const entries = await JournalEntry.find({ 'lines.account': badAccount._id });
      console.log(`--- Account ${badAccount.code} ${badAccount.name} (${badAccount.company}) ---`);
      console.log(`  Referenced by ${entries.length} journal entrie(s)`);

      for (const entry of entries) {
        const supplierId = await resolveSupplierForEntry(entry);
        if (!supplierId) {
          unresolvedEntries++;
          console.log(`  SKIP ${entry.reference || entry._id} (could not resolve supplier)`);
          continue;
        }
        const supplier = await Supplier.findOne({ _id: supplierId });
        if (!supplier) {
          unresolvedEntries++;
          console.log(`  SKIP ${entry.reference || entry._id} (supplier ${supplierId} not found)`);
          continue;
        }

        const correctAccount = await findOrCreateSupplierPayable(entry.company, { company: entry.company }, supplier);
        if (!correctAccount) {
          unresolvedEntries++;
          console.log(`  SKIP ${entry.reference || entry._id} (no payable account for supplier)`);
          continue;
        }

        let changed = false;
        for (const line of entry.lines) {
          if (line.account && line.account.toString() === badAccount._id.toString()) {
            if (correctAccount._id.toString() === badAccount._id.toString()) continue;
            const delta = round2((line.debit || 0) - (line.credit || 0));
            if (!DRY_RUN) {
              line.account = correctAccount._id;
              if (line.subLedger && !line.subLedger.supplier) line.subLedger.supplier = supplier._id;
            }
            changed = true;
            linesRepaired++;
            console.log(`  ${DRY_RUN ? '[dry]' : '  '}${entry.reference || entry._id}: line ${(line.debit || 0).toFixed(2)}/D ${(line.credit || 0).toFixed(2)}/C -> ${correctAccount.code} ${correctAccount.name} (delta ${delta})`);
          }
        }

        if (changed && !DRY_RUN) {
          await entry.save();
          // Recompute ledger balances for both accounts from journal history.
          const recompute = async (accountId) => {
            const accEntries = await JournalEntry.find({ 'lines.account': accountId });
            const balance = accEntries.reduce((sum, e) => {
              const l = e.lines.find(x => x.account && x.account.toString() === accountId.toString());
              return sum + round2((l ? (l.debit || 0) - (l.credit || 0) : 0));
            }, 0);
            await Account.findOneAndUpdate({ _id: accountId }, { $set: { balance } });
            return balance;
          };
          await recompute(correctAccount._id);
          await recompute(badAccount._id);
          entriesRepaired++;
        }
      }
    }

    console.log(`\nDone. Repaired entries: ${entriesRepaired}, lines remapped: ${linesRepaired}, unresolved: ${unresolvedEntries}.`);
    if (DRY_RUN) console.log('DRY RUN - no changes written. Set DRY_RUN=0 to apply.');
  } catch (err) {
    console.error('Repair error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

repair();
