const express = require('express');
const { protect } = require('../middleware/auth');
const Company = require('../models/Company');
const User = require('../models/User');
const FiscalYear = require('../models/FiscalYear');
const Account = require('../models/Account');
const { getChartOfAccounts, getSupportedCountries, getCountryRules } = require('../utils/chartOfAccounts');
const router = express.Router();

router.get('/countries', (req, res) => {
  res.json(getSupportedCountries());
});

router.get('/rules/:country', (req, res) => {
  const rules = getCountryRules(req.params.country);
  if (!rules) return res.status(404).json({ message: 'Country not found' });
  res.json(rules);
});

router.get('/status', protect, async (req, res) => {
  try {
    const company = await Company.findById(req.user.company);

    res.json({
      needsSetup: !company || !company.isSetupComplete,
      hasCompany: !!company,
      company: company ? {
        _id: company._id,
        name: company.name,
        country: company.country,
        currency: company.currency,
        currencySymbol: company.currencySymbol,
        vatRate: company.vatRate,
        taxYear: company.taxYear,
        dateFormat: company.dateFormat,
        isSetupComplete: company.isSetupComplete
      } : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/complete', protect, async (req, res) => {
  try {
    const { companyName, companyEmail, phone, address, pan, city, country, dateFormat } = req.body;

    if (!companyName || !companyEmail || !country) {
      return res.status(400).json({ message: 'Company name, email, and country are required' });
    }

    const countryData = getChartOfAccounts(country);
    const countryRules = getCountryRules(country);

    let company = await Company.findOne({ email: companyEmail });
    if (!company) {
      company = await Company.create({
        name: companyName,
        email: companyEmail,
        phone: phone || '',
        address: address || '',
        pan: pan || '',
        city: city || '',
        country: country,
        currency: countryData.currency,
        currencySymbol: countryData.currencySymbol,
        vatRate: countryData.vatRate,
        salesTaxRate: countryData.salesTaxRate || 0,
        taxYear: countryData.taxYear,
        fiscalYearStart: countryData.fiscalYearStart,
        dateFormat: dateFormat || countryData.defaultDateFormat,
        isSetupComplete: true,
        subscription: 'free'
      });
    } else {
      company.name = companyName;
      company.phone = phone || '';
      company.address = address || '';
      company.pan = pan || '';
      company.city = city || '';
      company.country = country;
      company.currency = countryData.currency;
      company.currencySymbol = countryData.currencySymbol;
      company.vatRate = countryData.vatRate;
      company.salesTaxRate = countryData.salesTaxRate || 0;
      company.taxYear = countryData.taxYear;
      company.fiscalYearStart = countryData.fiscalYearStart;
      company.dateFormat = dateFormat || countryData.defaultDateFormat;
      company.isSetupComplete = true;
      await company.save();
    }

    const user = await User.findById(req.user._id);
    if (user) {
      user.company = company._id;
      await user.save();
    }

    const fyCount = await FiscalYear.countDocuments({ company: company._id });
    if (fyCount === 0) {
      const fyStart = new Date(countryData.fiscalYearStart);
      const fyEnd = new Date(fyStart);
      fyEnd.setFullYear(fyEnd.getFullYear() + 1);
      fyEnd.setDate(fyEnd.getDate() - 1);

      await FiscalYear.create({
        name: `${fyStart.getFullYear()}/${fyEnd.getFullYear()}`,
        startDate: fyStart,
        endDate: fyEnd,
        isActive: true,
        company: company._id
      });
      console.log('Default fiscal year created');
    }

    const accountCount = await Account.countDocuments({ company: company._id });
    if (accountCount === 0) {
      await Account.insertMany(countryData.accounts.map(a => ({ ...a, company: company._id })));
      console.log(`Chart of Accounts seeded for ${countryData.name}: ${countryData.accounts.length} accounts`);
    }

    res.json({
      success: true,
      company: {
        _id: company._id,
        name: company.name,
        country: company.country,
        currency: company.currency,
        currencySymbol: company.currencySymbol,
        vatRate: company.vatRate,
        taxYear: company.taxYear,
        dateFormat: company.dateFormat,
        isSetupComplete: true
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
