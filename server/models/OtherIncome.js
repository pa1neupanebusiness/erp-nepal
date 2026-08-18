const mongoose = require('mongoose');

const otherIncomeSchema = new mongoose.Schema({
  incomeNo: { type: String, required: true },
  date: { type: Date, default: Date.now },
  items: [{
    category: {
      type: String,
      enum: ['Grants & Funding', 'Commissions', 'Sponsorship', 'Investment'],
      required: true,
    },
    amount: { type: Number, required: true },
  }],
  totalAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['cash', 'bank', 'cheque', 'digital'], default: 'cash' },
  bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank', default: null },
  remarks: { type: String },
  attachments: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
}, { timestamps: true });

otherIncomeSchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('OtherIncome', otherIncomeSchema);
