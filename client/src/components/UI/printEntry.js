import { openPrintWindow } from './printCommon';

export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatNPR(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN');
}

export function renderTaxInvoice(invoice) {
  const safe = (v) => escapeHtml(v);
  const safeNum = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lineItems = (invoice.lineItems || []).map(item => `
 - ${safe(item.name)} x ${item.qty} @ ${safeNum(item.rate)} (Tax: ${safeNum(item.vatAmount)} NPR)`).join('\n');

  return `==================================================
                TAX INVOICE (कर बिजक)
 ==================================================
Seller: ${safe(invoice.sellerName || '')}  PAN: ${safe(invoice.sellerPan || '')}
${safe(invoice.sellerAddress || '')}
 --------------------------------------------------
Invoice No: ${safe(invoice.invoiceNumber || '')}
Date:       ${safe(invoice.dateAD || '')}
Transaction Mode: ${safe(invoice.paymentType || '')}
 --------------------------------------------------
Buyer Name: ${safe(invoice.buyerName || 'N/A')}
Buyer PAN:  ${safe(invoice.buyerPAN || 'N/A')}
 --------------------------------------------------
Line Items Summary:
${lineItems || ' - No items'}
 --------------------------------------------------
${invoice.taxableAmount ? `Taxable Amount:   NPR ${safeNum(invoice.taxableAmount)}` : ''}
${invoice.exemptAmount ? `Exempt Amount:    NPR ${safeNum(invoice.exemptAmount)}` : ''}
${invoice.vatAmountTotal ? `Value Added Tax:  NPR ${safeNum(invoice.vatAmountTotal)}` : ''}
 --------------------------------------------------
GRAND TOTAL:      NPR ${safeNum(invoice.grandTotal)}
 ==================================================
Issued by: ${safe(invoice.issuedBy || '')}
 ==================================================`;
}

export function printEntry({ title, subtitle, meta = [], columns = [], rows = [], footer = [], thermal = false, miti = '', adDate = '', sellerPan = '', buyerPan = '' }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const company = user.company || {};

  const metaHtml = meta.map(m =>
    `<div class="meta-item"><span class="mlabel">${escapeHtml(m.label)}:</span> <span class="mvalue">${escapeHtml(m.value)}</span></div>`
  ).join('');

  const thead = columns.length
    ? `<thead><tr>${columns.map(c => `<th class="${c.align === 'right' ? 'text-right' : ''}${c.wide ? ' wide' : ''}">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>`
    : '';

  const rowsHtml = rows.length
    ? rows.map((r) => `<tr>${columns.map(c => {
        const val = r[c.key];
        return `<td class="${c.align === 'right' ? 'text-right' : ''}${c.wide ? ' wide' : ''}">${c.render ? c.render(val) : escapeHtml(val)}</td>`;
      }).join('')}</tr>`).join('')
    : `<tr><td colspan="${Math.max(columns.length, 1)}" class="text-center">No data</td></tr>`;

  const footerHtml = footer.length
    ? footer.map(f => {
        if (f.sub) {
          return `<tr class="sub-row"><td colspan="${columns.length}" class="text-right">${escapeHtml(f.label)}</td></tr>`;
        }
        const span = Math.max(columns.length - 1, 1);
        return `<tr><td colspan="${span}" class="text-right">${escapeHtml(f.label)}</td><td class="text-right">${f.render ? f.render(f.value) : escapeHtml(f.value)}</td></tr>`;
      }).join('')
    : '';

  const bodyHtml = `
    <div class="meta-list">
      ${metaHtml}
    </div>
    <table class="data-table">
      ${thead}
      <tbody>${rowsHtml}</tbody>
      ${footerHtml ? `<tfoot>${footerHtml}</tfoot>` : ''}
    </table>
    ${!thermal ? `<div class="signatures">
       <div class="sig-line">Prepared By</div>
       <div class="sig-line">Authorized Signatory</div>
     </div>` : ''}
    ${sellerPan ? `<div class="vat-tag" style="text-align:center;margin-top:8px;">Seller PAN: ${escapeHtml(sellerPan)}${buyerPan ? ` | Buyer PAN: ${escapeHtml(buyerPan)}` : ''}</div>` : (buyerPan ? `<div class="vat-tag" style="text-align:center;margin-top:8px;">Buyer PAN: ${escapeHtml(buyerPan)}</div>` : '')}
  `;

  openPrintWindow({
    title,
    company,
    subtitle: subtitle ? `Ref: ${subtitle}` : '',
    docTitle: title,
    bodyHtml,
  });
}

