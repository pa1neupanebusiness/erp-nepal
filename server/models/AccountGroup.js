const mongoose = require('mongoose');

const AccountGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  parent_group_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountGroup', default: null },
  root_type: { type: String, required: true, enum: ['Assets', 'Liabilities', 'Income', 'Expense'] },
  is_predefined: { type: Boolean, default: false },
}, { timestamps: true });

AccountGroupSchema.index({ company: 1, name: 1 }, { unique: true });
AccountGroupSchema.plugin(require('./companyPlugin'));

const AccountGroup = mongoose.model('AccountGroup', AccountGroupSchema);
module.exports = AccountGroup;
