const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const Account = require('./models/Account');
const JournalEntry = require('./models/JournalEntry');

const APPLY = process.env.APPLY === '1';

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('connected. APPLY=' + APPLY);

  const jes = await JournalEntry.find({});
  let imbalanced = 0;
  for (const je of jes) {
    let dr = 0, cr = 0;
    for (const l of je.lines) { dr += l.debit || 0; cr += l.credit || 0; }
    if (Math.abs(dr - cr) > 0.005) {
      imbalanced++;
      const diff = Math.round((cr - dr) * 100) / 100; // positive => need more debit
      console.log('IMBALANCED', je._id, '|', je.description, '| dr=' + dr, 'cr=' + cr, 'diff=' + diff);
      if (!APPLY) continue;
      if (diff > 0) {
        const target = [...je.lines].sort((a, b) => (b.debit || 0) - (a.debit || 0))[0];
        target.debit = Math.round(((target.debit || 0) + diff) * 100) / 100;
      } else {
        const target = [...je.lines].sort((a, b) => (b.credit || 0) - (a.credit || 0))[0];
        target.credit = Math.round(((target.credit || 0) - diff) * 100) / 100;
      }
      let nr = 0, nc = 0;
      for (const l of je.lines) { nr += l.debit || 0; nc += l.credit || 0; }
      if (Math.abs(nr - nc) > 0.005) { console.log('  !! STILL BAD after fix'); continue; }
      const acc = await Account.findById(je.lines.find(l => (l.debit || 0) > 0 || (l.credit || 0) > 0).account);
      const isCreditNormal = acc && ['liability', 'equity', 'income', 'contra_expense'].includes(acc.type);
      if (acc) {
        acc.balance = Math.round(((acc.balance || 0) + (isCreditNormal ? -diff : diff)) * 100) / 100;
        await acc.save();
      }
      await je.save();
      console.log('  FIXED -> dr=' + nr + ' cr=' + nc + (acc ? ' | account ' + acc.code + ' balance now ' + acc.balance : ''));
    }
  }
  console.log('TOTAL IMBALANCED ENTRIES:', imbalanced);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
