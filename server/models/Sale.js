const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  costPrice: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
});

const saleSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true },
  items: [saleItemSchema],
  subtotal: { type: Number, required: true },
  taxTotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  amountPaid: { type: Number, required: true },
  dueAmount: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'paid' },
  change: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['cash', 'qr', 'bank', 'credit', 'other', 'split'], default: 'cash' },
  paymentSplits: [{
    method: { type: String, enum: ['cash', 'qr', 'bank', 'credit'], required: true },
    amount: { type: Number, required: true },
    bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank' },
  }],
  bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerPan: { type: String },
  customerAddress: { type: String },
  cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['completed', 'refunded', 'cancelled'], default: 'completed' },
  refundRemark: { type: String },
  creditNoteNumber: { type: String },
  creditNoteDate: { type: Date },
  debitNoteNumber: { type: String },
  debitNoteDate: { type: Date },
  invoiceDate: { type: Date },
  notes: { type: String },
  images: [{ type: String }],
  fiscalYear: { type: String },
  fiscalYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear' },
  inclusiveVat: { type: Boolean, default: false },
}, { timestamps: true });

saleSchema.plugin(require('./companyPlugin'));
saleSchema.index({ company: 1, invoiceNumber: 1 }, { unique: true });
module.exports = mongoose.model('Sale', saleSchema);
