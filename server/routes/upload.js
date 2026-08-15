const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const Account = require('../models/Account');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

function parseSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

router.post('/products', protect, adminOnly, upload.single('file'), async (req, res) => {
  try {
    const rows = parseSheet(req.file.buffer);
    const results = { created: 0, errors: [] };
    for (const row of rows) {
      try {
        let category = null;
        if (row.category) {
          category = await Category.findOne({ name: row.category });
          if (!category) category = await Category.create({ name: row.category });
        }
        let supplier = null;
        if (row.supplier) {
          supplier = await Supplier.findOne({ name: row.supplier });
          if (!supplier) supplier = await Supplier.create({ name: row.supplier });
        }
        await Product.create({
          name: row.name, sku: row.sku || String(row.name).toUpperCase().replace(/\s/g, '_'),
          barcode: row.barcode, category: category?._id, supplier: supplier?._id,
          costPrice: parseFloat(row.cost_price) || 0, sellingPrice: parseFloat(row.selling_price) || 0,
          stock: parseInt(row.stock) || 0, minStock: parseInt(row.min_stock) || 5,
          unit: row.unit || 'pcs', taxRate: parseFloat(row.tax_rate) || 0,
        });
        results.created++;
      } catch (err) {
        results.errors.push({ row: row.name || row.sku, error: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/customers', protect, adminOnly, upload.single('file'), async (req, res) => {
  try {
    const rows = parseSheet(req.file.buffer);
    const results = { created: 0, errors: [] };
    for (const row of rows) {
      try {
        await Customer.create({
          name: row.name, email: row.email, phone: String(row.phone || ''),
          address: row.address, loyaltyPoints: parseInt(row.loyalty_points) || 0,
        });
        results.created++;
      } catch (err) {
        results.errors.push({ row: row.name, error: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/suppliers', protect, adminOnly, upload.single('file'), async (req, res) => {
  try {
    const rows = parseSheet(req.file.buffer);
    const results = { created: 0, errors: [] };
    for (const row of rows) {
      try {
        await Supplier.create({
          name: row.name, contactPerson: row.contact_person,
          email: row.email, phone: String(row.phone || ''),
          address: row.address,
        });
        results.created++;
      } catch (err) {
        results.errors.push({ row: row.name, error: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/accounts', protect, adminOnly, upload.single('file'), async (req, res) => {
  try {
    const rows = parseSheet(req.file.buffer);
    const results = { created: 0, errors: [] };
    for (const row of rows) {
      try {
        await Account.create({
          code: String(row.code), name: row.name,
          type: row.type, category: row.category,
          description: row.description,
        });
        results.created++;
      } catch (err) {
        results.errors.push({ row: row.name, error: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
