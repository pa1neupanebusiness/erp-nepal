const { round100 } = require('./dateUtils');

function immutableSort(arr) {
  return [...arr].sort((a, b) => {
    const ta = new Date(a._id?.timestamp || a.createdAt || a.date || a.dateAD || '').getTime();
    const tb = new Date(b._id?.timestamp || b.createdAt || b.date || b.dateAD || '').getTime();
    return ta - tb;
  });
}

function sanitizeString(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[-\s]/g, '');
  return /^\d{9}$/.test(cleaned) ? cleaned : null;
}

function mapInvoiceToDaybookEntry(doc, companyFilter) {
  const vatEnabled = process.env.VAT_ENABLED !== 'false';
  const taxableAmount = round100(doc.subtotal || 0);
  const vatAmount = vatEnabled ? round100(doc.taxTotal || 0) : 0;
  const exemptAmount = round100((doc.exemptAmount || 0));
  const grandTotal = round100(doc.grandTotal || 0);

  return {
    _id: doc._id,
    voucherNumber: doc.invoiceNumber || doc._id,
    dateAD: new Date(doc.createdAt || doc.date || new Date()).toISOString().split('T')[0],
    particulars: `${doc.customer?.name || 'Walk-in'} - Credit Sale`,
    panVatNumber: sanitizeString(doc.customer?.pan || doc.customerPan || ''),
    transactionType: 'Sales',
    taxableAmount,
    exemptAmount,
    vatAmount,
    totalAmount: grandTotal,
  };
}

function mapPurchaseToDaybookEntry(doc) {
  const taxableAmount = round100(doc.subtotal || 0);
  const vatAmount = round100(doc.tax || 0);
  const exemptAmount = round100(doc.exemptAmount || 0);
  const grandTotal = round100(doc.grandTotal || 0);

  return {
    _id: doc._id,
    voucherNumber: doc.purchaseNumber || doc._id,
    dateAD: new Date(doc.date || doc.createdAt || new Date()).toISOString().split('T')[0],
    particulars: `${doc.supplier?.name || 'Unknown Supplier'} - Purchase`,
    panVatNumber: sanitizeString(doc.supplier?.pan || ''),
    transactionType: 'Purchase',
    taxableAmount,
    exemptAmount,
    vatAmount,
    totalAmount: grandTotal,
  };
}

function mapVoucherToDaybookEntry(doc) {
  const totalAmount = round100(doc.amount || 0);
  const payments = doc.payments || [{ method: doc.paymentMethod, amount: doc.amount }];
  const tax = round100(doc.taxAmount || 0);
  const taxable = totalAmount - tax;

  return {
    _id: doc._id,
    voucherNumber: doc.voucherNumber,
    dateAD: new Date(doc.date || new Date()).toISOString().split('T')[0],
    particulars: `${doc.account?.name || 'Unknown'} - ${doc.type === 'receipt' ? 'Receipt' : 'Payment'} ${doc.description || ''}`,
    panVatNumber: null,
    transactionType: doc.type === 'receipt' ? 'Receipt' : 'Payment',
    taxableAmount: tax > 0 ? round100(taxable) : 0,
    exemptAmount: tax > 0 ? 0 : round100(totalAmount),
    vatAmount: round100(tax),
    totalAmount,
    payments: payments.map(p => ({ method: p.method, amount: round100(p.amount) })),
  };
}

function mapJournalToDaybookEntry(doc) {
  const totalDebit = round100(doc.lines?.reduce((s, l) => s + (l.debit || 0), 0) || 0);
  const totalCredit = round100(doc.lines?.reduce((s, l) => s + (l.credit || 0), 0) || 0);
  const balance = totalCredit - totalDebit;

  return {
    _id: doc._id,
    voucherNumber: doc.reference || doc._id,
    dateAD: new Date(doc.date || new Date()).toISOString().split('T')[0],
    particulars: doc.description || 'Journal Entry',
    panVatNumber: null,
    transactionType: 'Journal',
    taxableAmount: 0,
    exemptAmount: 0,
    vatAmount: 0,
    totalAmount: Math.abs(balance),
    isDebit: balance < 0,
    isCredit: balance > 0,
  };
}

async function generateDailyReport(targetDate, companyFilter = {}) {
  const Sale = require('../models/Sale');
  const Purchase = require('../models/Purchase');
  const Voucher = require('../models/Voucher');
  const JournalEntry = require('../models/JournalEntry');

  let dateQuery = {};
  if (targetDate) {
    const dateObj = new Date(targetDate);
    const nextDay = new Date(dateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    dateQuery = {
      createdAt: { $gte: dateObj, $lt: nextDay },
    };
  }

  const [sales, purchases, vouchers, journals] = await Promise.all([
    Sale.find({ ...companyFilter, status: { $in: ['completed', 'refunded'] }, ...dateQuery })
      .populate('customer', 'name pan'),
    Purchase.find({ ...companyFilter, ...dateQuery }),
    Voucher.find({ ...companyFilter, status: { $in: ['active', 'cancelled'] }, ...dateQuery })
      .populate('account', 'name'),
    JournalEntry.find({ ...companyFilter, ...dateQuery })
      .populate('lines.account', 'code name'),
  ]);

  let allEntries = [];

  for (const s of sales) {
    allEntries.push(mapInvoiceToDaybookEntry(s, companyFilter));
  }

  for (const p of purchases) {
    allEntries.push(mapPurchaseToDaybookEntry(p));
  }

  for (const v of vouchers) {
    allEntries.push(mapVoucherToDaybookEntry(v));
  }

  for (const j of journals) {
    allEntries.push(mapJournalToDaybookEntry(j));
  }

  allEntries = immutableSort(allEntries);

  const totals = allEntries.reduce((acc, entry) => {
    acc.totalDebit += entry.transactionType === 'Journal' && entry.isDebit ? entry.totalAmount : 0;
    acc.totalCredit += entry.transactionType === 'Journal' && entry.isCredit ? entry.totalAmount : 0;
    acc.totalSales += entry.transactionType === 'Sales' ? entry.totalAmount : 0;
    acc.totalPurchases += entry.transactionType === 'Purchase' ? entry.totalAmount : 0;
    acc.totalReceipts += entry.transactionType === 'Receipt' ? entry.totalAmount : 0;
    acc.totalPayments += entry.transactionType === 'Payment' ? entry.totalAmount : 0;
    acc.totalVat += entry.vatAmount || 0;
    acc.totalExempt += entry.exemptAmount || 0;
    return acc;
  }, {
    totalDebit: 0,
    totalCredit: 0,
    totalSales: 0,
    totalPurchases: 0,
    totalReceipts: 0,
    totalPayments: 0,
    totalVat: 0,
    totalExempt: 0,
  });

  Object.keys(totals).forEach(key => {
    totals[key] = round100(totals[key]);
  });

  totals.netCashFlow = round100(totals.totalReceipts - totals.totalPayments);

  return {
    dateAD: targetDate || new Date().toISOString().split('T')[0],
    entries: allEntries,
    summary: totals,
  };
}

function formatDaybookConsole(daybook) {
  if (!daybook?.entries) return 'No daybook data available';

  const headers = ['Voucher No.', 'Date', 'Particulars', 'PAN', 'Type', 'Taxable', 'Exempt', 'VAT', 'Total'];
  const colWidths = [16, 12, 30, 12, 10, 12, 10, 10, 12];

  function pad(str, width) {
    const s = String(str || '').slice(0, width);
    return s.padEnd(width);
  }

  function makeSeparator() {
    return '+' + colWidths.map(w => '-'.repeat(w + 3)).join('+') + '+';
  }

  let output = '\n';
  output += `= DAYBOOK REPORT - ${daybook.dateAD || 'All Dates'} =\n`;
  output += makeSeparator() + '\n';
  output += '| ' + headers.map((h, i) => pad(h, colWidths[i])).join(' | ') + ' |\n';
  output += makeSeparator() + '\n';

  daybook.entries.forEach(entry => {
    const row = [
      entry.voucherNumber || '',
      entry.dateAD || '',
      entry.particulars || '',
      entry.panVatNumber || '-',
      entry.transactionType || '',
      entry.taxableAmount || 0,
      entry.exemptAmount || 0,
      entry.vatAmount || 0,
      entry.totalAmount || 0,
    ];
    output += '| ' + row.map((v, i) => pad(v, colWidths[i])).join(' | ') + ' |\n';
  });

  output += makeSeparator() + '\n';
  output += '\n= SUMMARY =\n';
  output += `Total Sales:      NPR ${daybook.summary.totalSales.toFixed(2)}\n`;
  output += `Total Purchases:  NPR ${daybook.summary.totalPurchases.toFixed(2)}\n`;
  output += `Total Receipts:   NPR ${daybook.summary.totalReceipts.toFixed(2)}\n`;
  output += `Total Payments:   NPR ${daybook.summary.totalPayments.toFixed(2)}\n`;
  output += `Total VAT:        NPR ${daybook.summary.totalVat.toFixed(2)}\n`;
  output += `Total Exempt:     NPR ${daybook.summary.totalExempt.toFixed(2)}\n`;
  output += `Net Cash Flow:    NPR ${daybook.summary.netCashFlow.toFixed(2)}\n`;
  output += makeSeparator() + '\n';

  return output;
}

module.exports = {
  generateDailyReport,
  formatDaybookConsole,
  immutableSort,
  sanitizeString,
};
