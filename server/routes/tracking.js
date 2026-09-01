const express = require('express');
const OrderTracking = require('../models/OrderTracking');
const Company = require('../models/Company');
const Branch = require('../models/Branch');
const Sale = require('../models/Sale');
const { protect, adminOnly, requireTrackingModule } = require('../middleware/auth');
const router = express.Router();

const VALID_STATUSES = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'returned'];
const STATUS_ORDER = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered'];

function isValidTransition(currentStatus, newStatus) {
  if (newStatus === 'returned') return true;
  const curIdx = STATUS_ORDER.indexOf(currentStatus);
  const newIdx = STATUS_ORDER.indexOf(newStatus);
  if (curIdx === -1 || newIdx === -1) return false;
  return newIdx === curIdx + 1;
}

function nextAllowedStatus(currentStatus) {
  const idx = STATUS_ORDER.indexOf(currentStatus);
  if (idx === -1 || idx >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}

function isDriver(user) {
  return user && Array.isArray(user.groups) && user.groups.includes('driver');
}
function isBranchStaff(user) {
  return user && Array.isArray(user.groups) && user.groups.includes('branch');
}

router.get('/available-sales', protect, adminOnly, requireTrackingModule, async (req, res) => {
  const trackedOrderIds = await OrderTracking.find({ company: req.companyId }).distinct('orderId');
  const sales = await Sale.find({ ...req.companyFilter, _id: { $nin: trackedOrderIds } })
    .populate('customer', 'name phone address')
    .sort({ createdAt: -1 })
    .limit(100)
    .select('invoiceNumber customer grandTotal date items');
  res.json(sales);
});

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
  const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';
  const filter = { company: req.companyId };
  if (!isAdmin) filter.driver = req.user._id;
  if (req.query.status) filter.status = req.query.status;
  const items = await OrderTracking.find(filter)
    .populate('customer', 'name phone')
    .populate('branch', 'name address phone')
    .populate('driver', 'name phone')
    .sort({ updatedAt: -1 });
  res.json(items);
});

router.get('/branch-orders', protect, requireTrackingModule, async (req, res) => {
  try {
    if (!isBranchStaff(req.user) && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Branch access required' });
    }
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';
    const filter = { company: req.companyId };

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const dateRange = {};
    if (from && !isNaN(from)) dateRange.$gte = new Date(from.setHours(0, 0, 0, 0));
    if (to && !isNaN(to)) dateRange.$lte = new Date(to.setHours(23, 59, 59, 999));
    if (dateRange.$gte || dateRange.$lte) filter.createdAt = dateRange;

    const branchParams = [];
    if (req.query.branchId) {
      branchParams.push({ sourceBranch: req.query.branchId }, { branch: req.query.branchId });
    } else if (isAdmin) {
      branchParams.push({ sourceBranch: { $exists: true, $ne: null } }, { branch: { $exists: true, $ne: null } });
    } else if (req.user.branch) {
      branchParams.push({ sourceBranch: req.user.branch }, { branch: req.user.branch });
    }

    const baseFilter = { ...filter };
    let items = [];
    if (branchParams.length) {
      baseFilter.$or = branchParams;
    }
    if (req.query.status) baseFilter.status = req.query.status;
    items = await OrderTracking.find(baseFilter)
      .populate('driver', 'name phone')
      .populate('customer', 'name phone')
      .populate('branch', 'name address phone')
      .populate('sourceBranch', 'name address phone')
      .sort({ updatedAt: -1 });

    const result = items.map(o => ({
      ...o.toObject(),
      direction: o.sourceBranch && o.branch && o.sourceBranch.toString() === o.branch.toString()
        ? 'internal'
        : (o.sourceBranch ? 'sent' : 'received'),
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load branch orders: ' + err.message });
  }
});

router.get('/branch-stats', protect, requireTrackingModule, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const dateRange = {};
    if (from && !isNaN(from)) dateRange.$gte = new Date(from.setHours(0, 0, 0, 0));
    if (to && !isNaN(to)) dateRange.$lte = new Date(to.setHours(23, 59, 59, 999));

    const branches = await Branch.find({ company: req.companyId }).select('name address phone');
    const orderFilter = { company: req.companyId };
    if (dateRange.$gte || dateRange.$lte) orderFilter.createdAt = dateRange;
    const allOrders = await OrderTracking.find(orderFilter)
      .populate('branch', 'name')
      .populate('sourceBranch', 'name');

    const branchMap = {};
    for (const b of branches) {
      branchMap[b._id.toString()] = {
        _id: b._id, name: b.name, address: b.address, phone: b.phone,
        total: 0, sent: 0, received: 0,
        pending: 0, processing: 0, shipped: 0, out_for_delivery: 0, delivered: 0, returned: 0,
      };
    }

    for (const o of allOrders) {
      const srcId = o.sourceBranch?._id?.toString();
      const dstId = o.branch?._id?.toString();

      if (srcId && branchMap[srcId]) {
        branchMap[srcId].total++;
        branchMap[srcId].sent++;
        if (branchMap[srcId][o.status] !== undefined) branchMap[srcId][o.status]++;
      }
      if (dstId && branchMap[dstId] && dstId !== srcId) {
        branchMap[dstId].total++;
        branchMap[dstId].received++;
        if (branchMap[dstId][o.status] !== undefined) branchMap[dstId][o.status]++;
      }
    }

    const stats = Object.values(branchMap).sort((a, b) => b.total - a.total);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load branch stats: ' + err.message });
  }
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
  const { orderId, carrier, estimatedDelivery, note } = req.body;
  if (!orderId) return res.status(400).json({ message: 'orderId is required' });
  const existing = await OrderTracking.findOne({ orderId, company: req.companyId });
  if (existing) return res.status(400).json({ message: 'Tracking already exists for this order' });
  const sale = await Sale.findOne({ _id: orderId, ...req.companyFilter }).populate('customer', 'name phone address');
  if (!sale) return res.status(404).json({ message: 'Sale not found' });

  const company = await Company.findById(req.companyId);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  company.trackingCounter = (company.trackingCounter || 0) + 1;
  await company.save();
  const seq = String(company.trackingCounter).padStart(5, '0');
  const trackingNumber = `TRK-${seq}`;

  const tracking = await OrderTracking.create({
    orderId: sale._id,
    orderNumber: sale.invoiceNumber,
    customer: sale.customer?._id,
    customerName: sale.customer?.name || '',
    senderName: company.name || '',
    senderPhone: company.phone || '',
    senderAddress: company.address || '',
    receiverName: sale.customer?.name || '',
    receiverPhone: sale.customer?.phone || '',
    receiverAddress: sale.customer?.address || '',
    status: 'pending',
    carrier: carrier || '',
    trackingNumber,
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
    .populate('sourceBranch', 'name address phone')
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
    if (!isValidTransition(item.status, status)) {
      return res.status(400).json({ message: `Cannot skip status. Current: "${item.status}". Next allowed: "${nextAllowedStatus(item.status) || 'delivered'}"` });
    }
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
