const mongoose = require('mongoose');

const inventoryMovementSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  type: { type: String, enum: ['in', 'out', 'adjustment', 'sales_return', 'purchase_return'], required: true },
  quantity: { type: Number, required: true },
  reference: { type: String },
  note: { type: String },
  date: { type: Date, default: Date.now },
  fiscalYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

inventoryMovementSchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
