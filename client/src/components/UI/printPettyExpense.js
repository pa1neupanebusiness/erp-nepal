import { escapeHtml, formatNPR, formatDate } from './printEntry';
import { openPrintWindow } from './printCommon';
import { amountToWords } from '../../utils/numberToWords';

export function printPettyExpense(e, companyArg) {
  const company = companyArg || JSON.parse(localStorage.getItem('user') || '{}').company || {};

  const bodyHtml = `
    <div class="emi-meta">
      <div><span class="mlabel">Date:</span> <span class="mvalue">${escapeHtml(formatDate(e.date))}</span></div>
      <div><span class="mlabel">Category:</span> <span class="mvalue">${escapeHtml(e.category || '-')}</span></div>
      <div><span class="mlabel">Payment:</span> <span class="mvalue">${escapeHtml(e.paymentMethod || '-')}</span></div>
      <div><span class="mlabel">Receipt:</span> <span class="mvalue">${escapeHtml(e.receiptNumber || '-')}</span></div>
      <div><span class="mlabel">Status:</span> <span class="mvalue">${escapeHtml(e.status || '-')}</span></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Description</th><th class="text-right">Amount (Rs.)</th></tr></thead>
      <tbody>
        <tr><td>${escapeHtml(e.description || '-')}</td><td class="text-right">${formatNPR(e.amount)}</td></tr>
      </tbody>
      <tfoot>
        <tr class="closing-row"><td class="text-right"><strong>Total</strong></td><td class="text-right"><strong>${formatNPR(e.amount)}</strong></td></tr>
      </tfoot>
    </table>
    <div class="words">Amount in Words: ${escapeHtml(amountToWords(e.amount))}</div>
  `;

  openPrintWindow({
    title: 'Petty Expense',
    company,
    docTitle: 'Petty Expense',
    bodyHtml,
  });
}
