const mongoose = require('mongoose');
const companyPlugin = require('./companyPlugin');

const dayBookClosureSchema = new mongoose.Schema({
  closedDate: { type: Date, required: true },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: { type: Date, default: Date.now },
});

dayBookClosureSchema.plugin(companyPlugin);
dayBookClosureSchema.index({ company: 1, closedDate: 1 }, { unique: true });

module.exports = mongoose.model('DayBookClosure', dayBookClosureSchema);
