const express = require('express');
const HeldBill = require('../models/HeldBill');
const { protect } = require('../middleware/auth');
const router = express.Router();

function generateBillNo() {
  const num = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  return `HOLD-${num}`;
}

router.get('/', protect, async (req, res) => {
  const items = await HeldBill.find({ ...req.companyFilter }).populate('customer', 'name').populate('createdBy', 'name').sort({ createdAt: -1 });
  res.json(items);
});

router.post('/', protect, async (req, res) => {
  const bill = await HeldBill.create({
    billNumber: generateBillNo(),
    ...req.body,
    createdBy: req.user._id, company: req.companyId,
  });
  const populated = await HeldBill.findOne({ _id: bill._id, ...req.companyFilter }).populate('customer', 'name');
  res.status(201).json(populated);
});

router.get('/:id', protect, async (req, res) => {
  const bill = await HeldBill.findOne({ _id: req.params.id, ...req.companyFilter }).populate('customer', 'name');
  res.json(bill);
});

router.delete('/:id', protect, async (req, res) => {
  await HeldBill.findOneAndDelete({ _id: req.params.id, ...req.companyFilter });
  res.json({ message: 'Deleted' });
});

module.exports = router;
