const mongoose = require('mongoose');

const salarySchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  payPeriod: { type: String, enum: ['monthly', 'bi-weekly', 'weekly', 'hourly'], default: 'monthly' },
  payDate: { type: Date },
  basicSalary: { type: Number, default: 0 },
  housingAllowance: { type: Number, default: 0 },
  transportAllowance: { type: Number, default: 0 },
  mealAllowance: { type: Number, default: 0 },
  communicationAllowance: { type: Number, default: 0 },
  otherAllowances: [{
    name: { type: String },
    amount: { type: Number },
  }],
  overtimeHours: { type: Number, default: 0 },
  overtimeRate: { type: Number, default: 0 },
  overtimePay: { type: Number, default: 0 },
  grossSalary: { type: Number, default: 0 },
  deductions: [{
    type: { type: String, enum: ['provident-fund', 'insurance', 'tax', 'loan', 'advance', 'absence', 'other'] },
    name: { type: String },
    amount: { type: Number },
    reason: { type: String },
  }],
  totalDeductions: { type: Number, default: 0 },
  netSalary: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  providentFund: { type: Number, default: 0 },
  insuranceAmount: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  arrears: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'pending', 'approved', 'paid', 'cancelled'], default: 'draft' },
  payslipUrl: { type: String },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidAt: { type: Date },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },
}, { timestamps: true });

salarySchema.index({ company: 1, employee: 1, payDate: 1 });
salarySchema.index({ company: 1, status: 1 });

module.exports = mongoose.model('Salary', salarySchema);
