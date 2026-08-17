const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const seed = require('./seed');
const runMigrations = require('./migrations/runMigrations');
const fiscalYearFilter = require('./middleware/fiscalYear');
const companyScope = require('./middleware/companyScope');
const { ensureEmiAccounts } = require('./utils/ensureEmiAccounts');

require('express-async-errors');
dotenv.config();

const app = express();
let serverStarted = false;

app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/setup', require('./routes/setup'));
app.use('/api/date-format', require('./routes/dateFormat'));
app.use('/api/companies', require('./routes/companies'));

app.get('/api/public/track/:trackingNumber', async (req, res) => {
  try {
    const OrderTracking = require('./models/OrderTracking');
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

app.use(companyScope);
app.use(fiscalYearFilter);
app.use('/api/fiscal-years', require('./routes/fiscalYears'));
app.use('/api/company', require('./routes/company'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/users', require('./routes/users'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/refund-requests', require('./routes/refundRequests'));
app.use('/api/journal-entries', require('./routes/journalEntries'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/reports', require('./routes/printReport'));
app.use('/api/vouchers', require('./routes/vouchers'));
app.use('/api/emis', require('./routes/emis'));
app.use('/api/banks', require('./routes/banks'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/payment-out', require('./routes/paymentOut'));
app.use('/api/payment-in', require('./routes/paymentIn'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/fixed-assets', require('./routes/fixedAssets'));
app.use('/api/damage', require('./routes/damage'));
app.use('/api/heldbills', require('./routes/heldbills'));
app.use('/api/hr', require('./routes/hr'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/daybook', require('./routes/daybook'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/backup', require('./routes/backup'));
  app.use('/api/system', require('./routes/system'));
  app.use('/api/tracking', require('./routes/tracking'));
  app.use('/api/branches', require('./routes/branches'));
app.use('/api', require('./routes/assistant'));

const { protect } = require('./middleware/auth');
const Purchase = require('./models/Purchase');
const Sale = require('./models/Sale');
const { getBSFiscalYear } = require('./utils/dateUtils');

app.post('/api/admin/fix-fiscal-year-labels', protect, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Super admin only' });
  try {
    const badPurchases = await Purchase.find({
      $or: [
        { fiscalYear: { $regex: /^196[6-9]\// } },
        { purchaseNumber: { $regex: /196[6-9]\// } },
      ],
    }).select('purchaseNumber fiscalYear date company');

    const purchaseFixes = [];
    for (const p of badPurchases) {
      const correctFY = getBSFiscalYear(p.date || new Date());
      const counterMatch = p.purchaseNumber.match(/-(\d{4,})$/);
      const counter = counterMatch ? counterMatch[1] : '0001';
      const newPurchaseNo = `PUR-${correctFY.label}-${counter}`;
      await Purchase.updateOne({ _id: p._id }, { $set: { fiscalYear: correctFY.label, purchaseNumber: newPurchaseNo } });
      purchaseFixes.push({ from: p.purchaseNumber, to: newPurchaseNo });
    }

    const badSales = await Sale.find({
      $or: [
        { fiscalYear: { $regex: /^196[6-9]\// } },
        { invoiceNumber: { $regex: /196[6-9]\// } },
      ],
    }).select('invoiceNumber fiscalYear date company');

    const saleFixes = [];
    for (const s of badSales) {
      const correctFY = getBSFiscalYear(s.date || new Date());
      const counterMatch = s.invoiceNumber.match(/-(\d{3,})$/);
      const counter = counterMatch ? counterMatch[1] : '001';
      const newInvNo = `${correctFY.label}-${counter}`;
      await Sale.updateOne({ _id: s._id }, { $set: { fiscalYear: correctFY.label, invoiceNumber: newInvNo } });
      saleFixes.push({ from: s.invoiceNumber, to: newInvNo });
    }

    res.json({ purchasesFixed: purchaseFixes.length, salesFixed: saleFixes.length, purchaseFixes, saleFixes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/admin/backfill-inclusive-vat', protect, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Super admin only' });
  try {
    const sales = await Sale.find({ taxTotal: { $gt: 0 }, inclusiveVat: { $ne: true } }).select('items discount taxTotal grandTotal inclusiveVat').lean();
    let updated = 0;
    const fixes = [];
    for (const s of sales) {
      const rawSubTotalGross = (s.items || []).reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 0), 0);
      const rawAfterDiscount = Math.max(0, rawSubTotalGross - (s.discount || 0));
      const looksExclusive = Math.abs((rawAfterDiscount + (s.taxTotal || 0)) - (s.grandTotal || 0)) < 0.5;
      if (!looksExclusive) {
        await Sale.updateOne({ _id: s._id }, { $set: { inclusiveVat: true } });
        updated++;
        fixes.push(s._id.toString());
      }
    }
    res.json({ scanned: sales.length, markedInclusive: updated, ids: fixes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ERP System is running', version: '1.0.0' });
});

const clientBuild = path.join(__dirname, '..', 'client', 'build');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  res.status(500).json({ message: 'Server error: ' + err.message });
});

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  await seed();
  await runMigrations();
  await ensureEmiAccounts();
  if (!serverStarted) {
    serverStarted = true;
    app.listen(PORT, () => {
      console.log(`ERP Server running on port ${PORT}`);
      if (process.env.NODE_ENV === 'production') {
        console.log(`Serving client from ${clientBuild}`);
      }
    });

    cron.schedule('0 2 * * 0', async () => {
      console.log('Weekly backup started...');
      try {
        const { backupAllCompanies } = require('./utils/backupService');
        const results = await backupAllCompanies();
        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`Weekly backup complete: ${succeeded} succeeded, ${failed} failed`);
      } catch (err) {
        console.error('Weekly backup failed:', err.message);
      }
    }, { timezone: 'Asia/Kathmandu' });
  }
}
start();
