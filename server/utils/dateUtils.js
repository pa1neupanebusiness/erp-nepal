function pad(n) { return n.toString().padStart(2, '0'); }

function adToBikramSambat(adDate) {
  if (!adDate) return '';
  const d = new Date(adDate);
  if (isNaN(d.getTime())) return '';

  const adYear = d.getFullYear();
  const adMonth = d.getMonth() + 1;
  const adDay = d.getDate();

  const bsMonthsInYear = [31, 31, 32, 31, 31, 32, 31, 30, 30, 30, 29, 30];
  const adStart = {
    2000: { bsYear: 1942, bsMonth: 3, bsDay: 1 },
    2001: { bsYear: 1943, bsMonth: 3, bsDay: 1 },
    2002: { bsYear: 1944, bsMonth: 3, bsDay: 1 },
    2003: { bsYear: 1945, bsMonth: 3, bsDay: 1 },
    2004: { bsYear: 1946, bsMonth: 3, bsDay: 1 },
    2005: { bsYear: 1947, bsMonth: 3, bsDay: 1 },
    2006: { bsYear: 1948, bsMonth: 3, bsDay: 1 },
    2007: { bsYear: 1949, bsMonth: 3, bsDay: 1 },
    2008: { bsYear: 1950, bsMonth: 3, bsDay: 1 },
    2009: { bsYear: 1951, bsMonth: 3, bsDay: 1 },
    2010: { bsYear: 1952, bsMonth: 3, bsDay: 1 },
    2011: { bsYear: 1953, bsMonth: 3, bsDay: 1 },
    2012: { bsYear: 1954, bsMonth: 3, bsDay: 1 },
    2013: { bsYear: 1955, bsMonth: 3, bsDay: 1 },
    2014: { bsYear: 1956, bsMonth: 3, bsDay: 1 },
    2015: { bsYear: 1957, bsMonth: 3, bsDay: 1 },
    2016: { bsYear: 1958, bsMonth: 3, bsDay: 1 },
    2017: { bsYear: 1959, bsMonth: 3, bsDay: 1 },
    2018: { bsYear: 1960, bsMonth: 3, bsDay: 1 },
    2019: { bsYear: 1961, bsMonth: 3, bsDay: 1 },
    2020: { bsYear: 1962, bsMonth: 3, bsDay: 1 },
    2021: { bsYear: 1963, bsMonth: 3, bsDay: 1 },
    2022: { bsYear: 1964, bsMonth: 3, bsDay: 1 },
    2023: { bsYear: 1965, bsMonth: 3, bsDay: 1 },
    2024: { bsYear: 1966, bsMonth: 3, bsDay: 1 },
    2025: { bsYear: 1967, bsMonth: 3, bsDay: 1 },
  };

  let bsYear, bsMonth, bsDay;
  const start = adStart[adYear] || { bsYear: 1966, bsMonth: 3, bsDay: 1 };
  bsYear = start.bsYear;
  bsMonth = start.bsMonth;
  bsDay = start.bsDay;

  const daysInADMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((adYear % 4 === 0 && adYear % 100 !== 0) || adYear % 400 === 0) daysInADMonth[1] = 29;

  for (let m = 0; m < adMonth - 1; m++) {
    bsDay += daysInADMonth[m];
  }
  bsDay += adDay;

  bsMonth--;
  bsDay--;

  for (let i = 0; i < bsDay; i++) {
    const daysInMonth = bsMonthsInYear[bsMonth] || 30;
    if (bsDay > daysInMonth) {
      bsDay -= daysInMonth;
      bsMonth++;
      if (bsMonth >= 12) {
        bsMonth = 0;
        bsYear++;
      }
    }
  }
  bsMonth++;

  return `${bsYear}-${pad(bsMonth)}-${pad(bsDay)}`;
}

function getBSFiscalYear(date) {
  const bsStr = adToBikramSambat(date || new Date());
  if (!bsStr) return { startYear: 2083, endYear: 2084, label: '2083/84' };
  const [bsYearStr, bsMonthStr] = bsStr.split('-');
  const bsYear = parseInt(bsYearStr, 10);
  const bsMonth = parseInt(bsMonthStr, 10);
  if (bsMonth >= 4) {
    return { startYear: bsYear, endYear: bsYear + 1, label: `${bsYear}/${String(bsYear + 1).slice(-2)}` };
  }
  return { startYear: bsYear - 1, endYear: bsYear, label: `${bsYear - 1}/${String(bsYear).slice(-2)}` };
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
