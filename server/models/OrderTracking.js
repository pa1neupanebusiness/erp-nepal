const mongoose = require('mongoose');
const companyPlugin = require('./companyPlugin');

const trackingEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  location: { type: String, default: '' },
  note: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedByRole: { type: String, default: '' },
}, { _id: false });

const orderTrackingSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
  orderNumber: { type: String, required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, default: '' },
  senderName: { type: String, default: '' },
  senderPhone: { type: String, default: '' },
  senderAddress: { type: String, default: '' },
  receiverName: { type: String, default: '' },
  receiverPhone: { type: String, default: '' },
  receiverAddress: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'returned'],
    default: 'pending',
  },
  carrier: { type: String, enum: ['fedex', 'dhl', 'pathao', 'custom', ''], default: '' },
  trackingNumber: { type: String, default: '' },
  estimatedDelivery: { type: Date },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  sourceBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  currentLocation: { type: String, default: '' },
  events: [trackingEventSchema],
}, { timestamps: true });

orderTrackingSchema.plugin(companyPlugin);
orderTrackingSchema.index({ company: 1, orderId: 1 });
orderTrackingSchema.index({ company: 1, status: 1 });
orderTrackingSchema.index({ company: 1, trackingNumber: 1 });
orderTrackingSchema.index({ company: 1, driver: 1 });
orderTrackingSchema.index({ company: 1, branch: 1 });
orderTrackingSchema.index({ company: 1, sourceBranch: 1 });

module.exports = mongoose.model('OrderTracking', orderTrackingSchema);
