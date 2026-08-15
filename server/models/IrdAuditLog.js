const mongoose = require('mongoose');

const irdAuditLogSchema = new mongoose.Schema({
  actionType: { type: String, enum: ['INSERT', 'CANCEL', 'PRINT', 'API_SYNC_FAIL', 'LOGIN'], required: true },
  moduleName: { type: String, required: true },
  recordId: { type: String, default: '' },
  documentNumber: { type: String, default: '' },
  miti: { type: String, default: '' },
  actionTimestamp: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String, default: '' },
  terminalIp: { type: String, default: '' },
  oldDataJson: { type: mongoose.Schema.Types.Mixed, default: null },
  newDataJson: { type: mongoose.Schema.Types.Mixed, default: null },
  previousHash: { type: String, default: '' },
  currentHash: { type: String, default: '' },
  syncStatus: { type: String, enum: ['synchronized', 'pending', 'failed'], default: 'pending' },
  errorPayload: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

irdAuditLogSchema.index({ company: 1, actionTimestamp: -1 });
irdAuditLogSchema.index({ company: 1, documentNumber: 1 });
irdAuditLogSchema.index({ company: 1, actionType: 1 });

irdAuditLogSchema.plugin(require('./companyPlugin'));
module.exports = mongoose.model('IrdAuditLog', irdAuditLogSchema);
