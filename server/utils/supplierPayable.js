const Account = require('../models/Account');
const Supplier = require('../models/Supplier');

async function findOrCreateSupplierPayable(companyId, companyFilter, supplier) {
  if (!supplier) {
    return Account.findOne({ code: '20100', ...companyFilter });
  }
  let supplierId = supplier && (supplier._id || supplier);
  let supplierName = supplier && supplier.name;
  if (!supplierName && supplierId) {
    const doc = await Supplier.findOne({ _id: supplierId, ...companyFilter }).select('name');
    supplierName = doc && doc.name;
  }
  if (!supplierName) {
    return Account.findOne({ code: '20100', ...companyFilter });
  }
  const name = `Accounts Payable - ${supplierName}`;
  let account = await Account.findOne({ name, ...companyFilter });
  if (!account) {
    const existing = await Account.find({ code: { $regex: '^201' }, ...companyFilter }).sort({ code: -1 });
    const next = existing.length ? parseInt(existing[0].code.slice(3), 10) + 1 : 1;
    const code = '201' + String(next).padStart(2, '0');
    try {
      account = await Account.create({
        code, name, type: 'liability', category: 'current_liability',
        balance: 0, isSystem: false, company: companyId,
      });
    } catch (err) {
      account = await Account.findOne({ name, ...companyFilter });
    }
  }
  return account;
}

async function findOrCreateSupplierAdvance(companyId, companyFilter) {
  const code = '10900';
  let account = await Account.findOne({ code, ...companyFilter });
  if (!account) {
    try {
      account = await Account.create({
        code, name: 'Advance to Supplier', type: 'asset', category: 'current_asset',
        balance: 0, isSystem: false, company: companyId,
      });
    } catch (err) {
      account = await Account.findOne({ code, ...companyFilter });
    }
  }
  return account;
}

module.exports = { findOrCreateSupplierPayable, findOrCreateSupplierAdvance };
