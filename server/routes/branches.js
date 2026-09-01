const express = require('express');
const Branch = require('../models/Branch');
const User = require('../models/User');
const OrderTracking = require('../models/OrderTracking');
const { protect, adminOnly, requireTrackingModule } = require('../middleware/auth');
const { groupsForPosition, syncEmployeeForUser } = require('../utils/branchStaff');
const router = express.Router();

router.use(protect, requireTrackingModule);

router.get('/', async (req, res) => {
  const branches = await Branch.find({ ...req.companyFilter, isActive: true })
    .populate('users', 'name email role groups branch')
    .sort({ createdAt: -1 });
  res.json(branches);
});

router.post('/', adminOnly, async (req, res) => {
  const { name, address, phone, email, userIds } = req.body;
  if (!name) return res.status(400).json({ message: 'Branch name is required' });
  const branch = await Branch.create({
    name, address: address || '', phone: phone || '', email: email || '',
    users: userIds || [],
    company: req.companyId,
  });
  if (userIds && userIds.length) {
    await User.updateMany({ _id: { $in: userIds }, company: req.companyId }, { $set: { branch: branch._id } });
  }
  res.status(201).json(branch);
});

router.put('/:id', adminOnly, async (req, res) => {
  const { name, address, phone, email, userIds, isActive } = req.body;
  const branch = await Branch.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  if (name !== undefined) branch.name = name;
  if (address !== undefined) branch.address = address;
  if (phone !== undefined) branch.phone = phone;
  if (email !== undefined) branch.email = email;
  if (isActive !== undefined) branch.isActive = isActive;
  if (userIds !== undefined) {
    const oldUserIds = branch.users.map(u => u.toString());
    const newUserIds = userIds.map(u => u.toString());
    const removed = oldUserIds.filter(u => !newUserIds.includes(u));
    const added = newUserIds.filter(u => !oldUserIds.includes(u));
    if (removed.length) await User.updateMany({ _id: { $in: removed } }, { $set: { branch: null } });
    if (added.length) await User.updateMany({ _id: { $in: added }, company: req.companyId }, { $set: { branch: branch._id } });
    branch.users = userIds;
  }
  await branch.save();
  res.json(branch);
});

router.delete('/:id', adminOnly, async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  await User.updateMany({ branch: branch._id }, { $set: { branch: null } });
  await branch.deleteOne();
  res.json({ message: 'Branch deleted' });
});

router.get('/:id', async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, ...req.companyFilter })
    .populate('users', 'name email role groups branch branchPosition isActive');
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  const orders = await OrderTracking.find({ branch: branch._id, company: req.companyId })
    .populate('driver', 'name')
    .populate('customer', 'name phone')
    .sort({ updatedAt: -1 })
    .limit(50);
  res.json({ branch, orders });
});

router.get('/:id/users', async (req, res) => {
  const users = await User.find({ branch: req.params.id, company: req.companyId })
    .select('name email role groups branch branchPosition isActive');
  res.json(users);
});

router.put('/:id/add-staff', adminOnly, async (req, res) => {
  const { userId, position } = req.body;
  if (!userId) return res.status(400).json({ message: 'User ID is required' });
  const branch = await Branch.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  const user = await User.findOne({ _id: userId, company: req.companyId });
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!branch.users.includes(userId)) {
    branch.users.push(userId);
    await branch.save();
  }
  user.branch = branch._id;
  user.branchPosition = position || '';
  if (position) user.groups = groupsForPosition(position);
  await user.save();
  if (position) {
    try { await syncEmployeeForUser(user, position); } catch (e) { console.error('Staff salary record sync failed:', e.message); }
  }
  const updated = await Branch.findOne({ _id: req.params.id, ...req.companyFilter })
    .populate('users', 'name email role groups branch branchPosition isActive');
  res.json(updated);
});

router.post('/:id/add-staff-user', adminOnly, async (req, res) => {
  try {
    const { name, email, password, position } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
    const branch = await Branch.findOne({ _id: req.params.id, ...req.companyFilter });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    const pos = position && position.trim() ? position.trim() : 'Staff';
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already exists' });
    const user = await User.create({
      name: name.trim(), email: email.trim().toLowerCase(), password,
      role: 'user',
      groups: groupsForPosition(pos),
      company: req.companyId,
      branch: branch._id,
      branchPosition: pos,
    });
    if (!branch.users.includes(user._id)) {
      branch.users.push(user._id);
      await branch.save();
    }
    try { await syncEmployeeForUser(user, pos); } catch (e) { console.error('Staff salary record sync failed:', e.message); }
    const updated = await Branch.findOne({ _id: req.params.id, ...req.companyFilter })
      .populate('users', 'name email role groups branch branchPosition isActive');
    res.status(201).json(updated);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Email already exists' });
    console.error('add-staff-user failed:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id/remove-staff', adminOnly, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: 'User ID is required' });
  const branch = await Branch.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  branch.users = (branch.users || []).filter(u => u.toString() !== userId);
  await branch.save();
  const user = await User.findOne({ _id: userId, company: req.companyId });
  if (user) {
    user.branch = null;
    user.branchPosition = '';
    user.groups = (user.groups || []).filter(g => g !== 'branch' && g !== 'driver');
    await user.save();
  }
  const updated = await Branch.findOne({ _id: req.params.id, ...req.companyFilter })
    .populate('users', 'name email role groups branch branchPosition isActive');
  res.json(updated);
});

module.exports = router;
