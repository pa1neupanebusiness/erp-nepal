const mongoose = require('mongoose');

const paymentSplitSchema = new mongoose.Schema({
  method: { type: String, enum: ['cash', 'bank', 'qr'], required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const voucherSchema = new mongoose.Schema({
  voucherNumber: { type: String, required: true },
  type: { type: String, enum: ['payment', 'receipt', 'contra', 'journal'], required: true },
  date: { type: Date, default: Date.now },
  fiscalYear: { type: String },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cash', 'bank', 'qr'], default: 'cash' },
  payments: [paymentSplitSchema],
  reference: { type: String },
  description: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
}, { timestamps: true });

voucherSchema.plugin(require('./companyPlugin'));
voucherSchema.index({ company: 1, voucherNumber: 1 }, { unique: true });
module.exports = mongoose.model('Voucher', voucherSchema);
