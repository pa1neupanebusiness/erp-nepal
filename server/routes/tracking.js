const express = require('express');
const OrderTracking = require('../models/OrderTracking');
const Branch = require('../models/Branch');
const Sale = require('../models/Sale');
const { protect, adminOnly, requireTrackingModule } = require('../middleware/auth');
const router = express.Router();

const VALID_STATUSES = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'returned'];

function isDriver(user) {
  return user && Array.isArray(user.groups) && user.groups.includes('driver');
}
function isBranchStaff(user) {
  return user && Array.isArray(user.groups) && user.groups.includes('branch');
}

router.get('/company-stats', protect, requireTrackingModule, async (req, res) => {
  const stats = await OrderTracking.aggregate([
    { $match: { company: req.companyId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const result = {};
  stats.forEach(s => { result[s._id] = s.count; });
  result.total = stats.reduce((sum, s) => sum + s.count, 0);
  res.json(result);
});

router.get('/driver-orders', protect, requireTrackingModule, async (req, res) => {
  if (!isDriver(req.user) && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Driver access required' });
  }
  const filter = { company: req.companyId, driver: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const items = await OrderTracking.find(filter)
    .populate('customer', 'name phone')
    .populate('branch', 'name address phone')
    .sort({ updatedAt: -1 });
  res.json(items);
});

router.get('/branch-orders', protect, requireTrackingModule, async (req, res) => {
  if (!isBranchStaff(req.user) && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Branch access required' });
  }
  const filter = { company: req.companyId, branch: req.user.branch };
  if (req.query.status) filter.status = req.query.status;
  const items = await OrderTracking.find(filter)
    .populate('driver', 'name')
    .populate('customer', 'name phone')
    .sort({ updatedAt: -1 });
  res.json(items);
});

router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const item = await OrderTracking.findOne({ trackingNumber: req.params.trackingNumber })
      .populate('customer', 'name phone address')
      .populate('branch', 'name address phone')
      .populate('driver', 'name phone')
      .populate('events.updatedBy', 'name');
    if (!item) return res.status(404).json({ message: 'No tracking record found for this number' });
    res.json({
      orderNumber: item.orderNumber,
      status: item.status,
      carrier: item.carrier,
      trackingNumber: item.trackingNumber,
      estimatedDelivery: item.estimatedDelivery,
      currentLocation: item.currentLocation,
      branch: item.branch ? { name: item.branch.name, address: item.branch.address, phone: item.branch.phone } : null,
      driver: item.driver ? { name: item.driver.name } : null,
      events: item.events.map(e => ({
        status: e.status,
        location: e.location,
        note: e.note,
        timestamp: e.timestamp,
        updatedBy: e.updatedBy?.name || '',
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  } catch (_) {
    res.status(500).json({ message: 'Failed to fetch tracking info' });
  }
});

router.get('/', protect, requireTrackingModule, async (req, res) => {
  const { status, search } = req.query;
  const filter = { company: req.companyId };
  if (status) filter.status = status;
  if (search) filter.orderNumber = { $regex: search, $options: 'i' };
  const items = await OrderTracking.find(filter)
    .populate('customer', 'name phone')
    .populate('branch', 'name')
    .populate('driver', 'name')
    .sort({ updatedAt: -1 })
    .limit(200);
  res.json(items);
});

router.post('/', protect, adminOnly, requireTrackingModule, async (req, res) => {
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
    events: [{ status: 'pending', note: note || 'Order tracking created', updatedBy: req.user._id, updatedByRole: req.user.role }],
  });
  res.status(201).json(tracking);
});

router.get('/:orderId', protect, requireTrackingModule, async (req, res) => {
  const item = await OrderTracking.findOne({ orderId: req.params.orderId, company: req.companyId })
    .populate('customer', 'name phone address')
    .populate('branch', 'name address phone')
    .populate('driver', 'name phone')
    .populate('events.updatedBy', 'name');
  if (!item) return res.status(404).json({ message: 'No tracking record found' });
  res.json(item);
});

router.put('/:orderId/assign', protect, adminOnly, requireTrackingModule, async (req, res) => {
  const { branchId, driverId } = req.body;
  const item = await OrderTracking.findOne({ orderId: req.params.orderId, company: req.companyId });
  if (!item) return res.status(404).json({ message: 'No tracking record found' });
  if (branchId !== undefined) {
    if (branchId === null) {
      item.branch = null;
    } else {
      const branch = await Branch.findOne({ _id: branchId, company: req.companyId });
      if (!branch) return res.status(404).json({ message: 'Branch not found' });
      item.branch = branch._id;
    }
  }
  if (driverId !== undefined) {
    item.driver = driverId === null ? null : driverId;
  }
  const assignNote = [];
  if (branchId !== undefined) assignNote.push(`Branch ${branchId ? 'assigned' : 'removed'}`);
  if (driverId !== undefined) assignNote.push(`Driver ${driverId ? 'assigned' : 'removed'}`);
  if (assignNote.length) {
    item.events.push({ status: item.status, note: assignNote.join(', '), updatedBy: req.user._id, updatedByRole: req.user.role });
  }
  await item.save();
  const populated = await OrderTracking.findById(item._id)
    .populate('branch', 'name address phone')
    .populate('driver', 'name phone');
  res.json(populated);
});

router.put('/:orderId/status', protect, requireTrackingModule, async (req, res) => {
  const { status, location, note, carrier, trackingNumber, estimatedDelivery } = req.body;
  const item = await OrderTracking.findOne({ orderId: req.params.orderId, company: req.companyId });
  if (!item) return res.status(404).json({ message: 'No tracking record found' });

  const isOwner = item.driver && item.driver.toString() === req.user._id.toString();
  const isBranchMember = item.branch && req.user.branch && item.branch.toString() === req.user.branch.toString();
  const isAllowedAdmin = req.user.role === 'super_admin' || req.user.role === 'admin' || req.user.role === 'hr';
  if (!isOwner && !isBranchMember && !isAllowedAdmin) {
    return res.status(403).json({ message: 'Not authorized to update this order' });
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
    item.status = status;
    const roleLabel = isOwner ? 'Driver' : isBranchMember ? 'Branch' : 'Admin';
    item.events.push({
      status, location: location || '',
      note: note || `Status updated to ${status} by ${roleLabel}`,
      updatedBy: req.user._id, updatedByRole: roleLabel.toLowerCase(),
    });
    if (location) item.currentLocation = location;
    if (trackingNumber) item.trackingNumber = trackingNumber;
  }
  if (carrier !== undefined) item.carrier = carrier;
  if (trackingNumber !== undefined) item.trackingNumber = trackingNumber;
  if (estimatedDelivery !== undefined) item.estimatedDelivery = estimatedDelivery;
  if (location && !status) item.currentLocation = location;
  await item.save();
  res.json(item);
});

module.exports = router;
