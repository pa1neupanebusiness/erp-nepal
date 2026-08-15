const mongoose = require('mongoose');

module.exports = function companyPlugin(schema) {
  schema.add({ company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' } });
  schema.index({ company: 1 });
};
