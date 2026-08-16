const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  costPrice: { type: Number, required: true },
  sellingPrice: { type: Number, default: 0 },
  batch: { type: String },
  expiryDate: { type: Date },
  subtotal: { type: Number, required: true },
});

const purchaseSchema = new mongoose.Schema({
  purchaseNumber: { type: String, required: true },
  type: { type: String, enum: ['direct', 'order', 'receipt'], default: 'direct' },
  date: { type: Date, default: Date.now },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  items: [purchaseItemSchema],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  vatPercent: { type: Number, default: 0 },
  inclusiveVat: { type: Boolean, default: false },
  tax: { type: Number, default: 0 },
  tdsRate: { type: Number, default: 0 },
  tds: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  advanceApplied: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'received', 'cancelled'], default: 'received' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: { type: String },
  paymentMethod: { type: String, enum: ['cash', 'bank', 'split', ''], default: '' },
  paymentSplits: [{
    method: { type: String, enum: ['cash', 'bank'], required: true },
    amount: { type: Number, required: true },
    bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank' },
  }],
  bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank' },
  chequeNumber: { type: String, default: '' },
  paymentRemarks: { type: String, default: '' },
  supplierInvoiceNo: { type: String, default: '' },
  returns: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 0 },
    reason: { type: String },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now },
  }],
  fiscalYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear' },
  returnRemark: { type: String },
  creditNoteNumber: { type: String },
  creditNoteDate: { type: Date },
  extraCharge: {
    remarks: { type: String, default: '' },
    amount: { type: Number, default: 0 },
  },
}, { timestamps: true });

purchaseSchema.plugin(require('./companyPlugin'));
purchaseSchema.index({ company: 1, purchaseNumber: 1 }, { unique: true });
module.exports = mongoose.model('Purchase', purchaseSchema);
