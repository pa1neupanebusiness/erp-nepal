const express = require('express');
const FiscalYear = require('../models/FiscalYear');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const years = await FiscalYear.find({ ...req.companyFilter }).sort({ startDate: -1 });
    res.json(years);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/active', protect, async (req, res) => {
  try {
    let year = await FiscalYear.findOne({ isActive: true, ...req.companyFilter });
    if (!year) {
      year = await FiscalYear.findOne({ ...req.companyFilter }).sort({ startDate: -1 });
    }
    res.json(year);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, startDate, endDate } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Fiscal year name is required' });
    if (!startDate) return res.status(400).json({ message: 'Start date is required' });
    if (!endDate) return res.status(400).json({ message: 'End date is required' });
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime())) return res.status(400).json({ message: 'Invalid start date' });
    if (isNaN(end.getTime())) return res.status(400).json({ message: 'Invalid end date' });
    if (start >= end) return res.status(400).json({ message: 'End date must be after start date' });
    const existing = await FiscalYear.countDocuments(req.companyFilter);
    const year = await FiscalYear.create({
      name: name.trim(), startDate: start, endDate: end,
      isActive: existing === 0,
      company: req.companyId,
    });
    res.status(201).json(year);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const year = await FiscalYear.findOneAndUpdate({ _id: req.params.id, ...req.companyFilter }, req.body, { new: true });
    res.json(year);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id/activate', protect, adminOnly, async (req, res) => {
  try {
    await FiscalYear.updateMany({ ...req.companyFilter }, { isActive: false });
    const year = await FiscalYear.findOneAndUpdate({ _id: req.params.id, ...req.companyFilter }, { isActive: true }, { new: true });
    res.json(year);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await FiscalYear.findOneAndDelete({ _id: req.params.id, ...req.companyFilter });
    res.json({ message: 'Fiscal year deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
