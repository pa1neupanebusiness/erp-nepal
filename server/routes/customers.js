const express = require('express');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const Emi = require('../models/Emi');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  const items = await Customer.find({ ...req.companyFilter }).sort({ name: 1 });
  const customerIds = items.map(c => c._id);
  const [salesAgg, emiAgg] = await Promise.all([
    Sale.aggregate([
      { $match: { customer: { $in: customerIds }, status: { $ne: 'refunded' }, company: req.companyId } },
      { $group: { _id: '$customer', totalDue: { $sum: '$dueAmount' }, totalGrand: { $sum: '$grandTotal' }, totalPaid: { $sum: '$amountPaid' }, count: { $sum: 1 } } }
    ]),
    Emi.aggregate([
      { $match: { customer: { $in: customerIds }, company: req.companyId, paidStatus: { $ne: 'paid' } } },
      { $group: { _id: '$customer', totalDue: { $sum: '$remainingAmount' }, count: { $sum: 1 } } }
    ])
  ]);
  const salesMap = {};
  salesAgg.forEach(a => { salesMap[String(a._id)] = a; });
  const emiMap = {};
  emiAgg.forEach(a => { emiMap[String(a._id)] = a; });
  const result = items.map(c => {
    const sid = String(c._id);
    const saleInfo = salesMap[sid] || { totalDue: 0, count: 0 };
    const emiInfo = emiMap[sid] || { totalDue: 0, count: 0 };
    const totalDue = (saleInfo.totalDue || 0) + (emiInfo.totalDue || 0);
    return { ...c.toObject(), totalDue, salesCount: saleInfo.count || 0, emiCount: emiInfo.count || 0 };
  });
  res.json(result);
});

router.get('/:id/transactions', protect, async (req, res) => {
  const [sales, emis, customer] = await Promise.all([
    Sale.find({ customer: req.params.id, ...req.companyFilter }).populate('customer').sort({ createdAt: -1 }),
    Emi.find({ customer: req.params.id, ...req.companyFilter }).sort({ createdAt: -1 }),
    Customer.findOne({ _id: req.params.id, ...req.companyFilter }),
  ]);
  const totalSalesDue = sales.filter(s => s.status !== 'refunded').reduce((s, sale) => s + (sale.dueAmount || 0), 0);
  const totalEmiDue = emis.filter(e => e.paidStatus !== 'paid').reduce((s, e) => s + (e.remainingAmount || 0), 0);
  res.json({ sales, emis, totalDue: totalSalesDue + totalEmiDue, customer });
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
