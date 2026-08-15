const mongoose = require('mongoose');

const damageSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  type: { type: String, enum: ['damage', 'expired', 'theft', 'other'], default: 'damage' },
  costPrice: { type: Number, default: 0 },
  totalLoss: { type: Number, default: 0 },
  description: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

damageSchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('Damage', damageSchema);
