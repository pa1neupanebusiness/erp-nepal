const express = require('express');
const Company = require('../models/Company');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  if (!req.companyId) return res.status(404).json({ message: 'No company assigned to this account' });
  const company = await Company.findById(req.companyId).select('-__v');
  if (!company) return res.status(404).json({ message: 'No company assigned to this account' });
  res.json(company);
});

router.put('/', protect, async (req, res) => {
  if (!req.companyId) return res.status(404).json({ message: 'No company assigned to this account' });
  const { name, phone, address, pan, regNumber, city, vatRate, salesTaxRate, dateFormat, isTaxConfigured } = req.body;
  const update = { name, phone, address, pan, regNumber, city };
  if (vatRate !== undefined) update.vatRate = vatRate;
  if (salesTaxRate !== undefined) update.salesTaxRate = salesTaxRate;
  if (dateFormat) update.dateFormat = dateFormat;
  if (isTaxConfigured) update.isTaxConfigured = true;
  const company = await Company.findByIdAndUpdate(req.companyId, update, { new: true, runValidators: true }).select('-__v');
  res.json(company);
});

module.exports = router;
