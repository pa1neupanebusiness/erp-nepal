const express = require('express');
const router = express.Router();
const { protect, superAdminOnly } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const { backupCompany, listBackups, backupAllCompanies, restoreFromBackup } = require('../utils/backupService');

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

router.get('/company/:id/download', protect, superAdminOnly, async (req, res) => {
  try {
    const backups = await listBackups(req.params.id);
    if (!backups.length) return res.status(404).json({ message: 'No backups found' });

    const latest = backups[0];
    const Company = require('../models/Company');
    const company = await Company.findById(req.params.id).lean();
    if (!company) return res.status(404).json({ message: 'Company not found' });

    const safeName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
    const filePath = path.join(__dirname, '..', '..', 'backups', safeName, latest.name, 'data.json');

    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Backup file not found' });

    res.setHeader('Content-Disposition', `attachment; filename="${latest.name}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/company/:id/restore', protect, superAdminOnly, async (req, res) => {
  try {
    const { backupData } = req.body;
    if (!backupData) return res.status(400).json({ message: 'No backup data provided' });

    const result = await restoreFromBackup(req.params.id, backupData);
    res.json(result);
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
