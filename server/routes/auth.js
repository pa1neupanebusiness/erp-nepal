const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'erp_jwt_secret_key', { expiresIn: '30d' });
};

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).populate('company');
    if (user && (await user.matchPassword(password))) {
      const companyShort = user.company?.shortName || user.company?._id?.toString().slice(-8) || '';
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        groups: user.groups || [],
        company: user.company ? {
          _id: user.company._id,
          name: user.company.name,
          shortName: user.company.shortName || companyShort,
          subscription: user.company.subscription,
          selectedModule: user.company.selectedModule,
          country: user.company.country,
          currency: user.company.currency,
          currencySymbol: user.company.currencySymbol,
          vatRate: user.company.vatRate,
          salesTaxRate: user.company.salesTaxRate,
          taxYear: user.company.taxYear,
          fiscalYearStart: user.company.fiscalYearStart,
          dateFormat: user.company.dateFormat,
          isSetupComplete: user.company.isSetupComplete,
          isTaxConfigured: user.company.isTaxConfigured,
          enabledModules: user.company.enabledModules || [],
        } : null,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, company } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'User already exists' });
    const user = await User.create({ name, email, password, role: role || 'cashier', company });
    res.status(201).json({
      _id: user._id, name: user.name, email: user.email, role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/me', protect, async (req, res) => {
  res.json(req.user);
});

router.get('/users', protect, adminOnly, async (req, res) => {
  const users = await User.find({}).select('-password');
  res.json(users);
});

module.exports = router;
