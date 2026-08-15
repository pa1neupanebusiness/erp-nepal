const express = require('express');
const RefundRequest = require('../models/RefundRequest');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

router.post('/', protect, async (req, res) => {
  const { saleId, reason } = req.body;
  if (!saleId || !reason?.trim()) return res.status(400).json({ message: 'Sale ID and reason are required' });
  const sale = await Sale.findOne({ _id: saleId, ...req.companyFilter });
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  if (sale.status === 'refunded') return res.status(400).json({ message: 'Sale already refunded' });
  const existing = await RefundRequest.findOne({ sale: saleId, status: 'pending', ...req.companyFilter });
  if (existing) return res.status(400).json({ message: 'A pending refund request already exists for this sale' });
  const request = await RefundRequest.create({
    sale: saleId, invoiceNumber: sale.invoiceNumber, reason, requestedBy: req.user._id, company: req.companyId,
  });
  res.status(201).json(request);
});

router.get('/', protect, async (req, res) => {
  const filter = { ...req.companyFilter };
  if (req.query.status) filter.status = req.query.status;
  const items = await RefundRequest.find(filter)
    .populate('sale', 'invoiceNumber grandTotal paymentMethod')
    .populate('requestedBy', 'name')
    .populate('approvedBy', 'name')
    .sort({ createdAt: -1 });
  res.json(items);
});

router.put('/:id/approve', protect, adminOnly, async (req, res) => {
  const { adminRemark } = req.body;
  const request = await RefundRequest.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!request) return res.status(404).json({ message: 'Request not found' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });
  const sale = await Sale.findOne({ _id: request.sale, ...req.companyFilter });
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  sale.status = 'refunded';
  await sale.save();
  for (const item of sale.items) {
    const product = await Product.findOne({ _id: item.product, ...req.companyFilter });
    if (product) { product.stock += item.quantity; await product.save(); }
  }
  request.status = 'approved';
  request.approvedBy = req.user._id;
  request.approvedAt = new Date();
  if (adminRemark) request.adminRemark = adminRemark;
  await request.save();
  res.json(request);
});

router.put('/:id/reject', protect, adminOnly, async (req, res) => {
  const { adminRemark } = req.body;
  if (!adminRemark?.trim()) return res.status(400).json({ message: 'Rejection reason is required' });
  const request = await RefundRequest.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!request) return res.status(404).json({ message: 'Request not found' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });
  request.status = 'rejected';
  request.approvedBy = req.user._id;
  request.approvedAt = new Date();
  request.adminRemark = adminRemark;
  await request.save();
  res.json(request);
});

module.exports = router;
