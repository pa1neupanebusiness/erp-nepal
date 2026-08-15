const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
const FiscalYear = require('./models/FiscalYear');

async function migrateFiscalYears() {
  try {
    const legacyCount = await FiscalYear.countDocuments({ company: { $exists: false } });
    if (legacyCount > 0) {
      const firstCompany = await Company.findOne();
      if (firstCompany) {
        await FiscalYear.updateMany(
          { company: { $exists: false } },
          { $set: { company: firstCompany._id } }
        );
        console.log(`Assigned ${legacyCount} legacy fiscal year(s) to ${firstCompany.name}`);
      }
    }
  } catch (err) {
    console.error('Fiscal year migration error:', err.message);
  }
}

async function dropLegacyFiscalYearIndexes() {
  try {
    await FiscalYear.collection.dropIndex('name_1');
    console.log('Dropped legacy unique index name_1 on fiscalyears');
  } catch (err) {
    if (err.codeName !== 'IndexNotFound') {
      console.error('Error dropping legacy fiscal year index:', err.message);
    }
  }
}

async function seed() {
  try {
    await migrateFiscalYears();
    await dropLegacyFiscalYearIndexes();

    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('Database already has users, skipping seed.');
      return;
    }

    console.log('Fresh database detected. Creating super admin...');

    await User.create({
      name: 'Super Admin',
      email: 'pa1neupane.business@gmail.com',
      password: 'P@1neupane',
      role: 'super_admin',
      groups: ['pos', 'inventory', 'accounts', 'hr']
    });

    console.log('Super admin created: pa1neupane.business@gmail.com');
    console.log('No company configured yet. First user must complete setup.');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

module.exports = seed;
