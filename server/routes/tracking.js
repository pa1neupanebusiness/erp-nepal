const express = require('express');
const OrderTracking = require('../models/OrderTracking');
const Sale = require('../models/Sale');
const { protect, adminOnly, requireTrackingModule } = require('../middleware/auth');
const router = express.Router();

router.use(protect, requireTrackingModule);

router.get('/company-stats', async (req, res) => {
  const stats = await OrderTracking.aggregate([
    { $match: { company: req.companyId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const result = {};
  stats.forEach(s => { result[s._id] = s.count; });
  result.total = stats.reduce((sum, s) => sum + s.count, 0);
  res.json(result);
});

router.get('/', async (req, res) => {
  const { status, search } = req.query;
  const filter = { company: req.companyId };
  if (status) filter.status = status;
  if (search) filter.orderNumber = { $regex: search, $options: 'i' };
  const items = await OrderTracking.find(filter)
    .populate('customer', 'name phone')
    .sort({ updatedAt: -1 })
    .limit(200);
  res.json(items);
});

router.post('/', adminOnly, async (req, res) => {
  const { orderId, carrier, trackingNumber, estimatedDelivery, note } = req.body;
  if (!orderId) return res.status(400).json({ message: 'orderId is required' });
  const existing = await OrderTracking.findOne({ orderId, company: req.companyId });
  if (existing) return res.status(400).json({ message: 'Tracking already exists for this order' });
  const sale = await Sale.findOne({ _id: orderId, ...req.companyFilter }).populate('customer', 'name');
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  const tracking = await OrderTracking.create({
    orderId: sale._id,
    orderNumber: sale.invoiceNumber,
    customer: sale.customer?._id,
    customerName: sale.customer?.name || '',
    status: 'pending',
    carrier: carrier || '',
    trackingNumber: trackingNumber || '',
    estimatedDelivery: estimatedDelivery || undefined,
    company: req.companyId,
    events: [{ status: 'pending', note: note || 'Order tracking created', updatedBy: req.user._id }],
  });
  res.status(201).json(tracking);
});

router.get('/:orderId', async (req, res) => {
  const item = await OrderTracking.findOne({ orderId: req.params.orderId, company: req.companyId })
    .populate('customer', 'name phone address')
    .populate('events.updatedBy', 'name');
  if (!item) return res.status(404).json({ message: 'No tracking record found' });
  res.json(item);
});

router.put('/:orderId/status', adminOnly, async (req, res) => {
  const { status, location, note, carrier, trackingNumber, estimatedDelivery } = req.body;
  const item = await OrderTracking.findOne({ orderId: req.params.orderId, company: req.companyId });
  if (!item) return res.status(404).json({ message: 'No tracking record found' });
  if (status) {
    const valid = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'returned'];
    if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status' });
    item.status = status;
    item.events.push({ status, location: location || '', note: note || `Status updated to ${status}`, updatedBy: req.user._id });
  }
  if (carrier !== undefined) item.carrier = carrier;
  if (trackingNumber !== undefined) item.trackingNumber = trackingNumber;
  if (estimatedDelivery !== undefined) item.estimatedDelivery = estimatedDelivery;
  await item.save();
  res.json(item);
});

module.exports = router;
