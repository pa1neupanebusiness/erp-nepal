const mongoose = require('mongoose');
const companyPlugin = require('./companyPlugin');

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

branchSchema.plugin(companyPlugin);
branchSchema.index({ company: 1, name: 1 });

module.exports = mongoose.model('Branch', branchSchema);
