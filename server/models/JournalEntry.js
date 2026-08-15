const mongoose = require('mongoose');

const journalLineSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  subLedger: {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  },
  bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank' },
});

const journalEntrySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  miti: { type: String },
  fiscalYear: { type: String },
  fiscalYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear' },
  reference: { type: String },
  description: { type: String, required: true },
  lines: [journalLineSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isPosted: { type: Boolean, default: true },
  irdPayload: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

journalEntrySchema.pre('save', function (next) {
  let totalDebit = 0;
  let totalCredit = 0;
  this.lines.forEach(line => {
    totalDebit += line.debit || 0;
    totalCredit += line.credit || 0;
  });
  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    return next(new Error(`Double-entry violation: Debits (${totalDebit}) must equal Credits (${totalCredit}) in journal entry "${this.description}"`));
  }
  if (totalDebit === 0 && totalCredit === 0) {
    return next(new Error('Journal entry has zero debit and zero credit'));
  }
  next();
});

journalEntrySchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('JournalEntry', journalEntrySchema);
