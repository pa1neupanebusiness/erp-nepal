const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  pan: { type: String },
  loyaltyPoints: { type: Number, default: 0 },
}, { timestamps: true });

customerSchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('Customer', customerSchema);
