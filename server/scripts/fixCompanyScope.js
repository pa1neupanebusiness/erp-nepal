const mongoose = require('mongoose');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI ||
  'mongodb://pa1neupanebusiness_db_user:kQldJ8RuQTjwu4CK@ac-xwhm0aj-shard-00-00.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-01.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-02.mcq0er7.mongodb.net:27017/erp_nepal?ssl=true&replicaSet=atlas-vz8u1r-shard-0&authSource=admin';
const GADGET_CITY_ID = '6a6af2fa4a16a4cba6cbf5fb';
const SUPER_ADMIN_USER_ID = '6a6a4a5c39abffb43125b3ac';
const UMESH_USER_ID = '6a6af2c54a16a4cba6cbf5f4';

const BUSINESS_MODELS = [
  'Account', 'Product', 'Category', 'Supplier', 'Customer', 'Voucher',
  'JournalEntry', 'InventoryMovement', 'Purchase', 'PettyExpense',
  'Damage', 'RefundRequest', 'HeldBill',
];

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const User = require(path.join(__dirname, '..', 'models', 'User'));
  const Company = require(path.join(__dirname, '..', 'models', 'Company'));

  const testCompany = await Company.findOne({ name: 'Super Admin Test Company' });
  const testCompanyId = testCompany
    ? testCompany._id
    : (await Company.create({ name: 'Super Admin Test Company', email: 'superadmin.test@erp.local', phone: '', address: 'Testing', selectedModule: null }))._id;
  console.log('Super Admin Test Company id:', testCompanyId);

  const patchedSuper = await User.updateMany(
    { _id: SUPER_ADMIN_USER_ID },
    { $set: { company: testCompanyId } }
  );
  console.log(`Super admin -> test company: ${JSON.stringify(patchedSuper)}`);

  const patchedUmesh = await User.updateMany(
    { _id: UMESH_USER_ID },
    { $set: { company: GADGET_CITY_ID } }
  );
  console.log(`Umesh -> Gadget City: ${JSON.stringify(patchedUmesh)}`);

  for (const name of BUSINESS_MODELS) {
    let Model;
    try { Model = mongoose.model(name); } catch (e) { Model = require(path.join(__dirname, '..', 'models', name)); }
    const r = await Model.updateMany(
      { company: { $in: [null, undefined] } },
      { $set: { company: testCompanyId } }
    );
    console.log(`${name.padEnd(18)} migrated: ${r.modifiedCount}`);
  }

  const left = await User.countDocuments({ company: null });
  console.log('Users still without company:', left);
  process.exit(0);
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
