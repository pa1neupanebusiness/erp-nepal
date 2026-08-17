import { adToBsStr } from '../UI/NepaliDatePicker';
import { amountToWords } from '../../utils/numberToWords';
import { escapeHtml } from '../UI/printEntry';
import { getSystemTime, formatTimestamp, isTimestampEnabled } from '../../utils/timeService';

const BS_MONTHS = ['Baishakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const num = (n) => 'Rs.\u00A0' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getMiti(date) {
  try {
    const bs = adToBsStr(new Date(date));
    if (!bs) return '';
    const [y, m, d] = bs.split('-').map(Number);
    return `${y} ${BS_MONTHS[(m || 1) - 1]} ${d}`;
  } catch { return ''; }
}

function paymentLabel(method) {
  const m = String(method || 'cash').toLowerCase();
  if (m === 'bank') return 'Cheque / Bank';
  if (m === 'qr') return 'QR / Bank Transfer';
  if (m === 'credit') return 'Credit';
  if (m === 'split') return 'Multiple';
  return 'Cash';
}

export async function printCourierInvoice(order, company) {
  const qty = order.quantity || 1;
  const weight = order.weight || 0;
  const unit = order.unit || 'pcs';
  const ratePerUnit = order.ratePerUnit || 0;
  const calcSubtotal = qty * weight * ratePerUnit;
  const vatRate = order.vatRate || company?.vatRate || 13;
  const isVatInclusive = !!order.inclusiveVat;
  const vatAmount = order.vatAmount || 0;
  const grandTotal = isVatInclusive ? (order.price || calcSubtotal) : (calcSubtotal + vatAmount);
  const discount = 0;

  const itemName = `Delivery Charge - ${order.deliveryType === 'international' ? 'International' : 'National'}`;

  const customerName = order.sender?.name || 'Sender';
  const customerAddress = order.sender?.address || '-';
  const customerPan = (order.sender?.pan || '').replace(/\D/g, '');
  const panDigits = customerPan.padEnd(9, ' ').slice(0, 9).split('');

  const sellerPan = (company?.pan || '').replace(/\D/g, '');
  const sellerPanDigits = sellerPan.padEnd(9, ' ').slice(0, 9).split('');
  const sellerPanBoxes = sellerPanDigits.map(d => `<div class="pan-box">${escapeHtml(d.trim())}</div>`).join('');
  const panBoxes = panDigits.map(d => `<div class="pan-box">${escapeHtml(d.trim())}</div>`).join('');

  const invoiceDate = order.sale?.createdAt || order.createdAt || new Date();
  const enDate = new Date(invoiceDate).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const miti = getMiti(invoiceDate);

  const qtyDisplay = `${qty} ${unit}`;

  const tsLine = isTimestampEnabled() ? (await getSystemTime()) : '';
  const companyName = (company?.name || 'Your Company').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const address = [company?.address, company?.city].filter(Boolean).join(', ');
  const phone = company?.phone || '-';
  const email = company?.email ? ` | ${company.email}` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${escapeHtml(order.sale?.invoiceNumber || '')}</title>
<style>
@page { size: A5 portrait; margin: 8mm; }
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 9px; color: #000; background-color: #fff; margin: 0; padding: 0; }
.invoice-container { width: 100%; margin: 0; padding: 6px; }
.header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
.company-title { font-size: 14px; font-weight: bold; text-transform: uppercase; white-space: nowrap; }
.company-detail { white-space: nowrap; font-size: 8px; line-height: 1.3; }
.doc-title { font-size: 12px; font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-top: 4px; }
.meta-section { margin-bottom: 8px; line-height: 1.6; font-size: 8px; }
.row-flex { display: flex; justify-content: space-between; align-items: center; }
.pan-boxes { display: inline-flex; vertical-align: middle; margin-left: 3px; }
.pan-box { width: 13px; height: 15px; border: 1px solid #000; margin-right: -1px; text-align: center; line-height: 15px; font-weight: bold; font-size: 8px; }
table.invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 8px; }
table.invoice-table th, table.invoice-table td { border: 1px solid #000; padding: 4px; vertical-align: top; }
table.invoice-table th { font-weight: bold; text-align: center; font-size: 7.5px; background-color: #f0f0f0; }
.col-sn { width: 5%; text-align: center; }
.col-hs { width: 10%; text-align: center; }
.col-particulars { width: 47%; }
.col-qty { width: 8%; text-align: center; }
.col-rate { width: 15%; text-align: right; }
.col-total { width: 15%; text-align: right; }
.text-center { text-align: center; }
.words-cell { padding: 6px !important; font-size: 7.5px; }
.words-title { font-weight: bold; margin-bottom: 6px; }
.words-dotted { border-bottom: 1px dotted #000; display: block; margin-top: 10px; width: 100%; height: 8px; }
.summary-table { width: 100%; border-collapse: collapse; font-size: 8px; }
.summary-table td { border: 1px solid #000; padding: 3px; }
.summary-label { font-weight: bold; text-align: left; white-space: nowrap; }
.summary-val { text-align: right; width: 40%; white-space: nowrap; }
.signatures-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 15px; font-size: 8px; }
.signature-box { text-align: center; }
.sig-line-dotted { border-bottom: 1px dotted #000; width: 100px; margin: 0 auto 3px auto; }
.footer-section { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px solid #000; }
.footer-text { font-size: 7px; color: #888; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } tr, td, th { page-break-inside: avoid; } }
</style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div class="company-title">${companyName}</div>
      <div class="company-detail">${address}</div>
      <div class="company-detail">Phone: ${phone}${email}</div>
      <div class="doc-title">Invoice</div>
    </div>
    <div class="meta-section">
      <div class="row-flex">
        <div><strong>Invoice No:</strong> ${escapeHtml(order.sale?.invoiceNumber || order.trackingNumber || '-')}</div>
        <div><strong>Date:</strong> ${escapeHtml(miti || enDate)} (${escapeHtml(enDate)})</div>
      </div>
      <div><strong>PAN No:</strong> <div class="pan-boxes">${sellerPanBoxes}</div></div>
      <div><strong>Customer Name:</strong> ${escapeHtml(customerName)}</div>
      <div><strong>Customer Address:</strong> ${escapeHtml(customerAddress)}</div>
      <div style="margin-top: 4px;">
        <strong>Customer PAN No:</strong>
        <div class="pan-boxes">${panBoxes}</div>
      </div>
      <div style="margin-top: 4px;">
        <strong>Mode of Payment:</strong> ${escapeHtml(paymentLabel(order.paymentMethod))}
      </div>
    </div>

    <table class="invoice-table">
      <thead>
        <tr>
          <th class="col-sn">S.N.</th>
          <th class="col-hs">H.S. Code</th>
          <th class="col-particulars">Particulars</th>
          <th class="col-qty">Quantity</th>
          <th class="col-rate">Rate per Unit (Rs.)</th>
          <th class="col-total">Total Amount (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="col-sn">1</td>
          <td class="col-hs text-center"></td>
          <td class="col-particulars">${escapeHtml(itemName)}</td>
          <td class="col-qty">${escapeHtml(qtyDisplay)}</td>
          <td class="col-rate">${num(calcSubtotal)}</td>
          <td class="col-total">${num(calcSubtotal)}</td>
        </tr>
        <tr>
          <td colspan="3" class="words-cell">
            <div class="words-title">Amount in Words:</div>
            <div><strong>Rs.</strong> ${escapeHtml(amountToWords(grandTotal))}</div>
            <div class="words-dotted"></div>
          </td>
          <td colspan="3" style="padding: 0;">
            <table class="summary-table">
              <tr>
                <td class="summary-label">Subtotal</td>
                <td class="summary-val">${num(calcSubtotal)}</td>
              </tr>
              ${vatAmount > 0 ? `<tr>
                <td class="summary-label">${vatRate}% VAT</td>
                <td class="summary-val">${num(vatAmount)}</td>
              </tr>` : ''}
              <tr>
                <td class="summary-label">Grand Total</td>
                <td class="summary-val">${num(grandTotal)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="signatures-section">
      <div>
        <div style="margin-top: 15px;">
          <strong>Customer's signature:</strong> <span class="sig-line-dotted" style="display:inline-block; width: 120px;"></span>
        </div>
      </div>
      <div class="signature-box">
        <div style="margin-bottom: 25px;">
          <u><strong>Authorized Signature</strong></u>
        </div>
        <div class="sig-line-dotted"></div>
      </div>
    </div>
    <div class="footer-section">
      <div class="footer-text">Generated by ERP</div>
      <div class="footer-text">${tsLine}</div>
    </div>
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '148mm';
  iframe.style.height = '210mm';
  iframe.style.border = '0';
  iframe.style.zIndex = '-1';
  iframe.style.opacity = '0.01';
  document.body.appendChild(iframe);

  const idoc = iframe.contentWindow.document;
  idoc.open();
  idoc.write(html);
  idoc.close();

  const w = iframe.contentWindow;
  const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
  const tryPrint = () => { try { w.focus(); w.print(); } catch (_) {} cleanup(); };
  if (idoc.readyState === 'complete') setTimeout(tryPrint, 300);
  else iframe.onload = () => setTimeout(tryPrint, 400);
  setTimeout(cleanup, 60000);
}

export function printDeliverySlip(order, company) {
  const html = `<!DOCTYPE html><html><head><style>
    @page { size: A5; margin: 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; }
    .header { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 8px; margin-bottom: 12px; }
    .company-name { font-size: 16px; font-weight: 700; }
    .company-meta { font-size: 9px; color: #64748b; margin-top: 2px; }
    .tracking-box { text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 2px; padding: 10px; border: 2px solid #1e293b; margin: 10px 0; background: #f8fafc; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
    .party { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; }
    .party-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .party-row { margin-bottom: 3px; }
    .party-label { font-size: 9px; color: #64748b; }
    .party-value { font-weight: 600; }
    .details { margin-top: 12px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; }
    .detail-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .instructions { margin-top: 10px; padding: 8px; background: #fefce8; border: 1px dashed #eab308; border-radius: 6px; }
    .instructions-title { font-size: 10px; font-weight: 700; color: #a16207; margin-bottom: 4px; }
    .footer { text-align: center; margin-top: 16px; font-size: 9px; color: #94a3b8; }
    .qr-section { text-align: center; margin-top: 12px; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; }
  </style></head><body>
    <div class="header">
      <div class="company-name">${esc(company?.name || 'ERP')}</div>
      <div class="company-meta">${esc(company?.address || '')} ${company?.phone ? '| ' + esc(company.phone) : ''}</div>
    </div>
    <div class="tracking-box">${esc(order.trackingNumber)}</div>
    <div class="parties">
      <div class="party">
        <div class="party-title">Sender</div>
        <div class="party-row"><div class="party-label">Name</div><div class="party-value">${esc(order.sender?.name || '-')}</div></div>
        <div class="party-row"><div class="party-label">Phone</div><div class="party-value">${esc(order.sender?.phone || '-')}</div></div>
        <div class="party-row"><div class="party-label">Address</div><div class="party-value">${esc(order.sender?.address || '-')}</div></div>
      </div>
      <div class="party">
        <div class="party-title">Receiver</div>
        <div class="party-row"><div class="party-label">Name</div><div class="party-value">${esc(order.receiver?.name || '-')}</div></div>
        <div class="party-row"><div class="party-label">Phone</div><div class="party-value">${esc(order.receiver?.phone || '-')}</div></div>
        <div class="party-row"><div class="party-label">Address</div><div class="party-value">${esc(order.receiver?.address || '-')}</div></div>
      </div>
    </div>
    <div class="details">
      <div class="detail-row"><span>Delivery Type</span><span class="value">${order.deliveryType === 'international' ? 'International' : 'National'}</span></div>
      <div class="detail-row"><span>Delivery Location</span><span>${esc(order.deliveryLocation || '-')}</span></div>
      <div class="detail-row"><span>Est. Delivery</span><span>${order.estimatedDelivery ? (order.deliveryType === 'international' ? new Date(order.estimatedDelivery).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : adToBsStr(new Date(order.estimatedDelivery))) : '-'}</span></div>
      <div class="detail-row"><span>Invoice #</span><span>${esc(order.sale?.invoiceNumber || '-')}</span></div>
    </div>
    ${order.instructions ? `<div class="instructions"><div class="instructions-title">Special Instructions</div><div>${esc(order.instructions)}</div></div>` : ''}
    ${order.remarks ? `<div style="margin-top:8px;padding:8px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;"><div style="font-size:10px;font-weight:700;color:#0369a1;margin-bottom:4px;">Remarks</div><div>${esc(order.remarks)}</div></div>` : ''}
    <div class="qr-section">
      <div style="font-size:9px;color:#64748b;">Track this delivery at:</div>
      <div style="font-size:11px;font-weight:600;">${esc(window.location.origin)}/track/${esc(order.trackingNumber)}</div>
    </div>
    <div class="footer">This slip should be attached to the courier package</div>
  </body></html>`;
  printHtml(html);
}

function printHtml(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '160mm';
  iframe.style.height = '220mm';
  iframe.style.zIndex = '-1';
  iframe.style.opacity = '0.01';
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow.document;
  idoc.open();
  idoc.write(html);
  idoc.close();
  const w = iframe.contentWindow;
  const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
  const tryPrint = () => { try { w.focus(); w.print(); } catch (_) {} cleanup(); };
  if (idoc.readyState === 'complete') setTimeout(tryPrint, 300);
  else iframe.onload = () => setTimeout(tryPrint, 400);
  setTimeout(cleanup, 60000);
}

function esc(str) {
  if (str && typeof str === 'object') str = str.name || str.label || JSON.stringify(str);
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
