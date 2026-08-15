const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: Date, required: true },
  checkIn: { type: Date },
  checkOut: { type: Date },
  totalHours: { type: Number, min: 0 },
  overtimeHours: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['present', 'absent', 'half-day', 'late', 'on-leave', 'holiday', 'weekoff'], default: 'present' },
  leaveType: { type: String, enum: ['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'casual', 'compensatory', null] },
  checkInMethod: { type: String, enum: ['manual', 'biometric', 'mobile', 'web'], default: 'manual' },
  checkOutMethod: { type: String, enum: ['manual', 'biometric', 'mobile', 'web'], default: 'manual' },
  notes: { type: String },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isApproved: { type: Boolean, default: false },
}, { timestamps: true });

attendanceSchema.index({ company: 1, employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ company: 1, date: 1 });
attendanceSchema.index({ company: 1, employee: 1, status: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
