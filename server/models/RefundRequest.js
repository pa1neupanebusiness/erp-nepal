const mongoose = require('mongoose');

const refundRequestSchema = new mongoose.Schema({
  sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
  invoiceNumber: { type: String, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  adminRemark: { type: String },
}, { timestamps: true });

refundRequestSchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('RefundRequest', refundRequestSchema);
