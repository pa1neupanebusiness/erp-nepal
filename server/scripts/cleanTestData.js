const mongoose = require('mongoose');

const models = [
  'Sale',
  'Product',
  'Category',
  'Supplier',
  'Customer',
  'Voucher',
  'JournalEntry',
  'InventoryMovement',
  'Purchase',
  'PettyExpense',
  'Damage',
  'RefundRequest',
  'HeldBill',
  'Account',
];

async function clean() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://pa1neupanebusiness_db_user:kQldJ8RuQTjwu4CK@erp-nepal.mcq0er7.mongodb.net/erp_nepal';
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    let total = 0;
    for (const name of models) {
      let Model;
      try {
        Model = mongoose.model(name);
      } catch (e) {
        Model = require(`../models/${name}`);
      }
      const result = await Model.deleteMany({ company: null });
      if (result.deletedCount > 0) {
        console.log(`${name}: deleted ${result.deletedCount}`);
        total += result.deletedCount;
      }
    }
    console.log(`\nTotal test records removed (company: null): ${total}`);

    const counts = [];
    for (const name of models) {
      let Model;
      try {
        Model = mongoose.model(name);
      } catch (e) {
        Model = require(`../models/${name}`);
      }
      const kept = await Model.countDocuments({ company: { $ne: null } });
      counts.push(`${name}: ${kept}`);
    }
    console.log('\nRemaining records (with company):');
    counts.forEach(c => console.log('  ' + c));
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Done');
  }
}

clean();
