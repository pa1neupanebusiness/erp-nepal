const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactPerson: { type: String },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  pan: { type: String },
  advanceBalance: { type: Number, default: 0 }, // prepaid amounts not yet applied to purchases
}, { timestamps: true });

supplierSchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('Supplier', supplierSchema);
