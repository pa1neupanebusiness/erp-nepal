const express = require('express');
const IrdAuditLog = require('../models/IrdAuditLog');
const { protect, adminOnly } = require('../middleware/auth');
const { logPrint } = require('../utils/daybookService');
const { verifyChain, getClientIp } = require('../utils/irdAudit');
const router = express.Router();

router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const filter = { company: req.companyId };
    if (req.query.actionType) filter.actionType = req.query.actionType;
    if (req.query.moduleName) filter.moduleName = req.query.moduleName;
    if (req.query.documentNumber) filter.documentNumber = { $regex: req.query.documentNumber, $options: 'i' };
    if (req.query.from) filter.actionTimestamp = { $gte: new Date(req.query.from) };
    if (req.query.to) filter.actionTimestamp = { ...filter.actionTimestamp, $lte: new Date(req.query.to) };
    const items = await IrdAuditLog.find(filter).populate('userId', 'name').sort({ actionTimestamp: -1 }).limit(500);
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load audit log', error: err.message });
  }
});

router.get('/verify', protect, adminOnly, async (req, res) => {
  try {
    const result = await verifyChain(req.companyId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Chain verification failed', error: err.message });
  }
});

router.post('/print', protect, async (req, res) => {
  try {
    const { moduleName, documentNumber, copyCount } = req.body;
    const log = await logPrint({
      companyId: req.companyId,
      moduleName: moduleName || 'DAYBOOK',
      documentNumber: documentNumber || '',
      userId: req.user._id,
      userName: req.user.name || '',
      terminalIp: getClientIp(req),
      copyCount: copyCount || 1,
    });
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ message: 'Failed to log print', error: err.message });
  }
});

module.exports = router;
