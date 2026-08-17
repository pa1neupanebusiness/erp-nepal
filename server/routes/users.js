const express = require('express');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'super_admin';
    const filter = isSuperAdmin
      ? {}
      : { company: req.companyId, isCompanySuperAdmin: { $ne: true } };
    const users = await User.find(filter).select('-password').populate('company', 'name').populate('branch', 'name').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, groups, branch } = req.body;
    if (req.user.role !== 'super_admin' && (role === 'super_admin' || role === 'admin')) {
      return res.status(403).json({ message: 'You can only create users with role "user"' });
    }
    const exists = await User.findOne({ email, ...(req.user.role === 'super_admin' ? req.companyFilter : { company: req.companyId }) });
    if (exists) return res.status(400).json({ message: 'Email already exists' });
    const user = await User.create({
      name, email, password, role: role || 'user', groups: groups || [],
      company: req.companyId,
      branch: branch || null,
    });
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role, groups: user.groups, branch: user.branch });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, groups, isActive, branch } = req.body;
    const scope = req.user.role === 'super_admin' ? { _id: req.params.id } : { _id: req.params.id, company: req.companyId };
    const user = await User.findOne(scope);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (req.user.role !== 'super_admin' && (user.role === 'super_admin' || user.isCompanySuperAdmin)) {
      return res.status(403).json({ message: 'Cannot modify company owner or super admin' });
    }
    if (req.user.role !== 'super_admin' && role === 'super_admin') {
      return res.status(403).json({ message: 'Cannot set role to super admin' });
    }
    if (name) user.name = name;
    if (email) user.email = email;
    if (role && req.user.role === 'super_admin') user.role = role;
    if (groups) user.groups = groups;
    if (isActive !== undefined) user.isActive = isActive;
    if (password) user.password = password;
    if (branch !== undefined) user.branch = branch || null;
    await user.save();
    const populated = await User.findById(user._id).select('-password').populate('branch', 'name');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, ...(req.user.role === 'super_admin' ? req.companyFilter : { company: req.companyId }) });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (req.user.role !== 'super_admin' && (user.role === 'super_admin' || user.isCompanySuperAdmin)) {
      return res.status(403).json({ message: 'Cannot delete company owner or super admin' });
    }
    await User.findOneAndDelete({ _id: req.params.id, ...(req.user.role === 'super_admin' ? {} : { company: req.companyId }) });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
