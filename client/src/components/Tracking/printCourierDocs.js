import { printTaxInvoice } from '../UI/printTaxInvoice';
import api from '../../api';

export async function printCourierInvoice(order, company) {
  try {
    if (order.sale?._id) {
      const { data: fullSale } = await api.get(`/sales/${order.sale._id}`);
      printTaxInvoice(fullSale, company);
    } else if (order.sale) {
      const { data: fullSale } = await api.get(`/sales/${order.sale}`);
      printTaxInvoice(fullSale, company);
    } else {
      const fallback = {
        invoiceNumber: order.sale?.invoiceNumber || order.trackingNumber,
        items: [{ product: { name: 'Courier Delivery Service' }, quantity: 1, price: order.price, subtotal: order.price }],
        subtotal: order.price,
        taxTotal: order.vatAmount || 0,
        discount: 0,
        grandTotal: order.inclusiveVat ? order.price : (order.price + (order.vatAmount || 0)),
        amountPaid: order.price,
        paymentMethod: order.paymentMethod || 'cash',
        customer: { name: order.receiver?.name || 'Customer', address: order.receiver?.address || '' },
        inclusiveVat: order.inclusiveVat,
        createdAt: order.createdAt,
      };
      printTaxInvoice(fallback, company);
    }
  } catch (_) {
    const fallback = {
      invoiceNumber: order.sale?.invoiceNumber || order.trackingNumber,
      items: [{ product: { name: 'Courier Delivery Service' }, quantity: 1, price: order.price, subtotal: order.price }],
      subtotal: order.price,
      taxTotal: order.vatAmount || 0,
      discount: 0,
      grandTotal: order.inclusiveVat ? order.price : (order.price + (order.vatAmount || 0)),
      amountPaid: order.price,
      paymentMethod: order.paymentMethod || 'cash',
      customer: { name: order.receiver?.name || 'Customer', address: order.receiver?.address || '' },
      inclusiveVat: order.inclusiveVat,
      createdAt: order.createdAt,
    };
    printTaxInvoice(fallback, company);
  }
}

export function printDeliverySlip(order, company) {
  const html = `<!DOCTYPE html><html><head><style>
    @page { size: A5; margin: 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; }
    .header { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 8px; margin-bottom: 12px; }
    .company-name { font-size: 16px; font-weight: 700; }
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
      <div class="detail-row"><span>Delivery Type</span><span class="value">${order.deliveryType === 'branch_pickup' ? 'Branch Pickup' : 'Home Delivery'}</span></div>
      <div class="detail-row"><span>Delivery Location</span><span>${esc(order.deliveryLocation || '-')}</span></div>
      <div class="detail-row"><span>Est. Delivery</span><span>${order.estimatedDelivery ? new Date(order.estimatedDelivery).toLocaleDateString('en-GB') : '-'}</span></div>
      <div class="detail-row"><span>Invoice #</span><span>${esc(order.sale?.invoiceNumber || '-')}</span></div>
      <div class="detail-row"><span>Amount</span><span>Rs. ${(order.inclusiveVat ? num(order.price) : num(order.price + (order.vatAmount || 0))).toLocaleString('en-IN', {minimumFractionDigits:2})}</span></div>
      ${order.vatAmount > 0 ? `<div class="detail-row"><span>VAT (${order.vatRate}%)</span><span>Rs. ${num(order.vatAmount).toLocaleString('en-IN', {minimumFractionDigits:2})}</span></div>` : ''}
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

function esc(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function num(n) { return Number(n || 0); }
