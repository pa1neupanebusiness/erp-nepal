const express = require('express');
const Damage = require('../models/Damage');
const Product = require('../models/Product');
const InventoryMovement = require('../models/InventoryMovement');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  const items = await Damage.find({ ...(req.fyFilter || {}), ...req.companyFilter }).populate('product', 'name sku').populate('createdBy', 'name').sort({ date: -1 });
  res.json(items);
});

router.post('/', protect, async (req, res) => {
  const { date, product, quantity, type, costPrice, description } = req.body;
  const productDoc = await Product.findOne({ _id: product, ...req.companyFilter });
  if (!productDoc) return res.status(404).json({ message: 'Product not found' });
  if (productDoc.stock < quantity) return res.status(400).json({ message: `Insufficient stock. Available: ${productDoc.stock}` });

  const price = costPrice || productDoc.costPrice;
  const totalLoss = price * quantity;

  const damage = await Damage.create({
    date, product, quantity, type, costPrice: price, totalLoss, description, createdBy: req.user._id, company: req.companyId,
  });

  productDoc.stock -= quantity;
  await productDoc.save();

  await InventoryMovement.create({
    product: productDoc._id, type: 'out', quantity: -quantity,
    reference: `DAMAGE-${damage._id}`, note: description || `Damage: ${type}`,
    createdBy: req.user._id, company: req.companyId,
    date: date ? new Date(date) : undefined, fiscalYearId: req.fiscalYearId || undefined,
  });

  res.status(201).json(damage);
});

router.get('/summary', protect, async (req, res) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthDamages = await Damage.find({ date: { $gte: monthStart }, ...req.companyFilter });
  res.json({
    totalItems: monthDamages.reduce((s, d) => s + d.quantity, 0),
    totalLoss: monthDamages.reduce((s, d) => s + d.totalLoss, 0),
    count: monthDamages.length,
  });
});

module.exports = router;
