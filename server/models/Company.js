const mongoose = require('mongoose');

const MODULE_OPTIONS = ['pos', 'sales', 'emi', 'purchase', 'accounts', 'reports', 'hr', 'settings', 'tracking'];
const DEFAULT_MODULES = ['sales', 'emi', 'purchase', 'accounts', 'reports', 'settings'];

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  shortName: { type: String, sparse: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  address: { type: String },
  pan: { type: String },
  regNumber: { type: String },
  city: { type: String },
  country: { type: String, default: 'nepal' },
  currency: { type: String, default: 'NPR' },
  currencySymbol: { type: String, default: 'रू' },
  vatRate: { type: Number, default: 13 },
  salesTaxRate: { type: Number, default: 0 },
  taxYear: { type: String, default: 'Mid-July to Mid-July (BS)' },
  fiscalYearStart: { type: String },
  invoiceCounter: { type: Number, default: 0 },
  emiCounter: { type: Number, default: 0 },
  purchaseCounter: { type: Number, default: 0 },
  voucherCounter: { type: Number, default: 0 },
  receiptCounter: { type: Number, default: 0 },
  paymentOutCounter: { type: Number, default: 0 },
  creditNoteCounter: { type: Number, default: 0 },
  debitNoteCounter: { type: Number, default: 0 },
  trackingCounter: { type: Number, default: 0 },
  subscription: { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
  selectedModule: { type: String, enum: ['inventory', 'accounts', null], default: null, sparse: true },
  dateFormat: { type: String, enum: ['bs', 'ad'], default: 'bs' },
  isSetupComplete: { type: Boolean, default: false },
  isTaxConfigured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  enabledModules: { type: [String], enum: MODULE_OPTIONS, default: DEFAULT_MODULES },
  chatbotEnabled: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
module.exports.MODULE_OPTIONS = MODULE_OPTIONS;
module.exports.DEFAULT_MODULES = DEFAULT_MODULES;
