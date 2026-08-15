const mongoose = require('mongoose');

const paymentInSchema = new mongoose.Schema({
  receiptNumber: { type: String, required: true },
  date: { type: Date, default: Date.now },
  miti: { type: String },
  fiscalYear: { type: String },
  fiscalYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['cash', 'bank', 'qr', 'cheque'], default: 'cash' },
  bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank' },
  chequeNumber: { type: String },
  reference: { type: String },
  note: { type: String },
  allocations: [{
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    emi: { type: mongoose.Schema.Types.ObjectId, ref: 'Emi' },
    amount: { type: Number, required: true },
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
}, { timestamps: true });

paymentInSchema.plugin(require('./companyPlugin'));
paymentInSchema.index({ company: 1, receiptNumber: 1 }, { unique: true });
module.exports = mongoose.model('PaymentIn', paymentInSchema);
