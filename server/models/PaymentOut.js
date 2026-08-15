const mongoose = require('mongoose');

const paymentOutSchema = new mongoose.Schema({
  paymentNumber: { type: String, required: true },
  date: { type: Date, default: Date.now },
  miti: { type: String },
  fiscalYear: { type: String },
  fiscalYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear' },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['cash', 'bank', 'qr'], default: 'cash' },
  bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank' },
  chequeNumber: { type: String },
  reference: { type: String },
  remarks: { type: String },
  allocations: [{
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    amount: { type: Number, required: true },
  }],
  advanceAmount: { type: Number, default: 0 },
  advanceAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
}, { timestamps: true });

paymentOutSchema.plugin(require('./companyPlugin'));
paymentOutSchema.index({ company: 1, paymentNumber: 1 }, { unique: true });
module.exports = mongoose.model('PaymentOut', paymentOutSchema);
