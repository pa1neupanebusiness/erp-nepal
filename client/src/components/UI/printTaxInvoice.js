import { escapeHtml } from './printEntry';
import { amountToWords } from '../../utils/numberToWords';
import { adToBsStr } from './NepaliDatePicker';

const BS_MONTHS = ['Baishakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const num = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  if (m === 'qr') return 'QR';
  if (m === 'credit') return 'Credit';
  if (m === 'split') return 'Multiple';
  return 'Cash';
}

export function renderTaxInvoiceHtml(sale, company) {
  const vatRate = company?.vatRate || 13;
  const discount = sale.discount || 0;
  const taxTotal = sale.taxTotal || 0;
  const grandTotal = sale.grandTotal || 0;
  const storedSubtotal = sale.subtotal || 0;

  const rawItems = (sale.items || []).map(i => ({
    name: i.product?.name || i.name || 'Item',
    hsCode: i.hsCode || i.product?.hsCode || '',
    qty: i.quantity || 0,
    rawRate: i.price || 0,
    itemDiscount: i.discount || 0,
  }));

  const rawSubTotalGross = rawItems.reduce((s, it) => s + (it.rawRate * it.qty), 0);
  const rawAfterDiscount = Math.max(0, rawSubTotalGross - discount);
  const isInclusive = sale.inclusiveVat !== undefined
    ? !!sale.inclusiveVat
    : taxTotal > 0 ? Math.abs((rawAfterDiscount + taxTotal) - grandTotal) >= 0.5 : false;

  const items = rawItems.map(i => {
    const rawAmount = i.rawRate * i.qty - i.itemDiscount;
    if (isInclusive && vatRate > 0) {
      const beforeVatRate = Math.round((i.rawRate / (1 + vatRate / 100)) * 100) / 100;
      const beforeVatAmount = Math.round((beforeVatRate * i.qty - i.itemDiscount) * 100) / 100;
      return { ...i, rate: beforeVatRate, amount: beforeVatAmount };
    }
    return { ...i, rate: i.rawRate, amount: rawAmount };
  });

  const subTotalGross = rawSubTotalGross;
  const beforeVatSubTotal = isInclusive && vatRate > 0 ? Math.round(subTotalGross / (1 + vatRate / 100) * 100) / 100 : subTotalGross;
  const displaySubtotal = isInclusive ? beforeVatSubTotal : subTotalGross;

  const invoiceDate = sale.invoiceDate || sale.createdAt || sale.date;
  const enDate = new Date(invoiceDate).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const miti = getMiti(invoiceDate);

  const buyerName = sale.customer?.name || 'Cash Sale / Walk-in';
  const buyerAddress = sale.customer?.address || '-';
  const buyerPan = sale.customer?.pan || '';
  const panDigits = (buyerPan || '').replace(/\D/g, '').padEnd(9, ' ').slice(0, 9).split('');

  const sellerPan = company?.pan || '';
  const sellerPanDigits = (sellerPan || '').replace(/\D/g, '').padEnd(9, ' ').slice(0, 9).split('');
  const sellerPanBoxes = sellerPanDigits.map(d => `<div class="pan-box">${escapeHtml(d.trim())}</div>`).join('');

  const rows = items.map((it, i) => `
    <tr>
      <td class="col-sn">${i + 1}</td>
      <td class="col-hs text-center">${escapeHtml(it.hsCode)}</td>
      <td class="col-particulars">${escapeHtml(it.name)}</td>
      <td class="col-qty">${it.qty}</td>
      <td class="col-rate">${num(it.rate)}</td>
      <td class="col-total">${num(it.amount)}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="text-center">No items</td></tr>';

  const panBoxes = panDigits.map(d => `<div class="pan-box">${escapeHtml(d.trim())}</div>`).join('');

  return `
  <div class="meta-section">
    <div class="meta-section">
      <div class="row-flex">
        <div><strong>Invoice No:</strong> ${escapeHtml(sale.invoiceNumber || '-')}</div>
        <div><strong>Date:</strong> ${escapeHtml(miti || enDate)} (${escapeHtml(enDate)})</div>
      </div>
      <div><strong>Seller's PAN No:</strong> <div class="pan-boxes">${sellerPanBoxes}</div></div>
      <div><strong>Buyer's Name:</strong> ${escapeHtml(buyerName)}</div>
      <div><strong>Buyer's Address:</strong> ${escapeHtml(buyerAddress)}</div>
      <div style="margin-top: 4px;">
        <strong>Buyer's PAN No:</strong>
        <div class="pan-boxes">${panBoxes}</div>
      </div>
      <div style="margin-top: 4px;">
        <strong>Mode of Payment:</strong> ${escapeHtml(paymentLabel(sale.paymentMethod))}
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
        ${rows}
        <tr>
          <td colspan="3" class="words-cell">
            <div class="words-title">Amount in Words:</div>
            <div><strong>Rs.</strong> ${escapeHtml(amountToWords(grandTotal))}</div>
            <div class="words-dotted"></div>
          </td>
          <td colspan="3" style="padding: 0;">
            <table class="summary-table">
              ${discount > 0 ? `<tr>
                <td class="summary-label">${isInclusive ? 'Total (before VAT)' : 'Gross Amount'}</td>
                <td class="summary-val">${num(displaySubtotal)}</td>
              </tr>
              <tr>
                <td class="summary-label">Discount</td>
                <td class="summary-val">${num(discount)}</td>
              </tr>` : (!isInclusive ? `<tr>
                <td class="summary-label">Gross Amount</td>
                <td class="summary-val">${num(subTotalGross)}</td>
              </tr>` : '')}
              ${taxTotal > 0 ? `<tr>
                <td class="summary-label">Taxable Value</td>
                <td class="summary-val">${num(storedSubtotal)}</td>
              </tr>
              <tr>
                <td class="summary-label">${vatRate}% VAT${isInclusive ? ' (included)' : ''}</td>
                <td class="summary-val">${num(taxTotal)}</td>
              </tr>` : ''}
              <tr>
                <td class="summary-label">Total Amount</td>
                <td class="summary-val">${num(grandTotal)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="signatures-section">
      <div>
        <div>Goods sold would not be refundable E. &amp; O.E.</div>
        <div style="margin-top: 15px;">
          <strong>Customer's signature:</strong> <span class="sig-line-dotted" style="display:inline-block; width: 120px;"></span>
        </div>
      </div>
      <div class="signature-box">
        <div style="margin-bottom: 25px;">
          <u><strong>Seller's Signature (or For ${escapeHtml(company?.name || '')})</strong></u>
        </div>
        <div class="sig-line-dotted"></div>
      </div>
    </div>
  </div>`;
}

export function printTaxInvoice(sale, company) {
  if (!sale) return;
  if (!company) { company = JSON.parse(localStorage.getItem('user') || '{}').company || {}; }
  const bodyHtml = renderTaxInvoiceHtml(sale, company);
  const dateStr = new Date().toLocaleString('en-IN');
  const companyName = (company?.name || 'Your Company').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const address = [company?.address, company?.city].filter(Boolean).join(', ');
  const phone = company?.phone || '-';
  const email = company?.email ? ` | ${company.email}` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${sale.invoiceNumber || ''}</title>
<style>
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 13px; color: #000; background-color: #fff; margin: 0; padding: 0; }
.invoice-container { width: 100%; margin: 0; padding: 12px; }
.header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
.company-title { font-size: 22px; font-weight: bold; text-transform: uppercase; white-space: nowrap; }
.company-detail { white-space: nowrap; font-size: 11px; line-height: 1.4; }
.doc-title { font-size: 18px; font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-top: 6px; }
.meta-section { margin-bottom: 15px; line-height: 1.8; }
.row-flex { display: flex; justify-content: space-between; align-items: center; }
.pan-boxes { display: inline-flex; vertical-align: middle; margin-left: 5px; }
.pan-box { width: 18px; height: 20px; border: 1px solid #000; margin-right: -1px; text-align: center; line-height: 20px; font-weight: bold; }
table.invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 0px; }
table.invoice-table th, table.invoice-table td { border: 1px solid #000; padding: 8px; vertical-align: top; }
table.invoice-table th { font-weight: bold; text-align: center; font-size: 12px; background-color: #f0f0f0; }
.col-sn { width: 5%; text-align: center; }
.col-hs { width: 10%; text-align: center; }
.col-particulars { width: 47%; }
.col-qty { width: 8%; text-align: center; }
.col-rate { width: 15%; text-align: right; }
.col-total { width: 15%; text-align: right; }
.text-center { text-align: center; }
.words-cell { padding: 10px !important; }
.words-title { font-weight: bold; margin-bottom: 10px; }
.words-dotted { border-bottom: 1px dotted #000; display: block; margin-top: 15px; width: 100%; height: 10px; }
.summary-table { width: 100%; border-collapse: collapse; }
.summary-table td { border: 1px solid #000; padding: 5px; }
.summary-label { font-weight: bold; text-align: left; }
.summary-val { text-align: right; width: 40%; }
.signatures-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; font-size: 12px; }
.signature-box { text-align: center; }
.sig-line-dotted { border-bottom: 1px dotted #000; width: 150px; margin: 0 auto 5px auto; }
.footer-section { display: flex; justify-content: space-between; margin-top: 15px; padding-top: 10px; border-top: 1px solid #000; }
.footer-text { font-size: 10px; color: #888; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } tr, td, th { page-break-inside: avoid; } }
</style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div class="company-title">${companyName}</div>
      <div class="company-detail">${address}</div>
      <div class="company-detail">Phone: ${phone}${email}</div>
      <div class="doc-title">Tax Invoice</div>
    </div>
    ${bodyHtml}
    <div class="footer-section">
      <div class="footer-text">Generated by ERP</div>
      <div class="footer-text">${dateStr}</div>
    </div>
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
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
  const tryPrint = () => {
    try { w.focus(); w.print(); } catch (e) { /* ignore */ }
    cleanup();
  };
  if (idoc.readyState === 'complete') setTimeout(tryPrint, 300);
  else iframe.onload = () => setTimeout(tryPrint, 400);
  setTimeout(cleanup, 60000);
}
