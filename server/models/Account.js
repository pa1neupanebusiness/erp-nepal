const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  code: { type: String, required: true },
  name: { type: String, required: true },
  nameNepali: { type: String },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountGroup', default: null },
  type: {
    type: String,
    enum: ['asset', 'liability', 'equity', 'revenue', 'expense', 'contra_asset', 'contra_revenue'],
    required: true,
  },
  category: {
    type: String,
    enum: [
      'current_asset', 'fixed_asset', 'current_liability', 'long_term_liability',
      'equity', 'revenue', 'cogs', 'operating_expense', 'other_income', 'other_expense',
      'contra_asset', 'contra_revenue',
    ],
  },
  balance: { type: Number, default: 0 },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  isSystem: { type: Boolean, default: false },
}, { timestamps: true });

accountSchema.index({ company: 1, code: 1 }, { unique: true });
accountSchema.plugin(require('./companyPlugin'));

module.exports = mongoose.model('Account', accountSchema);
