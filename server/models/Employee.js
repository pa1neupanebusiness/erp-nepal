const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  employeeId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other', 'prefer-not-to-say'] },
  nationality: { type: String },
  address: { type: String },
  city: { type: String },
  country: { type: String, default: 'nepal' },
  nationalId: { type: String },
  taxId: { type: String },
  bankName: { type: String },
  bankAccountNumber: { type: String },
  bankBranch: { type: String },
  hireDate: { type: Date, required: true },
  department: { type: String },
  designation: { type: String },
  role: { type: String },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employmentType: { type: String, enum: ['full-time', 'part-time', 'contract', 'temporary', 'intern'], default: 'full-time' },
  workLocation: { type: String },
  shift: { type: String },
  workingHoursPerWeek: { type: Number, default: 40 },
  status: { type: String, enum: ['active', 'inactive', 'terminated', 'resigned', 'on-leave', 'suspended'], default: 'active' },
  probationStartDate: { type: Date },
  probationEndDate: { type: Date },
  isProbation: { type: Boolean, default: false },
  terminationDate: { type: Date },
  terminationReason: { type: String },
  terminationType: { type: String, enum: ['voluntary', 'involuntary', 'retirement', 'contract-end'] },
  lastWorkingDate: { type: Date },
  emergencyContactName: { type: String },
  emergencyContactPhone: { type: String },
  emergencyContactRelation: { type: String },
  documents: [{
    type: { type: String, enum: ['id-proof', 'address-proof', 'education', 'experience', 'bank-details', 'photo', 'contract', 'other'] },
    name: { type: String },
    url: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  }],
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

employeeSchema.index({ company: 1, employeeId: 1 }, { unique: true });
employeeSchema.index({ company: 1, status: 1 });
employeeSchema.index({ company: 1, department: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
