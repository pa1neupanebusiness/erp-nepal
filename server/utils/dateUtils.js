function pad(n) { return n.toString().padStart(2, '0'); }

const bsMonthDays = [31, 31, 32, 31, 31, 32, 31, 30, 30, 30, 29, 30];

function adToBikramSambat(adDate) {
  if (!adDate) return '';
  const d = new Date(adDate);
  if (isNaN(d.getTime())) return '';

  const adYear = d.getFullYear();
  const adMonth = d.getMonth() + 1;
  const adDay = d.getDate();

  const daysInADMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((adYear % 4 === 0 && adYear % 100 !== 0) || adYear % 400 === 0) daysInADMonth[1] = 29;

  // Count total AD days from a known reference: Baisakh 1, 2082 = April 14, 2025
  const refAD = new Date(2025, 3, 14);
  const targetAD = new Date(adYear, adMonth - 1, adDay);
  let diffDays = Math.round((targetAD - refAD) / 86400000);

  // Start from BS 2082, month 1 (Baisakh), day 1
  let bsYear = 2082, bsMonth = 0, bsDay = 1;

  if (diffDays >= 0) {
    // Forward from reference
    bsDay += diffDays;
    while (bsDay > bsMonthDays[bsMonth]) {
      bsDay -= bsMonthDays[bsMonth];
      bsMonth++;
      if (bsMonth >= 12) { bsMonth = 0; bsYear++; }
    }
  } else {
    // Backward from reference
    diffDays = -diffDays;
    bsDay -= diffDays;
    while (bsDay <= 0) {
      bsMonth--;
      if (bsMonth < 0) { bsMonth = 11; bsYear--; }
      bsDay += bsMonthDays[bsMonth];
    }
  }

  bsMonth++; // Convert to 1-indexed
  return `${bsYear}-${pad(bsMonth)}-${pad(bsDay)}`;
}

function getBSFiscalYear(date) {
  const adDate = date ? new Date(date) : new Date();
  const adYear = adDate.getFullYear();
  // BS calendar is approximately AD year + 57
  // Fiscal year in Nepal starts mid-April (Baisakh), so:
  // If AD month is April (4) or later, fiscal year = AD year + 57 : (AD year + 58)
  // If AD month is before April, fiscal year = (AD year - 1) + 57 : (AD year + 57)
  const bsBaseYear = adYear + 57;
  const fiscalLabel = adDate.getMonth() >= 3 ? `${bsBaseYear}/${String(bsBaseYear + 1).slice(-2)}` : `${bsBaseYear - 1}/${String(bsBaseYear).slice(-2)}`;
  const startYear = bsBaseYear;
  const endYear = bsBaseYear + 1;
  return { startYear, endYear, label: fiscalLabel };
}

function formatNPR(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function round100(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

function buildIRDPayload({ invoiceNumber, miti, adDate, transactionType, seller, buyer, items, totals, printerMeta }) {
  return {
    invoiceNumber: invoiceNumber || '',
    miti: miti || adToBikramSambat(adDate) || '',
    adDate: adDate || new Date().toISOString().split('T')[0],
    transactionType: transactionType || 'cash',
    seller: {
      name: seller?.name || '',
      pan: seller?.pan || '',
      address: seller?.address || '',
      mobile: seller?.mobile || '',
    },
    buyer: {
      name: buyer?.name || '',
      pan: buyer?.pan || '',
      address: buyer?.address || '',
    },
    items: items || [],
    totals: {
      totalGrossAmount: round100(totals?.totalGrossAmount || 0),
      nonTaxableAmount: round100(totals?.nonTaxableAmount || 0),
      taxableAmount: round100(totals?.taxableAmount || 0),
      vatAmount: round100(totals?.vatAmount || 0),
      grandTotal: round100(totals?.grandTotal || 0),
    },
    printerMeta: printerMeta || { printerName: '', user: '', software: 'ERP-Nepal' },
  };
}

module.exports = {
  pad,
  adToBikramSambat,
  getBSFiscalYear,
  formatNPR,
  round100,
  buildIRDPayload,
};
