const express = require('express');
const router = express.Router();
const { protect, superAdminOnly } = require('../middleware/auth');
const { backupCompany, listBackups, backupAllCompanies } = require('../utils/backupService');

router.post('/company/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const result = await backupCompany(req.params.id);
    res.json({ message: 'Backup created', ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/company/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const backups = await listBackups(req.params.id);
    res.json(backups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/all', protect, superAdminOnly, async (req, res) => {
  try {
    const results = await backupAllCompanies();
    res.json({ message: 'Backup complete', results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
