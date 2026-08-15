const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const Company = require('../models/Company');
const { DEFAULT_MODULES } = Company;

const SUPER_ADMIN_EMAIL = 'pa1neupane.business@gmail.com';

const directUri = 'mongodb://pa1neupanebusiness_db_user:kQldJ8RuQTjwu4CK@ac-xwhm0aj-shard-00-00.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-01.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-02.mcq0er7.mongodb.net:27017/erp_nepal?ssl=true&replicaSet=atlas-vz8u1r-shard-0&authSource=admin&retryWrites=true&w=majority';

async function run() {
  try {
    const mongoUri = process.env.MONGO_URI || directUri;
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const records = await User.find({ email: SUPER_ADMIN_EMAIL });
    let deleted = 0;
    for (const rec of records) {
      if (rec.company) {
        await User.findByIdAndDelete(rec._id);
        deleted++;
        console.log(`Deleted company-bound user: ${rec._id} (${rec.role}, company ${rec.company})`);
      }
    }

    const remaining = await User.findOne({ email: SUPER_ADMIN_EMAIL });
    if (remaining) {
      if (remaining.role !== 'super_admin') {
        remaining.role = 'super_admin';
        remaining.groups = ['pos', 'inventory', 'accounts', 'hr'];
        remaining.company = null;
        await remaining.save();
        console.log(`Promoted ${SUPER_ADMIN_EMAIL} to super_admin`);
      }
      if (remaining.company) {
        remaining.company = null;
        await remaining.save();
        console.log('Cleared company on super admin record');
      }
      console.log(`Super admin OK: ${SUPER_ADMIN_EMAIL}`);
    } else {
      await User.create({
        name: 'Super Admin',
        email: SUPER_ADMIN_EMAIL,
        password: 'P@1neupane',
        role: 'super_admin',
        groups: ['pos', 'inventory', 'accounts', 'hr'],
      });
      console.log(`Created super admin ${SUPER_ADMIN_EMAIL} (default password: P@1neupane)`);
    }
    if (deleted > 0) console.log(`Deleted ${deleted} company-bound duplicate record(s).`);

    const companies = await Company.find();
    let modulesSet = 0;
    let ownersMarked = 0;

    const missingModules = await Company.updateMany(
      { $or: [{ enabledModules: { $exists: false } }, { enabledModules: { $size: 0 } }] },
      { $set: { enabledModules: DEFAULT_MODULES } }
    );
    console.log(`Companies with missing enabledModules updated: ${missingModules.modifiedCount}`);

    for (const c of companies) {
      let changed = false;
      if (!c.enabledModules || c.enabledModules.length === 0) {
        c.enabledModules = DEFAULT_MODULES;
        changed = true;
        modulesSet++;
      }
      if (changed) await c.save();

      let owner = await User.findOne({ company: c._id, email: c.email });
      if (!owner) owner = await User.findOne({ company: c._id, role: 'admin' });
      if (owner && !owner.isCompanySuperAdmin) {
        owner.isCompanySuperAdmin = true;
        await owner.save();
        ownersMarked++;
        console.log(`Marked hidden company super admin: ${owner.email} (${c.name})`);
      }
    }
    console.log(`Companies processed: ${companies.length}, enabledModules set: ${modulesSet}, owners marked: ${ownersMarked}`);

    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run();
