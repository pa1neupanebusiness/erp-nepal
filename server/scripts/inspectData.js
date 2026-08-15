const mongoose = require('mongoose');

const models = [
  'Sale', 'Product', 'Category', 'Supplier', 'Customer', 'Voucher',
  'JournalEntry', 'InventoryMovement', 'Purchase', 'PettyExpense',
  'Damage', 'RefundRequest', 'HeldBill', 'Account',
];

async function inspect() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://pa1neupanebusiness_db_user:kQldJ8RuQTjwu4CK@erp-nepal.mcq0er7.mongodb.net/erp_nepal';
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected\n');

    const Company = require('../models/Company');
    const User = require('../models/User');
    const companies = await Company.find().lean();
    console.log('=== Companies ===');
    companies.forEach(c => console.log(`  ${c.name} (${c.email}) id=${c._id}`));
    if (companies.length === 0) console.log('  (none)');

    const users = await User.find().lean();
    console.log('\n=== Users ===');
    users.forEach(u => console.log(`  ${u.name} | ${u.email} | role=${u.role} | company=${u.company || 'null'}`));

    console.log('\n=== Data counts (null company vs company) ===');
    for (const name of models) {
      let Model;
      try { Model = mongoose.model(name); } catch (e) { Model = require(`../models/${name}`); }
      const nullCount = await Model.countDocuments({ company: null });
      const companyCount = await Model.countDocuments({ company: { $ne: null } });
      console.log(`  ${name}: null=${nullCount}, company=${companyCount}`);
    }
  } catch (err) {
    console.error('Inspect error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nDone');
  }
}

inspect();
