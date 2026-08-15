const mongoose = require('mongoose');

const DAYBOOK_TYPES = ['CASH_BOOK', 'SALES_BOOK', 'PURCHASES_BOOK', 'SALES_RETURNS', 'PURCHASE_RETURNS', 'GENERAL_JOURNAL'];

const dayBookEntrySchema = new mongoose.Schema({
  entryNumber: { type: String, required: true },
  daybookType: { type: String, required: true, enum: DAYBOOK_TYPES, index: true },
  gregorianDate: { type: Date, required: true },
  miti: { type: String, default: '' },
  fiscalYear: { type: String, default: '' },
  sourceModule: { type: String, required: true, index: true },
  documentNumber: { type: String, required: true },
  sourceRef: { type: String, default: '' },
  journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  accountRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  accountName: { type: String, default: '' },
  partyType: { type: String, enum: ['supplier', 'customer', 'none'], default: 'none' },
  partyId: { type: mongoose.Schema.Types.ObjectId, default: null },
  partyName: { type: String, default: '' },
  narration: { type: String, default: '' },
  debitAmount: { type: Number, default: 0 },
  creditAmount: { type: Number, default: 0 },
  entryType: { type: String, enum: ['ORIGINAL', 'REVERSAL'], default: 'ORIGINAL' },
  status: { type: String, enum: ['POSTED', 'CANCELLED'], default: 'POSTED' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

dayBookEntrySchema.index({ company: 1, entryNumber: 1 }, { unique: true });
dayBookEntrySchema.index({ company: 1, gregorianDate: 1 });
dayBookEntrySchema.index({ company: 1, documentNumber: 1 });
dayBookEntrySchema.index({ company: 1, daybookType: 1, gregorianDate: 1 });

dayBookEntrySchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('DayBookEntry', dayBookEntrySchema);
module.exports.DAYBOOK_TYPES = DAYBOOK_TYPES;
