const mongoose = require('mongoose');

const heldBillItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String },
  price: { type: Number, required: true },
  costPrice: { type: Number, default: 0 },
  quantity: { type: Number, required: true },
  taxRate: { type: Number, default: 13 },
  tax: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
});

const heldBillSchema = new mongoose.Schema({
  billNumber: { type: String, required: true },
  items: [heldBillItemSchema],
  subtotal: { type: Number, required: true },
  taxTotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  discountMode: { type: String, enum: ['percentage', 'flat'], default: 'flat' },
  grandTotal: { type: Number, required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String },
  note: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

heldBillSchema.plugin(require('./companyPlugin'));
heldBillSchema.index({ company: 1, billNumber: 1 }, { unique: true });
module.exports = mongoose.model('HeldBill', heldBillSchema);
