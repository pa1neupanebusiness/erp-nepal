const express = require('express');
const DayBookClosure = require('../models/DayBookClosure');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  const closures = await DayBookClosure.find({ ...req.companyFilter }).sort({ closedDate: -1 });
  res.json(closures);
});

router.post('/', protect, adminOnly, async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ message: 'Date is required' });
  const closedDate = new Date(date);
  closedDate.setHours(0, 0, 0, 0);
  const existing = await DayBookClosure.findOne({ company: req.companyId, closedDate });
  if (existing) return res.status(400).json({ message: 'Daybook already closed for this date' });
  const closure = await DayBookClosure.create({ company: req.companyId, closedDate, closedBy: req.user._id });
  res.status(201).json(closure);
});

router.delete('/:date', protect, adminOnly, async (req, res) => {
  const closedDate = new Date(req.params.date);
  closedDate.setHours(0, 0, 0, 0);
  const closure = await DayBookClosure.findOneAndDelete({ company: req.companyId, closedDate });
  if (!closure) return res.status(404).json({ message: 'No closure found for this date' });
  res.json({ message: 'Daybook reopened' });
});

module.exports = router;
