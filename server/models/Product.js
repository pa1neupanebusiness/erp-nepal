const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, sparse: true },
  barcode: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  costPrice: { type: Number, required: true, default: 0 },
  sellingPrice: { type: Number, required: true, default: 0 },
  stock: { type: Number, required: true, default: 0 },
  minStock: { type: Number, default: 5 },
  unit: { type: String, default: 'pcs' },
  taxRate: { type: Number, default: 0 },
  vatEnabled: { type: Boolean, default: false },
  priceIncludesTax: { type: Boolean, default: false },
  itemCondition: { type: String, enum: ['new', 'second_hand'], default: 'new' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.plugin(require('./companyPlugin'));
productSchema.index({ company: 1, sku: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model('Product', productSchema);
