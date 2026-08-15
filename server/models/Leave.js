const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  leaveType: { type: String, enum: ['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'casual', 'compensatory', 'bereavement', 'study', 'volunteer'], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  totalDays: { type: Number, min: 0 },
  halfDayStart: { type: Boolean, default: false },
  halfDayEnd: { type: Boolean, default: false },
  reason: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedReason: { type: String },
  documents: [{
    name: { type: String },
    url: { type: String },
  }],
  carryForwardFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Leave' },
  isPaid: { type: Boolean, default: true },
  notes: { type: String },
}, { timestamps: true });

leaveSchema.index({ company: 1, employee: 1, startDate: 1 });
leaveSchema.index({ company: 1, status: 1 });
leaveSchema.index({ company: 1, employee: 1, leaveType: 1 });

module.exports = mongoose.model('Leave', leaveSchema);
