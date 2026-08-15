const express = require('express');
const { protect } = require('../middleware/auth');
const Company = require('../models/Company');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const company = await Company.findById(req.user.company);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    res.json({
      dateFormat: company.dateFormat || 'bs',
      isSetupComplete: company.isSetupComplete || false
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/', protect, async (req, res) => {
  try {
    const { dateFormat, isSetupComplete } = req.body;
    const company = await Company.findById(req.user.company);
    if (!company) return res.status(404).json({ message: 'Company not found' });

    if (dateFormat) company.dateFormat = dateFormat;
    if (isSetupComplete !== undefined) company.isSetupComplete = isSetupComplete;

    await company.save();
    res.json({
      dateFormat: company.dateFormat,
      isSetupComplete: company.isSetupComplete
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
