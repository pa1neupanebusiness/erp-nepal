const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Company = require('../models/Company');
const User = require('../models/User');
const Account = require('../models/Account');
const FiscalYear = require('../models/FiscalYear');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const Voucher = require('../models/Voucher');
const JournalEntry = require('../models/JournalEntry');
const Emi = require('../models/Emi');
const PettyExpense = require('../models/PettyExpense');
const Damage = require('../models/Damage');
const HeldBill = require('../models/HeldBill');
const Bank = require('../models/Bank');
const PaymentIn = require('../models/PaymentIn');
const PaymentOut = require('../models/PaymentOut');
const RefundRequest = require('../models/RefundRequest');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Salary = require('../models/Salary');
const Employee = require('../models/Employee');
const InventoryMovement = require('../models/InventoryMovement');
const { getChartOfAccounts, getSupportedCountries, getCountryRules } = require('../utils/chartOfAccounts');
const { protect, superAdminOnly } = require('../middleware/auth');
const router = express.Router();

const { DEFAULT_MODULES } = Company;

const MODULE_TO_GROUP = { pos: 'pos', sales: 'pos', emi: 'pos', purchase: 'inventory', accounts: 'accounts', reports: 'accounts', hr: 'hr' };
const groupsForModules = (enabledModules) => [...new Set((enabledModules || []).map(m => MODULE_TO_GROUP[m]).filter(Boolean))];

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'erp_jwt_secret_key', { expiresIn: '30d' });
};

const COMPANY_EDITABLE = [
  'name', 'phone', 'address', 'pan', 'regNumber', 'city', 'country',
  'currency', 'currencySymbol', 'vatRate', 'salesTaxRate', 'dateFormat',
  'subscription', 'selectedModule', 'isActive', 'isTaxConfigured', 'enabledModules', 'chatbotEnabled',
];

function generateShortName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30);
}

router.get('/countries', (req, res) => {
  res.json(getSupportedCountries());
});

router.post('/search-country', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.json({ found: false });
  const q = name.trim().toLowerCase();
  const match = getSupportedCountries().find(c => c.name.toLowerCase() === q || c.name.toLowerCase().includes(q));
  res.json(match ? { found: true, code: match.code, name: match.name, currency: match.currency } : { found: false });
});

router.post('/register', async (req, res) => {
  try {
    const { companyName, email, phone, address, pan, city, country, dateFormat, adminName, password, fiscalYear } = req.body;

    if (!companyName || !email || !country || !adminName || !password) {
      return res.status(400).json({ message: 'Company name, email, country, admin name, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existingCompany = await Company.findOne({ email });
    if (existingCompany) {
      return res.status(400).json({ message: 'A company with this email already exists' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const countryData = getChartOfAccounts(country);
    if (!countryData) {
      return res.status(400).json({ message: 'Unsupported country' });
    }

    const company = await Company.create({
      name: companyName,
      shortName: generateShortName(companyName),
      email,
      phone: phone || '',
      address: address || '',
      pan: pan || '',
      city: city || '',
      country,
      currency: countryData.currency,
      currencySymbol: countryData.currencySymbol,
      vatRate: countryData.vatRate,
      salesTaxRate: countryData.salesTaxRate || 0,
      taxYear: countryData.taxYear,
      fiscalYearStart: countryData.fiscalYearStart,
      dateFormat: dateFormat || countryData.defaultDateFormat,
      isSetupComplete: true,
      subscription: 'free',
      enabledModules: DEFAULT_MODULES
    });

    const user = await User.create({
      name: adminName,
      email,
      password,
      role: 'admin',
      groups: groupsForModules(DEFAULT_MODULES),
      company: company._id,
      isCompanySuperAdmin: true
    });

    await Account.insertMany(
      countryData.accounts.map(a => ({ ...a, company: company._id }))
    );

    let fy = null;
    if (fiscalYear && fiscalYear.name && fiscalYear.startDate && fiscalYear.endDate) {
      fy = await FiscalYear.create({
        name: fiscalYear.name,
        startDate: fiscalYear.startDate,
        endDate: fiscalYear.endDate,
        isActive: true,
        company: company._id,
      });
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      groups: user.groups,
      company: {
        _id: company._id,
        name: company.name,
        country: company.country,
        currency: company.currency,
        currencySymbol: company.currencySymbol,
        vatRate: company.vatRate,
        salesTaxRate: company.salesTaxRate,
        taxYear: company.taxYear,
        fiscalYearStart: company.fiscalYearStart,
        dateFormat: company.dateFormat,
        isSetupComplete: true,
        enabledModules: company.enabledModules || DEFAULT_MODULES
      },
      fiscalYear: fy,
      token: generateToken(user._id)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, superAdminOnly, async (req, res) => {
  try {
    const { name, email, phone, address, pan, city, country, adminName, password, enabledModules, fiscalYear } = req.body;
    if (!name || !email || !adminName || !password) {
      return res.status(400).json({ message: 'Company name, email, admin name, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (await Company.findOne({ email })) {
      return res.status(400).json({ message: 'A company with this email already exists' });
    }
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const countryData = getChartOfAccounts(country || 'nepal');
    if (!countryData) return res.status(400).json({ message: 'Unsupported country' });

    const company = await Company.create({
      name,
      shortName: generateShortName(name),
      email,
      phone: phone || '',
      address: address || '',
      pan: pan || '',
      city: city || '',
      country: country || 'nepal',
      currency: countryData.currency,
      currencySymbol: countryData.currencySymbol,
      vatRate: countryData.vatRate,
      salesTaxRate: countryData.salesTaxRate || 0,
      taxYear: countryData.taxYear,
      fiscalYearStart: countryData.fiscalYearStart,
      isSetupComplete: true,
      subscription: 'free',
      enabledModules: enabledModules && enabledModules.length ? enabledModules : DEFAULT_MODULES
    });

    const user = await User.create({
      name: adminName,
      email,
      password,
      role: 'admin',
      groups: groupsForModules(enabledModules && enabledModules.length ? enabledModules : DEFAULT_MODULES),
      company: company._id,
      isCompanySuperAdmin: true
    });

    await Account.insertMany(
      countryData.accounts.map(a => ({ ...a, company: company._id }))
    );

    if (fiscalYear && fiscalYear.name && fiscalYear.startDate && fiscalYear.endDate) {
      await FiscalYear.create({
        name: fiscalYear.name,
        startDate: fiscalYear.startDate,
        endDate: fiscalYear.endDate,
        isActive: true,
        company: company._id,
      });
    }

    res.status(201).json({ ...company.toObject(), adminUser: { _id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', protect, superAdminOnly, async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    const companyIds = companies.map(c => c._id);
    const userCounts = await User.aggregate([
      { $match: { company: { $in: companyIds } } },
      { $group: { _id: '$company', count: { $sum: 1 } } },
    ]);
    const userCountMap = {};
    userCounts.forEach(u => { userCountMap[u._id.toString()] = u.count; });
    const result = companies.map(c => ({
      ...c.toObject(),
      userCount: userCountMap[c._id.toString()] || 0,
      companyUrl: `${req.protocol}://${req.get('host')}/${c.shortName || c._id.toString().slice(-8)}`,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const users = await User.find({ company: company._id, role: { $ne: 'super_admin' } }).select('-password').sort({ createdAt: 1 });
    const superAdmin = await User.findOne({ company: company._id, role: 'super_admin' }).select('name email').lean();
    res.json({
      company: {
        ...company.toObject(),
        companyUrl: `${req.protocol}://${req.get('host')}/${company.shortName || company._id.toString().slice(-8)}`,
      },
      users,
      superAdmin,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/users', protect, superAdminOnly, async (req, res) => {
  try {
    const { name, email, password, role, groups } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (await User.findOne({ email })) return res.status(400).json({ message: 'Email already exists' });
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const allowedGroups = groupsForModules(company.enabledModules);
    const safeGroups = (groups || []).filter(g => allowedGroups.includes(g));
    const user = await User.create({
      name, email, password, role: role || 'user',
      groups: safeGroups, company: company._id,
    });
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role, groups: user.groups });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id/users/:userId', protect, superAdminOnly, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.userId, company: req.params.id });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const { name, email, role, groups, isActive, password } = req.body;
    if (name) user.name = name;
    if (email && email !== user.email) {
      if (await User.findOne({ email })) return res.status(400).json({ message: 'Email already exists' });
      user.email = email;
    }
    if (role) user.role = role;
    if (groups) {
      const company = await Company.findById(req.params.id);
      const allowedGroups = company ? groupsForModules(company.enabledModules) : groups;
      user.groups = groups.filter(g => allowedGroups.includes(g));
    }
    if (isActive !== undefined) user.isActive = isActive;
    if (password && password.length >= 6) user.password = password;
    await user.save();
    res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, groups: user.groups, isActive: user.isActive });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id/users/:userId', protect, superAdminOnly, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.userId, company: req.params.id });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isCompanySuperAdmin) return res.status(400).json({ message: 'Cannot delete company admin' });
    await User.findByIdAndDelete(user._id);
    res.json({ message: 'User deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    COMPANY_EDITABLE.forEach(field => {
      if (req.body[field] !== undefined) company[field] = req.body[field];
    });
    if (req.body.enabledModules && !Array.isArray(req.body.enabledModules)) {
      return res.status(400).json({ message: 'enabledModules must be an array' });
    }
    await company.save();
    res.json(company);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const id = company._id;

    const scopedModels = [
      User, Account, FiscalYear, Sale, Purchase, Product, Category, Supplier, Customer,
      Voucher, JournalEntry, Emi, PettyExpense, Damage, HeldBill, Bank, PaymentIn,
      PaymentOut, RefundRequest, Attendance, Leave, Salary, Employee, InventoryMovement,
    ];
    for (const Model of scopedModels) {
      await Model.deleteMany({ company: id });
    }

    await Company.findByIdAndDelete(id);
    res.json({ message: 'Company and all related data deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
