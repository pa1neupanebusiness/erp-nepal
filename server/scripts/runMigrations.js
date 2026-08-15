const mongoose = require('mongoose');
const runMigrations = require('../migrations/runMigrations');

const directUri = 'mongodb://pa1neupanebusiness_db_user:kQldJ8RuQTjwu4CK@ac-xwhm0aj-shard-00-00.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-01.mcq0er7.mongodb.net:27017,ac-xwhm0aj-shard-00-02.mcq0er7.mongodb.net:27017/erp_nepal?ssl=true&replicaSet=atlas-vz8u1r-shard-0&authSource=admin&retryWrites=true&w=majority';
const mongoUri = process.env.MONGO_URI || directUri;

async function main() {
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected');
  await runMigrations();
  await mongoose.disconnect();
  console.log('Disconnected');
}

main().catch(e => { console.error(e); process.exit(1); });
