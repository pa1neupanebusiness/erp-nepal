import { escapeHtml } from './printEntry';
import { adToBsStr } from './NepaliDatePicker';
import { openPrintWindow } from './printCommon';

const num = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function bsDateStr(date) {
  try {
    const bs = adToBsStr(new Date(date));
    return bs || new Date(date).toISOString().slice(0, 10);
  } catch {
    try { return new Date(date).toISOString().slice(0, 10); } catch { return ''; }
  }
}

function isDebitNormal(type) {
  return ['asset', 'expense', 'contra_revenue', 'contra_asset'].includes(type);
}

// Signed balance -> "X,XXX.00 Dr" / "X,XXX.00 Cr"
function balLabel(signed, type) {
  const normal = isDebitNormal(type);
  const abs = Math.abs(signed);
  if (abs === 0) return '0.00';
  if (normal) return signed >= 0 ? `${num(abs)} Dr` : `${num(abs)} Cr`;
  return signed >= 0 ? `${num(abs)} Cr` : `${num(abs)} Dr`;
}

function vchType(desc) {
  const d = (desc || '').toLowerCase();
  if (d.includes('opening')) return '-';
  if (d.includes('payment received') || d.includes('receipt')) return 'Receipt';
  if (d.includes('sales return')) return 'Sales Return';
  if (d.includes('purchase return')) return 'Purch Return';
  if (d.includes('sale')) return 'Sales';
  if (d.includes('purchase') || d.includes('khareed')) return 'Purchase';
  if (d.includes('payment') || d.includes('paid')) return 'Payment';
  if (d.includes('journal')) return 'Journal';
  if (d.includes('contra')) return 'Contra';
  return 'Entry';
}

export function renderLedgerHtml(ledger, company, opts = {}) {
  const acc = ledger?.account || {};
  const entries = ledger?.entries || [];
  const type = acc.type;

  const periodLabel = opts.periodLabel
    || (ledger?.fiscalYear?.name ? `FY ${ledger.fiscalYear.name}` : 'All Time');

  const rows = entries.map((e) => {
    if (e._id === 'opening') {
      return `<tr class="summary-row">
        <td class="text-center">${escapeHtml(bsDateStr(e.date))}</td>
        <td class="text-center">-</td>
        <td class="text-center">-</td>
        <td><strong>Opening Balance</strong></td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right">${balLabel(ledger.openingBalance || 0, type)}</td>
      </tr>`;
    }
    return `<tr>
      <td class="text-center">${escapeHtml(bsDateStr(e.date))}</td>
      <td class="text-center">${vchType(e.description)}</td>
      <td class="text-center">${escapeHtml(e.reference || '-')}</td>
      <td>${escapeHtml(e.description)}</td>
      <td class="text-right">${e.debit > 0 ? num(e.debit) : '-'}</td>
      <td class="text-right">${e.credit > 0 ? num(e.credit) : '-'}</td>
      <td class="text-right">${balLabel(e.balance, type)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="text-center">No entries for this account</td></tr>';

  const txns = entries.filter(e => e._id !== 'opening');
  const totalDebit = txns.reduce((s, e) => s + (e.debit || 0), 0);
  const totalCredit = txns.reduce((s, e) => s + (e.credit || 0), 0);

  const accountTypeLabel = (type || '').replace('_', ' ');

  return `
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; margin: 0; padding: 0; }
    .ledger-container { width: 100%; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
    .company-title { font-size: 18px; font-weight: bold; text-transform: uppercase; }
    .report-title { font-size: 14px; font-weight: bold; margin-top: 5px; text-decoration: underline; }
    .meta-grid { display: flex; gap: 20px; margin-bottom: 12px; line-height: 1.4; }
    table.ledger-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    table.ledger-table th, table.ledger-table td { border: 1px solid #000; padding: 5px 6px; white-space: nowrap; }
    table.ledger-table th { background-color: #f2f2f2; font-weight: bold; text-align: center; }
    table.ledger-table td:nth-child(4) { white-space: normal; word-break: break-word; max-width: 200px; overflow-wrap: break-word; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .summary-row { background-color: #f9f9f9; font-weight: bold; }
    .summary-row td { white-space: nowrap; }
    .closing-row { background-color: #e6e6e6; font-weight: bold; border-top: 2px solid #000; }
    .closing-row td { white-space: nowrap; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
  <div class="ledger-container">
    <div class="header">
      <div class="company-title">${escapeHtml(company?.name || '')}</div>
      <div>${escapeHtml([company?.address, company?.pan ? 'PAN: ' + company.pan : null].filter(Boolean).join(' | ') || '')}</div>
      <div class="report-title">PARTY STATEMENT / LEDGER ACCOUNT</div>
    </div>

    <div class="meta-grid">
      <div>
        <strong>Party Name:</strong> ${escapeHtml(acc.name || '-')}<br>
        <strong>Address:</strong> ${escapeHtml(acc.address || '-')}<br>
        <strong>PAN No:</strong> ${escapeHtml(acc.pan || acc.taxId || '-')}
      </div>
      <div class="text-right">
        <strong>Statement Period:</strong> ${escapeHtml(periodLabel)}<br>
        <strong>Printed On:</strong> ${escapeHtml(bsDateStr(new Date()))}<br>
        <strong>Account Type:</strong> ${escapeHtml(accountTypeLabel || '-')}
      </div>
    </div>

    <table class="ledger-table">
      <thead>
        <tr>
          <th style="width: 10%;">Date (BS)</th>
          <th style="width: 10%;">Vch Type</th>
          <th style="width: 10%;">Vch No</th>
          <th>Particulars</th>
          <th style="width: 13%;">Debit (Dr) Rs.</th>
          <th style="width: 13%;">Credit (Cr) Rs.</th>
          <th style="width: 15%;">Balance Rs.</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="summary-row">
          <td colspan="4" class="text-right"><strong>Total Period Movement:</strong></td>
          <td class="text-right">${num(totalDebit)}</td>
          <td class="text-right">${num(totalCredit)}</td>
          <td class="text-right">-</td>
        </tr>
        <tr class="closing-row">
          <td colspan="4" class="text-right"><strong>Closing Balance:</strong></td>
          <td colspan="3" class="text-right"><strong>${balLabel(ledger.currentBalance || 0, type)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div style="display: flex; justify-content: space-between; margin-top: 40px;">
      <div style="border-top: 1px solid #000; width: 30%; text-align: center; padding-top: 4px;">Prepared By</div>
      <div style="border-top: 1px solid #000; width: 30%; text-align: center; padding-top: 4px;">Authorized Signatory</div>
    </div>
  </div>`;
}

export function printLedger(ledger, company, opts = {}) {
  if (!ledger) return;
  if (!company) company = JSON.parse(localStorage.getItem('user') || '{}').company || {};
  openPrintWindow({
    title: `Ledger Statement - ${ledger?.account?.name || ''}`,
    company,
    docTitle: 'Party Ledger Statement',
    bodyHtml: renderLedgerHtml(ledger, company, opts),
  });
}
