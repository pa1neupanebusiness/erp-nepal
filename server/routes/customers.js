const express = require('express');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const Emi = require('../models/Emi');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  const items = await Customer.find({ ...req.companyFilter }).sort({ name: 1 });
  res.json(items);
});

router.get('/:id/transactions', protect, async (req, res) => {
  const [sales, emis] = await Promise.all([
    Sale.find({ customer: req.params.id, ...req.companyFilter }).populate('customer').sort({ createdAt: -1 }),
    Emi.find({ customer: req.params.id, ...req.companyFilter }).sort({ createdAt: -1 }),
  ]);
  res.json({ sales, emis });
});

router.post('/', protect, async (req, res) => {
  const item = await Customer.create({ ...req.body, company: req.companyId });
  res.status(201).json(item);
});

router.put('/:id', protect, async (req, res) => {
  const item = await Customer.findOneAndUpdate({ _id: req.params.id, ...req.companyFilter }, req.body, { new: true });
  res.json(item);
});

router.delete('/:id', protect, async (req, res) => {
  await Customer.findOneAndDelete({ _id: req.params.id, ...req.companyFilter });
  res.json({ message: 'Deleted' });
});

module.exports = router;
