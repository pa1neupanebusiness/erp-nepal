const mongoose = require('mongoose');

const serialTrackingSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  serialNumber: { type: String, required: true },
  imei: { type: String },
  status: { type: String, enum: ['in_stock', 'sold', 'exchanged', 'returned'], default: 'in_stock' },
  condition: { type: String, enum: ['new', 'second_hand'], default: 'new' },
  costPrice: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  reference: { type: String },
  referenceModel: { type: String, enum: ['Emi', 'Sale'] },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  soldDate: { type: Date },
  exchangedToEmi: { type: mongoose.Schema.Types.ObjectId, ref: 'Emi' },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

serialTrackingSchema.plugin(require('./companyPlugin'));
serialTrackingSchema.index({ company: 1, product: 1, serialNumber: 1 }, { unique: true });
serialTrackingSchema.index({ company: 1, serialNumber: 1 });
serialTrackingSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model('SerialTracking', serialTrackingSchema);
