import { escapeHtml, formatNPR, formatDate } from './printEntry';
import { openPrintWindow } from './printCommon';
import { amountToWords } from '../../utils/numberToWords';

export function printEmiRecord(i, companyArg) {
  const e = i.emiData || i;
  const company = companyArg || JSON.parse(localStorage.getItem('user') || '{}').company || {};
  const bankLabel = e.bankName ? `EMI-(${e.bankName})` : '-';
  const exch = e.exchangeEnabled ? (e.exchangeAmount || 0) : 0;

  const totalDown = (e.downPayment || 0) + (exch > 0 ? exch : 0);
  const downParts = [];
  if (exch > 0) downParts.push(`Exchange ${formatNPR(exch)}`);
  if (e.downPayment > 0) downParts.push(`Cash ${formatNPR(e.downPayment)}`);

  const rows = [];
  rows.push(`<tr><td>Product (${escapeHtml(e.product?.name || 'Unknown')}${e.product?.hsCode ? ' [' + escapeHtml(e.product.hsCode) + ']' : ''})</td><td class="text-right">${formatNPR(e.productTotal)}</td></tr>`);
  if (e.vatAmount > 0) rows.push(`<tr><td>VAT (${e.vatRate || 13}%)</td><td class="text-right">${formatNPR(e.vatAmount)}</td></tr>`);
  if (exch > 0) {
    rows.push(`<tr><td>Trade-in / Exchange</td><td class="text-right">${formatNPR(-exch)}</td></tr>`);
    (e.exchangeItems || []).forEach(it => {
      const name = it.product?.name || 'Exchange item';
      const detail = `${it.quantity} x ${formatNPR(it.price)}`;
      rows.push(`<tr class="sub-row"><td colspan="2" class="text-right">${escapeHtml(name)} (${escapeHtml(detail)})</td></tr>`);
    });
  }
  rows.push(`<tr><td><strong>Net Amount</strong></td><td class="text-right"><strong>${formatNPR(e.netAmount ?? (e.productTotal - exch))}</strong></td></tr>`);
  if (totalDown > 0) {
    rows.push(`<tr><td>Less: Down Payment (${escapeHtml(downParts.join(' + '))})</td><td class="text-right">${formatNPR(-totalDown)}</td></tr>`);
  }
  rows.push(`<tr class="closing-row"><td><strong>Receivable Balance${bankLabel !== '-' ? ` via ${escapeHtml(bankLabel)}` : ''}</strong></td><td class="text-right"><strong>${formatNPR(e.remainingAmount)}</strong></td></tr>`);

  const bodyHtml = `
    <div class="emi-meta">
      <div><span class="mlabel">EMI No:</span> <span class="mvalue">${escapeHtml(e.emiNumber || i.invoiceNumber || '-')}</span></div>
      <div><span class="mlabel">Date:</span> <span class="mvalue">${escapeHtml(formatDate(e.createdAt || i.createdAt))}</span></div>
      <div><span class="mlabel">Customer:</span> <span class="mvalue">${escapeHtml(e.customer?.name || e.customerName || '-')}</span></div>
      <div><span class="mlabel">Customer PAN:</span> <span class="mvalue">${escapeHtml(e.customer?.pan || e.customerPan || '-')}</span></div>
      <div><span class="mlabel">Bank / Finance:</span> <span class="mvalue">${escapeHtml(bankLabel)}</span></div>
      <div><span class="mlabel">Cashier:</span> <span class="mvalue">${escapeHtml(e.createdBy?.name || '-')}</span></div>
      <div style={{ marginTop: '0.5rem' }}>
        <span class="mlabel">Company PAN:</span> <span class="mvalue">${escapeHtml(company?.pan || '-')}</span>
        <span class="mlabel">VAT:</span> <span class="mvalue">${company?.vatRate || 13}%</span>
        <span class="mlabel">Address:</span> <span class="mvalue">${escapeHtml(company?.address || '-')}, ${escapeHtml(company?.city || '')}</span>
      </div>
    </div>
    <table class="data-table">
      <thead><tr><th>Particulars</th><th class="text-right">Amount (Rs.)</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <div class="words">Amount in Words: ${escapeHtml(amountToWords(e.netAmount ?? (e.productTotal - exch)))}</div>
  `;

  openPrintWindow({
    title: 'EMI Hire Purchase Details',
    company,
    docTitle: 'EMI Hire Purchase Details',
    bodyHtml,
  });
}
