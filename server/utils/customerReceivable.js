const Account = require('../models/Account');
const Customer = require('../models/Customer');

async function findOrCreateCustomerReceivable(companyId, companyFilter, customer) {
  if (!customer) {
    return Account.findOne({ code: '10300', ...companyFilter });
  }
  let customerId = customer && (customer._id || customer);
  let customerName = customer && customer.name;
  if (!customerName && customerId) {
    const doc = await Customer.findOne({ _id: customerId, ...companyFilter }).select('name');
    customerName = doc && doc.name;
  }
  if (!customerName) {
    return Account.findOne({ code: '10300', ...companyFilter });
  }
  const name = `Accounts Receivable - ${customerName}`;
  let account = await Account.findOne({ name, ...companyFilter });
  if (!account) {
    const existing = await Account.find({ code: { $regex: '^103' }, ...companyFilter }).sort({ code: -1 });
    const next = existing.length ? parseInt(existing[0].code.slice(3), 10) + 1 : 1;
    const code = '103' + String(next).padStart(2, '0');
    try {
      account = await Account.create({
        code, name, type: 'asset', category: 'current_asset',
        balance: 0, isSystem: false, company: companyId,
      });
    } catch (err) {
      account = await Account.findOne({ name, ...companyFilter });
    }
  }
  return account;
}

module.exports = { findOrCreateCustomerReceivable };
