const mongoose = require('mongoose');

const fiscalYearSchema = new mongoose.Schema({
  name: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: false },
  isClosed: { type: Boolean, default: false },
}, { timestamps: true });

fiscalYearSchema.plugin(require('./companyPlugin'));
fiscalYearSchema.index({ company: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('FiscalYear', fiscalYearSchema);
