const mongoose = require('mongoose');

const pettyExpenseSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cash', 'bank'], default: 'cash' },
  bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank', default: null },
  receiptNumber: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
}, { timestamps: true });

pettyExpenseSchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('PettyExpense', pettyExpenseSchema);
