const crypto = require('crypto');
const IrdAuditLog = require('../models/IrdAuditLog');
const { adToBikramSambat } = require('./dateUtils');

const DEFAULT_SYSTEM_KEY = 'ERPNEPAL-1RD-AUDIT-CHAIN-KEY';

function getSystemKey() {
  return process.env.IRD_HASH_SECRET || DEFAULT_SYSTEM_KEY;
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function getMiti(date) {
  return adToBikramSambat(date || new Date());
}

function getClientIp(req) {
  return (req && (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim()) || '';
}

async function getLastAuditHash(companyId) {
  const last = await IrdAuditLog.findOne({ company: companyId }).sort({ _id: -1 }).select('currentHash');
  return last ? last.currentHash : 'GENESIS';
}

function computeHash({ previousHash, payload, timestamp, systemKey }) {
  return sha256(`${previousHash}|${JSON.stringify(payload || {})}|${new Date(timestamp).toISOString()}|${systemKey}`);
}

async function writeAuditLog({
  companyId,
  actionType,
  moduleName,
  recordId,
  documentNumber,
  miti,
  actionTimestamp,
  userId,
  userName,
  terminalIp,
  oldData,
  newData,
  syncStatus,
  errorPayload,
}) {
  const previousHash = await getLastAuditHash(companyId);
  const ts = actionTimestamp || new Date();
  const payload = { actionType, moduleName, recordId, documentNumber, miti, newData, oldData };
  const currentHash = computeHash({ previousHash, payload, timestamp: ts, systemKey: getSystemKey() });

  const log = await IrdAuditLog.create({
    company: companyId,
    actionType,
    moduleName,
    recordId: recordId || '',
    documentNumber: documentNumber || '',
    miti: miti || getMiti(ts),
    actionTimestamp: ts,
    userId: userId || null,
    userName: userName || '',
    terminalIp: terminalIp || '',
    oldDataJson: oldData ?? null,
    newDataJson: newData ?? null,
    previousHash,
    currentHash,
    syncStatus: syncStatus || 'pending',
    errorPayload: errorPayload ?? null,
  });

  return log;
}

async function verifyChain(companyId) {
  const logs = await IrdAuditLog.find({ company: companyId }).sort({ _id: 1 });
  let expected = 'GENESIS';
  const broken = [];
  logs.forEach((log, idx) => {
    const recomputed = computeHash({ previousHash: expected, payload: { actionType: log.actionType, moduleName: log.moduleName, recordId: log.recordId, documentNumber: log.documentNumber, miti: log.miti, newData: log.newDataJson, oldData: log.oldDataJson }, timestamp: log.actionTimestamp, systemKey: getSystemKey() });
    if (log.previousHash !== expected || recomputed !== log.currentHash) {
      broken.push({ index: idx, logId: log._id, documentNumber: log.documentNumber });
    }
    expected = log.currentHash;
  });
  return { valid: broken.length === 0, total: logs.length, broken };
}

module.exports = {
  getSystemKey,
  sha256,
  getMiti,
  getClientIp,
  getLastAuditHash,
  computeHash,
  writeAuditLog,
  verifyChain,
};
