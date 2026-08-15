const mongoose = require('mongoose');

const bankSchema = new mongoose.Schema({
  name: { type: String, required: true },
  accountNumber: { type: String },
  branch: { type: String },
  balance: { type: Number, default: 0 },
  initialBalance: { type: Number, default: 0 },
  isFinanceBank: { type: Boolean, default: false },
}, { timestamps: true });

bankSchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('Bank', bankSchema);
