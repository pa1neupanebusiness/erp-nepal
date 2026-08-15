const express = require('express');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Account = require('../models/Account');
const Bank = require('../models/Bank');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/summary', protect, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const fy = req.fyFilter?.createdAt;
  const todayFilter = { ...req.companyFilter, createdAt: { $gte: today }, status: 'completed' };
  const monthFilter = { ...req.companyFilter, createdAt: { $gte: monthStart }, status: 'completed' };
  const overallFilter = { ...req.companyFilter, status: 'completed' };
  const todayRefundFilter = { ...req.companyFilter, createdAt: { $gte: today }, status: 'refunded' };
  const monthRefundFilter = { ...req.companyFilter, createdAt: { $gte: monthStart }, status: 'refunded' };
  if (fy) {
    todayFilter.createdAt.$gte = new Date(Math.max(today.getTime(), new Date(fy.$gte).getTime()));
    monthFilter.createdAt.$gte = new Date(Math.max(monthStart.getTime(), new Date(fy.$gte).getTime()));
    todayFilter.createdAt.$lte = new Date(fy.$lte);
    monthFilter.createdAt.$lte = new Date(fy.$lte);
    overallFilter.createdAt = { $gte: fy.$gte, $lte: fy.$lte };
    todayRefundFilter.createdAt.$gte = new Date(Math.max(today.getTime(), new Date(fy.$gte).getTime()));
    monthRefundFilter.createdAt.$gte = new Date(Math.max(monthStart.getTime(), new Date(fy.$gte).getTime()));
    todayRefundFilter.createdAt.$lte = new Date(fy.$lte);
    monthRefundFilter.createdAt.$lte = new Date(fy.$lte);
  }

  const [todaySales, monthSales, totalSales, lowStock, customers, accounts, todayRefunds, monthRefunds] = await Promise.all([
    Sale.find(todayFilter),
    Sale.find(monthFilter),
    Sale.find(overallFilter),
    Product.find({ isActive: true, ...req.companyFilter }),
    Customer.countDocuments({ ...req.companyFilter }),
    Account.find({ ...req.companyFilter }),
    Sale.find(todayRefundFilter),
    Sale.find(monthRefundFilter),
  ]);

  const todayTotal = todaySales.reduce((s, i) => s + i.grandTotal, 0);
  const monthTotal = monthSales.reduce((s, i) => s + i.grandTotal, 0);
  const overallTotal = totalSales.reduce((s, i) => s + i.grandTotal, 0);
  const todayRefundTotal = todayRefunds.reduce((s, i) => s + i.grandTotal, 0);
  const monthRefundTotal = monthRefunds.reduce((s, i) => s + i.grandTotal, 0);
  const lowStockItems = lowStock.filter(p => p.stock <= p.minStock);
  const todayCount = todaySales.length;

  const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';
  const cashBalance = accounts.find(a => a.code === '10100');
  const bankBalance = accounts.find(a => a.code === '10200');
  const banks = isAdmin ? await Bank.find({ ...req.companyFilter }).select('name accountNumber accountHolder balance').sort({ name: 1 }) : [];
  const totalBankBalance = banks.reduce((s, b) => s + (b.balance || 0), 0);

  const stockValuation = isAdmin ? lowStock.reduce((s, p) => s + (p.stock || 0) * (p.costPrice || 0), 0) : undefined;

  res.json({
    todaySales: todayTotal, todayCount, monthSales: monthTotal,
    overallSales: overallTotal, lowStock: lowStockItems.length,
    totalCustomers: customers, totalProducts: lowStock.length,
    todayRefunds: todayRefundTotal, todayRefundCount: todayRefunds.length,
    monthRefunds: monthRefundTotal,
    cashBalance: isAdmin ? (cashBalance?.balance || 0) : undefined,
    bankBalance: isAdmin ? (totalBankBalance || bankBalance?.balance || 0) : undefined,
    stockValuation,
    banks: isAdmin ? banks : undefined,
  });
});

router.get('/recent-sales', protect, async (req, res) => {
  const filter = { status: 'completed', ...req.fyFilter, ...req.companyFilter };
  const sales = await Sale.find(filter)
    .populate('customer', 'name')
    .populate('cashier', 'name')
    .populate('items.product', 'name')
    .sort({ createdAt: -1 }).limit(10);
  res.json(sales);
});

router.get('/sales-chart', protect, async (req, res) => {
  const days = 7;
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const sales = await Sale.find({ createdAt: { $gte: d, $lt: next }, status: 'completed', ...req.companyFilter });
    const total = sales.reduce((s, i) => s + i.grandTotal, 0);
    result.push({ date: d.toISOString().split('T')[0], total, count: sales.length });
  }
  res.json(result);
});

module.exports = router;
