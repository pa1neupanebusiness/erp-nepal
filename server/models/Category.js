const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  order: { type: Number, default: 0 },
}, { timestamps: true });

categorySchema.plugin(require('./companyPlugin'));
categorySchema.index({ company: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('Category', categorySchema);
