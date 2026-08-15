const fs = require('fs');
const path = require('path');
const Company = require('../models/Company');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const Account = require('../models/Account');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const JournalEntry = require('../models/JournalEntry');
const Voucher = require('../models/Voucher');
const Emi = require('../models/Emi');
const Bank = require('../models/Bank');
const PaymentIn = require('../models/PaymentIn');
const PaymentOut = require('../models/PaymentOut');
const PettyExpense = require('../models/PettyExpense');
const Damage = require('../models/Damage');
const HeldBill = require('../models/HeldBill');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Salary = require('../models/Salary');
const Leave = require('../models/Leave');
const FixedAsset = require('../models/FixedAsset');
const InventoryMovement = require('../models/InventoryMovement');
const DayBookEntry = require('../models/DayBookEntry');
const User = require('../models/User');
const FiscalYear = require('../models/FiscalYear');
const Notification = require('../models/Notification');
const RefundRequest = require('../models/RefundRequest');

const BACKUP_ROOT = path.join(__dirname, '..', '..', 'backups');

function pad(n) { return String(n).padStart(2, '0'); }

function getBackupFolder(companyName) {
  const safeName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(BACKUP_ROOT, safeName);
}

function getBackupName(companyName) {
  const now = new Date();
  const dd = pad(now.getDate());
  const mm = pad(now.getMonth() + 1);
  const yyyy = now.getFullYear();
  const safeName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
  return `${dd}-${mm}-${yyyy}-${safeName}-backup`;
}

async function backupCompany(companyId) {
  const company = await Company.findById(companyId).lean();
  if (!company) throw new Error('Company not found');

  const filter = { company: companyId };

  const [
    products, categories, suppliers, customers, accounts,
    sales, purchases, journalEntries, vouchers, emis,
    banks, paymentIns, paymentOuts, pettyExpenses, damages,
    heldBills, employees, attendances, salaries, leaves,
    fixedAssets, inventoryMovements, dayBookEntries, users,
    fiscalYears, notifications, refundRequests,
  ] = await Promise.all([
    Product.find(filter).lean(),
    Category.find(filter).lean(),
    Supplier.find(filter).lean(),
    Customer.find(filter).lean(),
    Account.find(filter).lean(),
    Sale.find(filter).lean(),
    Purchase.find(filter).lean(),
    JournalEntry.find(filter).lean(),
    Voucher.find(filter).lean(),
    Emi.find(filter).lean(),
    Bank.find(filter).lean(),
    PaymentIn.find(filter).lean(),
    PaymentOut.find(filter).lean(),
    PettyExpense.find(filter).lean(),
    Damage.find(filter).lean(),
    HeldBill.find(filter).lean(),
    Employee.find(filter).lean(),
    Attendance.find(filter).lean(),
    Salary.find(filter).lean(),
    Leave.find(filter).lean(),
    FixedAsset.find(filter).lean(),
    InventoryMovement.find(filter).lean(),
    DayBookEntry.find(filter).lean(),
    User.find({ company: companyId }).select('-password').lean(),
    FiscalYear.find(filter).lean(),
    Notification.find(filter).lean(),
    RefundRequest.find(filter).lean(),
  ]);

  const data = {
    meta: {
      companyName: company.name,
      backupDate: new Date().toISOString(),
      version: '1.0',
    },
    company,
    products, categories, suppliers, customers, accounts,
    sales, purchases, journalEntries, vouchers, emis,
    banks, paymentIns, paymentOuts, pettyExpenses, damages,
    heldBills, employees, attendances, salaries, leaves,
    fixedAssets, inventoryMovements, dayBookEntries, users,
    fiscalYears, notifications, refundRequests,
  };

  const companyFolder = getBackupFolder(company.name);
  const backupName = getBackupName(company.name);
  const backupDir = path.join(companyFolder, backupName);

  fs.mkdirSync(backupDir, { recursive: true });

  const filePath = path.join(backupDir, 'data.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

  return { backupDir, backupName, filePath, recordCounts: {
    products: products.length,
    sales: sales.length,
    purchases: purchases.length,
    journalEntries: journalEntries.length,
    customers: customers.length,
    suppliers: suppliers.length,
    accounts: accounts.length,
  }};
}

async function listBackups(companyId) {
  const company = await Company.findById(companyId).lean();
  if (!company) throw new Error('Company not found');

  const safeName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
  const companyFolder = path.join(BACKUP_ROOT, safeName);

  if (!fs.existsSync(companyFolder)) return [];

  const entries = fs.readdirSync(companyFolder, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const dataPath = path.join(companyFolder, e.name, 'data.json');
      const exists = fs.existsSync(dataPath);
      let size = 0;
      if (exists) {
        const stat = fs.statSync(dataPath);
        size = stat.size;
      }
      return { name: e.name, exists, size };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

async function backupAllCompanies() {
  const companies = await Company.find({ isActive: true }).lean();
  const results = [];
  for (const c of companies) {
    try {
      const result = await backupCompany(c._id);
      results.push({ company: c.name, success: true, ...result });
      console.log(`Backup complete: ${c.name} -> ${result.backupName}`);
    } catch (err) {
      results.push({ company: c.name, success: false, error: err.message });
      console.error(`Backup failed for ${c.name}: ${err.message}`);
    }
  }
  return results;
}

module.exports = { backupCompany, listBackups, backupAllCompanies };
