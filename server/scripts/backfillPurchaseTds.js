const mongoose = require('mongoose');
const Account = require('../models/Account');
const Purchase = require('../models/Purchase');
const Supplier = require('../models/Supplier');
const JournalEntry = require('../models/JournalEntry');
const { findOrCreateSupplierPayable } = require('../utils/supplierPayable');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function getFiscalYear(date) {
  const d = new Date(date);
  const m = d.getMonth() + 1, y = d.getFullYear(), dy = d.getDate();
  if (m > 7 || (m === 7 && dy >= 16)) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

function inferInclusive(p) {
  const inclusiveTotal = round2((p.subtotal || 0) - (p.discount || 0));
  const exclusiveTotal = round2((p.subtotal || 0) + (p.tax || 0) - (p.discount || 0));
  if (Math.abs(p.grandTotal - inclusiveTotal) < 0.01) return true;
  if (Math.abs(p.grandTotal - exclusiveTotal) < 0.01) return false;
  return (p.subtotal || 0) > 0 && (p.tax || 0) > 0 && Math.abs(p.grandTotal - (p.subtotal - p.tax - (p.discount || 0))) < 0.01;
}

function inferVatPercent(p, inclusive) {
  if ((p.tax || 0) <= 0 || (p.subtotal || 0) <= 0) return 13;
  const base = inclusive ? (p.subtotal - p.tax) : p.subtotal;
  if (base <= 0) return 13;
  const pct = Math.round((p.tax / base) * 10000) / 100;
  return pct > 0 && pct <= 100 ? pct : 13;
}

async function backfill() {
  try {
    const directUri = 'mongodb://pa1neupanebusiness_db_user:kQldJ8RuQTjwu4CK@ac-xwhm0aj-shard-00-00.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-01.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-02.mcq0er7.mongodb.net:27017/erp_nepal?ssl=true&replicaSet=atlas-vz8u1r-shard-0&authSource=admin&retryWrites=true&w=majority';
    const mongoUri = process.env.MONGO_URI || directUri;
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const purchases = await Purchase.find({ tax: { $gt: 0 }, $or: [{ tds: { $exists: false } }, { tds: 0 }, { tds: null }] });
    console.log(`Purchases with VAT needing TDS backfill: ${purchases.length}\n`);

    let updated = 0, adjusted = 0;
    for (const p of purchases) {
      const inclusive = inferInclusive(p);
      const vatPercent = inferVatPercent(p, inclusive);
      const base = Math.max(0, (p.grandTotal || 0) - (p.tax || 0));
      const tds = round2(base * 0.015);
      const oldDue = p.dueAmount || 0;
      const newDue = Math.max(0, (p.grandTotal || 0) - tds - (p.paidAmount || 0));

      p.vatPercent = vatPercent;
      p.inclusiveVat = inclusive;
      p.tdsRate = 1.5;
      p.tds = tds;
      p.dueAmount = newDue;
      await p.save();
      updated++;

      const supplier = p.supplier ? await Supplier.findOne({ _id: p.supplier }) : null;
      const payableAccount = await findOrCreateSupplierPayable(p.company, { company: p.company }, supplier);
      const tdsAccount = await Account.findOne({ code: '20300', company: p.company });

      if (tds > 0 && oldDue > 0 && payableAccount && tdsAccount) {
        await JournalEntry.create({
          date: p.date || new Date(),
          reference: p.purchaseNumber,
          description: `TDS 1.5% backfill adjustment - ${p.purchaseNumber}`,
          fiscalYear: getFiscalYear(p.date || new Date()),
          lines: [
            { account: payableAccount._id, debit: tds, credit: 0 },
            { account: tdsAccount._id, debit: 0, credit: tds },
          ],
          company: p.company,
        });
        await Account.findOneAndUpdate({ _id: payableAccount._id }, { $inc: { balance: tds } });
        await Account.findOneAndUpdate({ _id: tdsAccount._id }, { $inc: { balance: -tds } });
        adjusted++;
      }

      console.log(`  ${p.purchaseNumber} | ${inclusive ? 'inclusive' : 'exclusive'} | VAT ${vatPercent}% | tax ${p.tax} | TDS ${tds} | due ${oldDue} -> ${newDue}`);
    }

    console.log(`\nDone. Updated ${updated} purchases, created ${adjusted} TDS adjustment journal entries.`);
  } catch (err) {
    console.error('Backfill error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

backfill();
