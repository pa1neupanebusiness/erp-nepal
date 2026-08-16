const DayBookEntry = require('../models/DayBookEntry');
const DayBookSequence = require('../models/DayBookSequence');
const { getMiti, writeAuditLog, getLastAuditHash } = require('./irdAudit');

function getFiscalYear(date) {
  const d = new Date(date);
  const adYear = d.getFullYear();
  const m = d.getMonth() + 1, dy = d.getDate();
  // Nepal BS fiscal year: BS year = AD year + 57, starts mid-April (Baisakh)
  const bsYear = adYear + 57;
  // If month is April (4) or later (or April 15+), fiscal year = bsYear : bsYear+1
  // If month is before April, fiscal year = (bsYear-1) : bsYear
  // Return last two digits format to match getBSFiscalYear label format
  const label = (m > 4 || (m === 4 && dy >= 15)) ? `${bsYear}/${String(bsYear + 1).slice(-2)}` : `${bsYear - 1}/${String(bsYear).slice(-2)}`;
  return label;
}

async function nextEntryNumbers(companyId, count) {
  const year = new Date().getFullYear();
  const seq = await DayBookSequence.findOneAndUpdate(
    { company: companyId, year },
    { $inc: { seq: count } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const start = seq.seq - count + 1;
  const numbers = [];
  for (let i = 0; i < count; i++) {
    numbers.push(`DB-${year}-${String(start + i).padStart(5, '0')}`);
  }
  return numbers;
}

async function postDaybookEntries({ companyId, date, sourceModule, daybookType, documentNumber, sourceRef, narration, lines, createdBy, actionTimestamp, journalEntryId }) {
  const validLines = (lines || []).filter(l => (l.debit || 0) !== 0 || (l.credit || 0) !== 0);
  if (validLines.length === 0) return [];

  const entryNumbers = await nextEntryNumbers(companyId, validLines.length);
  const ts = new Date(date || new Date());
  const nepalTs = new Date(ts.getTime() + (ts.getTimezoneOffset() || 0) * 60000 + 5.75 * 3600000);
  const miti = getMiti(nepalTs);

  const docs = validLines.map((line, i) => ({
    company: companyId,
    entryNumber: entryNumbers[i],
    daybookType: daybookType || 'GENERAL_JOURNAL',
    gregorianDate: ts,
    miti,
    fiscalYear: getFiscalYear(ts),
    sourceModule,
    documentNumber,
    sourceRef: sourceRef || documentNumber,
    journalEntryId: journalEntryId || null,
    accountRef: line.account || null,
    accountName: line.accountName || '',
    partyType: line.partyType || 'none',
    partyId: line.partyId || null,
    partyName: line.partyName || '',
    narration: narration || '',
    debitAmount: Math.round((line.debit || 0) * 100) / 100,
    creditAmount: Math.round((line.credit || 0) * 100) / 100,
    entryType: 'ORIGINAL',
    status: 'POSTED',
    createdBy: createdBy || null,
  }));

  const created = await DayBookEntry.insertMany(docs);
  await writeAuditLog({
    companyId,
    actionType: 'INSERT',
    moduleName: sourceModule,
    recordId: sourceRef || documentNumber,
    documentNumber,
    miti,
    actionTimestamp: ts,
    userId: createdBy || null,
    newData: docs.map(d => ({ entryNumber: d.entryNumber, daybookType: d.daybookType, accountName: d.accountName, debit: d.debitAmount, credit: d.creditAmount, narration: d.narration })),
  });
  return created;
}

async function cancelDaybookEntries({ companyId, sourceModule, documentNumber, createdBy, reason }) {
  const originals = await DayBookEntry.find({ company: companyId, sourceModule, documentNumber, status: 'POSTED', entryType: 'ORIGINAL' }).sort({ entryNumber: 1 });
  if (originals.length === 0) return { cancelled: [], reversals: [] };

  const snapshot = originals.map(d => ({ entryNumber: d.entryNumber, accountName: d.accountName, debit: d.debitAmount, credit: d.creditAmount }));

  for (const doc of originals) {
    doc.status = 'CANCELLED';
    await doc.save();
  }

  const reversalLines = originals.map(d => ({
    account: d.accountRef,
    accountName: d.accountName,
    partyType: d.partyType,
    partyId: d.partyId,
    partyName: d.partyName,
    debit: d.creditAmount,
    credit: d.debitAmount,
  }));

  const ts = new Date();
  const reversalNumbers = await nextEntryNumbers(companyId, reversalLines.length);
  const miti = getMiti(ts);
  const reversalDocs = reversalLines.map((line, i) => ({
    company: companyId,
    entryNumber: reversalNumbers[i],
    daybookType: originals[i]?.daybookType || 'GENERAL_JOURNAL',
    gregorianDate: ts,
    miti,
    fiscalYear: getFiscalYear(ts),
    sourceModule,
    documentNumber: `CNCL-${documentNumber}`,
    sourceRef: originals[i]?.sourceRef || documentNumber,
    accountRef: line.account || null,
    accountName: line.accountName || '',
    partyType: line.partyType || 'none',
    partyId: line.partyId || null,
    partyName: line.partyName || '',
    narration: `Cancellation of ${documentNumber}${reason ? ' - ' + reason : ''}`,
    debitAmount: Math.round((line.debit || 0) * 100) / 100,
    creditAmount: Math.round((line.credit || 0) * 100) / 100,
    entryType: 'REVERSAL',
    status: 'POSTED',
    createdBy: createdBy || null,
  }));

  const reversals = await DayBookEntry.insertMany(reversalDocs);

  await writeAuditLog({
    companyId,
    actionType: 'CANCEL',
    moduleName: sourceModule,
    recordId: originals[0]?.sourceRef || documentNumber,
    documentNumber,
    miti,
    actionTimestamp: ts,
    userId: createdBy || null,
    oldData: snapshot,
    newData: { status: 'CANCELLED', reversalEntries: reversals.map(r => r.entryNumber) },
  });

  return { cancelled: originals, reversals };
}

async function logPrint({ companyId, moduleName, documentNumber, userId, userName, terminalIp, copyCount, actionTimestamp }) {
  return writeAuditLog({
    companyId,
    actionType: 'PRINT',
    moduleName,
    documentNumber,
    actionTimestamp: actionTimestamp || new Date(),
    userId,
    userName,
    terminalIp,
    newData: { copyCount: copyCount || 1, printedBy: userName || '' },
  });
}

function parseSequenceNumber(entryNumber) {
  const m = String(entryNumber).match(/^DB-(\d{4})-(\d{5})$/);
  if (!m) return null;
  return { year: Number(m[1]), seq: Number(m[2]) };
}

async function getDaybookReport({ companyId, date, fiscalYear, from, to, fiscalRange, daybookType }) {
  const filter = { company: companyId };
  if (daybookType) filter.daybookType = daybookType;
  if (from && to) {
    filter.gregorianDate = { $gte: new Date(from + 'T00:00:00+05:45'), $lte: new Date(to + 'T23:59:59+05:45') };
  } else if (date) {
    filter.gregorianDate = { $gte: new Date(date + 'T00:00:00+05:45'), $lte: new Date(date + 'T23:59:59+05:45') };
  } else if (fiscalRange && (fiscalRange.$gte || fiscalRange.$lte)) {
    const gte = fiscalRange.$gte ? new Date(fiscalRange.$gte) : null;
    const lte = fiscalRange.$lte ? new Date(fiscalRange.$lte) : null;
    filter.gregorianDate = {};
    if (gte) filter.gregorianDate.$gte = gte;
    if (lte) filter.gregorianDate.$lte = lte;
  }
  if (fiscalYear) filter.fiscalYear = fiscalYear;

  const entries = await DayBookEntry.find(filter).sort({ entryNumber: -1 });

  function formatNepalDate(d) {
    if (!d) return '';
    const utc = d.getTime() + (d.getTimezoneOffset() || 0) * 60000;
    const nepal = new Date(utc + 5.75 * 3600000);
    const y = nepal.getFullYear();
    const m = String(nepal.getMonth() + 1).padStart(2, '0');
    const dy = String(nepal.getDate()).padStart(2, '0');
    return `${y}-${m}-${dy}`;
  }

  const summary = entries.reduce((acc, e) => {
    acc.totalDebit += e.debitAmount || 0;
    acc.totalCredit += e.creditAmount || 0;
    acc.modules[e.sourceModule] = (acc.modules[e.sourceModule] || 0) + ((e.debitAmount || 0) - (e.creditAmount || 0));
    if (e.status === 'CANCELLED') acc.cancelled += 1;
    return acc;
  }, { totalDebit: 0, totalCredit: 0, cancelled: 0, modules: {} });

  summary.netFlow = summary.totalDebit - summary.totalCredit;

  let gaps = [];
  if (entries.length > 0) {
    const seqs = entries
      .map(e => parseSequenceNumber(e.entryNumber))
      .filter(Boolean)
      .sort((a, b) => (a.year === b.year ? a.seq - b.seq : a.year - b.year));
    if (seqs.length > 0) {
      const minSeq = seqs[0];
      const maxSeq = seqs[seqs.length - 1];
      const expected = maxSeq.seq - minSeq.seq + 1;
      if (expected > seqs.length) {
        const present = new Set(seqs.map(s => `${s.year}-${s.seq}`));
        for (let s = minSeq.seq; s <= maxSeq.seq; s++) {
          if (!present.has(`${minSeq.year}-${s}`)) gaps.push(`DB-${minSeq.year}-${String(s).padStart(5, '0')}`);
        }
      }
    }
  }

  const lastHash = await getLastAuditHash(companyId);

  return {
    dateAD: date || (from ? `${from} to ${to}` : 'All Dates'),
    miti: date ? getMiti(new Date(date + 'T00:00:00+05:45')) : '',
    entries: entries.map(e => ({
      _id: e._id,
      journalEntryId: e.journalEntryId,
      entryNumber: e.entryNumber,
      daybookType: e.daybookType,
      dateAD: formatNepalDate(e.gregorianDate),
      miti: e.miti || getMiti(e.gregorianDate),
      sourceModule: e.sourceModule,
      documentNumber: e.documentNumber,
      accountName: e.accountName,
      partyName: e.partyName,
      narration: e.narration,
      debit: e.debitAmount,
      credit: e.creditAmount,
      entryType: e.entryType,
      status: e.status,
    })),
    summary,
    gaps,
    integrity: { lastHash },
  };
}

module.exports = {
  getFiscalYear,
  nextEntryNumbers,
  postDaybookEntries,
  cancelDaybookEntries,
  logPrint,
  getDaybookReport,
};
