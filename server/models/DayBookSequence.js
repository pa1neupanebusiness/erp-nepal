const mongoose = require('mongoose');

const dayBookSequenceSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  year: { type: Number, required: true },
  seq: { type: Number, default: 0 },
});

dayBookSequenceSchema.index({ company: 1, year: 1 }, { unique: true });
module.exports = mongoose.model('DayBookSequence', dayBookSequenceSchema);
