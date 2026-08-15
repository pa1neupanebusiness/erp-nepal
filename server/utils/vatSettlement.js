const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');
const { adToBikramSambat, round100 } = require('./dateUtils');

function getFiscalYear(date) {
  const d = new Date(date);
  const m = d.getMonth() + 1, y = d.getFullYear(), dy = d.getDate();
  if (m > 7 || (m === 7 && dy >= 16)) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

async function runVatSettlement(companyId, companyFilter) {
  const outputVat = await Account.findOne({ code: '20200', ...companyFilter });
  const inputVat = await Account.findOne({ code: '10501', ...companyFilter });
  const vatCarryForward = await Account.findOne({ code: '10502', ...companyFilter });
  const cashAccount = await Account.findOne({ code: '10100', ...companyFilter });
  const bankAccount = await Account.findOne({ code: '10200', ...companyFilter });
  const irdAccount = await Account.findOne({ code: '20200', ...companyFilter });

  const outputVatBalance = outputVat ? Math.round((outputVat.balance || 0) * 100) / 100 : 0;
  const inputVatBalance = inputVat ? Math.round((inputVat.balance || 0) * 100) / 100 : 0;

  if (outputVatBalance === 0 && inputVatBalance === 0) {
    return { settled: false, reason: 'No VAT balances to settle' };
  }

  const lines = [];
  let netPayable = 0;
  let netCredit = 0;

  if (outputVat && outputVatBalance > 0) {
    lines.push({ account: outputVat._id, debit: outputVatBalance, credit: 0 });
  }
  if (inputVat && inputVatBalance > 0) {
    lines.push({ account: inputVat._id, debit: 0, credit: inputVatBalance });
  }

  if (outputVatBalance > inputVatBalance) {
    netPayable = outputVatBalance - inputVatBalance;
    if (bankAccount) {
      lines.push({ account: bankAccount._id, debit: 0, credit: netPayable });
    } else if (cashAccount) {
      lines.push({ account: cashAccount._id, debit: 0, credit: netPayable });
    }
  } else if (inputVatBalance > outputVatBalance) {
    netCredit = inputVatBalance - outputVatBalance;
    if (vatCarryForward) {
      lines.push({ account: vatCarryForward._id, debit: netCredit, credit: 0 });
    } else {
      lines.push({ account: inputVat._id, debit: netCredit, credit: 0 });
    }
  }

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) < 0.01) {
    await JournalEntry.create({
      date: new Date(),
      reference: `VAT-SETTLE-${getFiscalYear(new Date())}`,
      description: 'Monthly VAT Settlement (IRD Rule H)',
      fiscalYear: getFiscalYear(new Date()),
      miti: adToBikramSambat(new Date()),
      lines,
      company: companyId,
      isSystem: true,
      irdPayload: {
        settlementType: 'vat_settlement',
        outputVat: outputVatBalance,
        inputVat: inputVatBalance,
        netPayable: round100(netPayable),
        netCreditCarryForward: round100(netCredit),
      },
    });

    if (outputVat) await Account.updateOne({ _id: outputVat._id, ...companyFilter }, { $inc: { balance: -outputVatBalance } });
    if (inputVat) await Account.updateOne({ _id: inputVat._id, ...companyFilter }, { $inc: { balance: -inputVatBalance } });
    if (netPayable > 0 && bankAccount) await Account.updateOne({ _id: bankAccount._id, ...companyFilter }, { $inc: { balance: -netPayable } });
    if (netCredit > 0 && vatCarryForward) await Account.updateOne({ _id: vatCarryForward._id, ...companyFilter }, { $inc: { balance: netCredit } });

    return {
      settled: true,
      outputVat: outputVatBalance,
      inputVat: inputVatBalance,
      netPayable: round100(netPayable),
      netCreditCarryForward: round100(netCredit),
    };
  }

  return { settled: false, reason: 'Debit/Credit mismatch in VAT settlement' };
}

module.exports = { runVatSettlement };
