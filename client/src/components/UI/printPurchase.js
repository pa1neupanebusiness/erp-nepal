import { escapeHtml } from './printEntry';
import { amountToWords } from '../../utils/numberToWords';
import { adToBsStr } from '../UI/NepaliDatePicker';
import { openPrintWindow } from './printCommon';

const num = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getMiti(date) {
  try {
    const ad = new Date(date);
    const bs = adToBsStr(ad);
    return bs || '';
  } catch { return ''; }
}

export function renderPurchaseHtml(p, company) {
  const vatPct = p.vatPercent || 13;
  const isInclusive = !!p.inclusiveVat;

  const rawItems = (p.items || []).map(it => ({
    name: it.product?.name || it.name || 'Item',
    qty: it.quantity || 0,
    rawRate: it.costPrice || it.price || 0,
    rawAmount: it.subtotal || (it.quantity || 0) * (it.costPrice || it.price || 0),
  }));

  const items = rawItems.map(it => {
    if (isInclusive && vatPct > 0) {
      const beforeVatRate = Math.round((it.rawRate / (1 + vatPct / 100)) * 100) / 100;
      const beforeVatAmount = Math.round((beforeVatRate * it.qty) * 100) / 100;
      return { ...it, rate: beforeVatRate, amount: beforeVatAmount };
    }
    return { ...it, rate: it.rawRate, amount: it.rawAmount };
  });

  const subTotal = p.subtotal || items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const tax = p.tax || 0;
  const discount = p.discount || 0;
  const grandTotal = p.grandTotal || Math.max(0, subTotal + tax - discount);
  const paid = p.paidAmount || 0;
  const due = p.dueAmount != null ? p.dueAmount : Math.max(0, grandTotal - paid);

  const invoiceDate = p.date || p.createdAt;
  const enDate = invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
  const miti = getMiti(invoiceDate);

  const supplierName = p.supplier?.name || p.supplierName || 'Cash Purchase';
  const supplierPan = p.supplier?.pan || p.supplierPan || '';
  const supplierPanDigits = (supplierPan || '').replace(/\D/g, '').padEnd(9, ' ').slice(0, 9).split('');
  const supplierPanBoxes = supplierPanDigits.map(d => `<div class="pan-box">${escapeHtml(d.trim())}</div>`).join('');
  const supplierInvoice = p.supplierInvoiceNo || '-';

  const rows = items.map((it, i) => `
    <tr>
      <td class="col-sn">${i + 1}</td>
      <td class="col-particulars">${escapeHtml(it.name)}</td>
      <td class="col-qty">${it.qty}</td>
      <td class="col-rate">${num(it.rate)}</td>
      <td class="col-total">${num(it.amount)}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="text-center">No items</td></tr>';

  return `
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #000; background-color: #fff; margin: 0; padding: 0; }
    .invoice-container { width: 100%; margin: 0; padding: 12px; box-sizing: border-box; }
    .header { text-align: center; margin-bottom: 20px; }
    .company-name { font-size: 26px; font-weight: bold; font-family: 'Times New Roman', Times, serif; margin-bottom: 4px; }
    .company-details { font-size: 13px; line-height: 1.4; }
    .invoice-title { font-size: 18px; font-weight: bold; margin-top: 6px; }
    .meta-section { margin-bottom: 15px; line-height: 1.8; }
    .pan-boxes { display: inline-flex; vertical-align: middle; margin-left: 5px; }
    .pan-box { width: 18px; height: 20px; border: 1px solid #000; margin-right: -1px; text-align: center; line-height: 20px; font-weight: bold; }
    .row-flex { display: flex; justify-content: space-between; align-items: center; }
    table.invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 0px; }
    table.invoice-table th, table.invoice-table td { border: 1px solid #000; padding: 6px; vertical-align: top; }
    table.invoice-table th { font-weight: bold; text-align: center; font-size: 12px; }
    .col-sn { width: 6%; text-align: center; }
    .col-particulars { width: 50%; }
    .col-qty { width: 12%; text-align: center; }
    .col-rate { width: 16%; text-align: right; }
    .col-total { width: 16%; text-align: right; }
    .text-center { text-align: center; }
    .summary-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .summary-table td { border: 1px solid #000; padding: 5px; }
    .summary-label { font-weight: bold; text-align: left; }
    .summary-val { text-align: right; width: 40%; }
    .signatures-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; font-size: 12px; }
    .signature-box { text-align: center; }
    .sig-line-dotted { border-bottom: 1px dotted #000; width: 150px; margin: 0 auto 5px auto; }
    @media print { body { -webkit-print-color-adjust: exact; } .no-print { display: none; } }
  </style>
  <div class="invoice-container">
    <div class="meta-section">
      <div class="row-flex">
        <div><strong>Voucher No:</strong> ${escapeHtml(p.purchaseNumber || '-')}</div>
        <div><strong>Date:</strong> ${escapeHtml(miti || enDate)} (${escapeHtml(enDate)})</div>
      </div>
      <div><strong>Supplier:</strong> ${escapeHtml(supplierName)}</div>
      ${supplierPan ? `<div><strong>Supplier PAN No:</strong> <div class="pan-boxes">${supplierPanBoxes}</div></div>` : ''}
      <div><strong>Supplier Invoice No:</strong> ${escapeHtml(supplierInvoice)}</div>
      <div><strong>Payment Mode:</strong> ${escapeHtml(p.paymentMethod === 'bank' ? 'Bank' : p.paymentMethod === 'split' ? 'Split' : p.paymentMethod === 'credit' ? 'Credit' : 'Cash')}</div>
      ${p.paymentMethod === 'split' && p.paymentSplits?.length ? `<div><strong>Split Details:</strong> ${p.paymentSplits.map(sp => `${sp.method === 'bank' ? 'Bank' : 'Cash'}: ${num(sp.amount)}${sp.bank?.name ? ` (${escapeHtml(sp.bank.name)})` : ''}`).join(' + ')}</div>` : ''}
      ${p.chequeNumber ? `<div><strong>Cheque No:</strong> ${escapeHtml(p.chequeNumber)}</div>` : ''}
      ${p.paymentRemarks ? `<div><strong>Remarks:</strong> ${escapeHtml(p.paymentRemarks)}</div>` : ''}
      ${p.note ? `<div><strong>Note:</strong> ${escapeHtml(p.note)}</div>` : ''}
      <div><strong>Status:</strong> ${escapeHtml(p.status || '-')}</div>
    </div>

    <table class="invoice-table">
      <thead>
        <tr>
          <th class="col-sn">S.N.</th>
          <th class="col-particulars">Particulars</th>
          <th class="col-qty">Quantity</th>
          <th class="col-rate">Rate (Rs.)</th>
          <th class="col-total">Amount (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <table class="summary-table">
      <tr><td class="summary-label">Subtotal</td><td class="summary-val">${num(subTotal)}</td></tr>
      ${tax > 0 ? `<tr><td class="summary-label">VAT (${p.vatPercent || 13}%)</td><td class="summary-val">${num(tax)}</td></tr>` : ''}
      ${discount > 0 ? `<tr><td class="summary-label">Discount</td><td class="summary-val">${num(discount)}</td></tr>` : ''}
      <tr><td class="summary-label">Grand Total</td><td class="summary-val">${num(grandTotal)}</td></tr>
      <tr><td class="summary-label">Paid</td><td class="summary-val">${num(paid)}</td></tr>
      <tr><td class="summary-label">Due</td><td class="summary-val">${num(due)}</td></tr>
    </table>

    <div style="margin-top:10px;"><strong>Amount in Words:</strong> ${escapeHtml(amountToWords(grandTotal))}</div>

    <div class="signatures-section">
      <div class="signature-box">
        <div class="sig-line-dotted"></div>
        <div>Prepared By</div>
      </div>
      <div class="signature-box">
        <div class="sig-line-dotted"></div>
        <div>Authorized Signatory</div>
      </div>
    </div>
  </div>`;
}

export function printPurchaseVoucher(p, company) {
  if (!p) return;
  if (!company) { company = JSON.parse(localStorage.getItem('user') || '{}').company || {}; }
  openPrintWindow({
    title: `Purchase ${p.purchaseNumber || ''}`,
    company,
    docTitle: 'Purchase Voucher',
    bodyHtml: renderPurchaseHtml(p, company),
  });
}
