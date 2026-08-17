const mongoose = require('mongoose');
const companyPlugin = require('./companyPlugin');

const courierOrderSchema = new mongoose.Schema({
  trackingNumber: { type: String, required: true },
  sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
  tracking: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderTracking', required: true },
  sender: {
    name: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  receiver: {
    name: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  instructions: { type: String, default: '' },
  deliveryLocation: { type: String, default: '' },
  deliveryType: { type: String, enum: ['national', 'international'], default: 'national' },
  destinationBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  estimatedDelivery: { type: Date },
  weight: { type: Number, default: 0 },
  unit: { type: String, enum: ['pcs', 'kg', 'box', 'dozen', 'quintal'], default: 'pcs' },
  quantity: { type: Number, default: 1 },
  ratePerUnit: { type: Number, default: 0 },
  price: { type: Number, required: true },
  vatRate: { type: Number, default: 0 },
  vatAmount: { type: Number, default: 0 },
  inclusiveVat: { type: Boolean, default: false },
  paymentMethod: { type: String, enum: ['cash', 'qr'], default: 'cash' },
  bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank', default: null },
  remarks: { type: String, default: '' },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
}, { timestamps: true });

courierOrderSchema.plugin(companyPlugin);
courierOrderSchema.index({ company: 1, trackingNumber: 1 }, { unique: true });
courierOrderSchema.index({ company: 1, sale: 1 });

module.exports = mongoose.model('CourierOrder', courierOrderSchema);
