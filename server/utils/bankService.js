const Bank = require('../models/Bank');

/**
 * Adjusts a bank's running balance. `delta` is added to the balance.
 * Returns the updated bank doc, or null if the bank is missing.
 */
async function adjustBankBalance(bankId, delta, companyFilter = {}) {
  if (!bankId) return null;
  const bank = await Bank.findOneAndUpdate(
    { _id: bankId, ...companyFilter },
    { $inc: { balance: Math.round(delta * 100) / 100 } },
    { new: true }
  );
  return bank;
}

module.exports = { adjustBankBalance };
