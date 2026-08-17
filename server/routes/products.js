const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const InventoryMovement = require('../models/InventoryMovement');
const { protect, superAdminOnly, requireEmiModule } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search) filter.name = { $regex: req.query.search, $options: 'i' };
  if (req.query.lowStock) filter.stock = { $lte: '$minStock' };
  const items = await Product.find({ ...filter, ...req.companyFilter }).populate('category supplier').sort({ name: 1 });
  res.json(items);
});

router.get('/low-stock', protect, async (req, res) => {
  const items = await Product.find({ isActive: true, ...req.companyFilter }).populate('category supplier');
  const lowStock = items.filter(p => p.stock <= p.minStock);
  res.json(lowStock);
});

router.get('/emi-products', protect, requireEmiModule, async (req, res) => {
  const items = await Product.find({ ...req.companyFilter, isActive: true, itemCondition: { $ne: 'second_hand' } })
    .select('name sku stock unit sellingPrice costPrice taxRate vatEnabled priceIncludesTax itemCondition category')
    .populate('category', 'name')
    .sort({ name: 1 });
  res.json(items);
});

router.get('/:id', protect, async (req, res) => {
  const item = await Product.findOne({ _id: req.params.id, ...req.companyFilter }).populate('category supplier');
  res.json(item);
});

router.get('/:id/movements', protect, async (req, res) => {
  const filter = { product: req.params.id, ...req.companyFilter };
  const dateR = {};
  if (req.query.from) dateR.date = { $gte: new Date(req.query.from) };
  if (req.query.to) dateR.date = { ...dateR.date, $lte: new Date(req.query.to) };
  const conds = [];
  if (Object.keys(dateR).length) conds.push(dateR);
  if (req.fiscalYearId) conds.push({ fiscalYearId: req.fiscalYearId });
  if (conds.length) filter.$or = conds;
  const movements = await InventoryMovement.find(filter)
    .populate('product', 'name sku')
    .populate('createdBy', 'name')
    .sort({ date: -1, createdAt: -1 })
    .limit(500);
  res.json(movements);
});

router.post('/', protect, async (req, res) => {
  try {
    const data = { ...req.body, company: req.companyId };
    if (!data.category) delete data.category;
    if (!data.sku) {
      const prefix = data.category ? (await Category.findById(data.category))?.name?.substring(0, 3).toUpperCase() || 'GEN' : 'GEN';
      const count = await Product.countDocuments({ ...req.companyFilter });
      data.sku = `${prefix}-${String(count + 1).padStart(4, '0')}`;
    }
    if (!data.barcode) {
      const categoryName = data.category ? (await Category.findById(data.category))?.name || '' : '';
      const prefix = categoryName ? categoryName.substring(0, 2).toUpperCase() : 'GEN';
      const suffix = String(Math.floor(100 + Math.random() * 899)).padStart(3, '0');
      data.barcode = `${prefix}${suffix}`;
    }
    const item = await Product.create(data);
    if (req.body.stock > 0) {
      await InventoryMovement.create({
        product: item._id, type: 'in', quantity: req.body.stock || 0,
        reference: 'Initial stock', note: 'Product created', createdBy: req.user._id, company: req.companyId,
        fiscalYearId: req.fiscalYearId || undefined,
      });
    }
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Failed to create product' });
  }
});

router.put('/:id', protect, async (req, res) => {
  const data = { ...req.body };
  if (data.category === '') delete data.category;
  if (data.supplier === '') delete data.supplier;
  const item = await Product.findOneAndUpdate({ _id: req.params.id, ...req.companyFilter }, data, { new: true });
  res.json(item);
});

router.post('/:id/adjust-stock', protect, (req, res, next) => {
  if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin')) {
    next();
  } else {
    return res.status(403).json({ message: 'Super admin or admin access required' });
  }
}, async (req, res) => {
  const { quantity, type, note } = req.body;
  const product = await Product.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const change = type === 'in' ? quantity : -quantity;
  product.stock += change;
  await product.save();
  await InventoryMovement.create({
    product: product._id, type, quantity: change,
    reference: 'Manual adjustment', note: note || 'Stock adjusted', createdBy: req.user._id, company: req.companyId,
    fiscalYearId: req.fiscalYearId || undefined,
  });
  res.json(product);
});

router.delete('/:id', protect, superAdminOnly, async (req, res) => {
  await Product.findOneAndDelete({ _id: req.params.id, ...req.companyFilter });
  res.json({ message: 'Deleted' });
});

module.exports = router;
