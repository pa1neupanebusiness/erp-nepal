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
app.use('/api', require('./routes/assistant'));

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
