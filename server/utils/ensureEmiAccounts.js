const mongoose = require('mongoose');
const Company = require('../models/Company');
const Account = require('../models/Account');

// EMI-specific system accounts that must exist for every company.
// These power the two-stage EMI / hire-purchase accounting:
//   10360 - Bank EMI Loan Settlement (Clearing) : bank owes the company (financed remainder)
//   10450 - Used / Exchange Goods Stock         : trade-in / exchange items received
const EMI_SYSTEM_ACCOUNTS = [
  { code: '10360', name: 'Bank EMI Loan Settlement (Clearing)', type: 'asset', category: 'current_asset', isSystem: true },
  { code: '10450', name: 'Used / Exchange Goods Stock', type: 'asset', category: 'current_asset', isSystem: true },
];

/**
 * Upsert the EMI system accounts for a single company. Used both at
 * server startup and on-demand inside the EMI routes so the posting
 * engine self-heals even if the accounts were never seeded.
 */
async function ensureCompanyEmiAccounts(companyId) {
  if (!companyId) return;
  for (const acc of EMI_SYSTEM_ACCOUNTS) {
    await Account.findOneAndUpdate(
      { company: companyId, code: acc.code },
      {
        $setOnInsert: { code: acc.code, type: acc.type, category: acc.category, company: companyId },
        $set: { name: acc.name, isSystem: true },
      },
      { upsert: true }
    );
  }
}

/**
 * Upsert the EMI system accounts into every company so the EMI posting
 * engine works even on databases created before these accounts were added.
 */
async function ensureEmiAccounts() {
  try {
    const companies = await Company.find({});
    for (const company of companies) {
      await ensureCompanyEmiAccounts(company._id);
    }
    if (companies.length > 0) {
      console.log(`ensureEmiAccounts: verified EMI accounts for ${companies.length} company(ies)`);
    }
  } catch (err) {
    console.error('ensureEmiAccounts failed:', err.message);
  }
}

module.exports = { ensureEmiAccounts, ensureCompanyEmiAccounts, EMI_SYSTEM_ACCOUNTS };
