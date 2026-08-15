const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: { type: String, enum: ['sale', 'purchase', 'payment_in', 'payment_out'], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  reference: { type: String },
  amount: { type: Number, default: 0 },
  read: { type: Boolean, default: false },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

notificationSchema.index({ company: 1, createdAt: -1 });
notificationSchema.index({ company: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
