import JsBarcode from 'jsbarcode';

export function printTrackingLabel(tracking, company) {
  const trackingNum = tracking.trackingNumber || 'N/A';
  const barcodeId = 'barcode-' + Date.now();

  const fromBranch = tracking.sourceBranch?.name || '';
  const toBranch = tracking.branch?.name || '';
  const routeText = [fromBranch, toBranch].filter(Boolean).map(escape).join('  ->  ');

  const html = `<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <style>
    @page { size: 100mm 70mm; margin: 0; }
    @media print {
      html, body { width: 100mm; height: 70mm; margin: 0; padding: 0; overflow: hidden; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100mm; height: 70mm; margin: 0; padding: 0; overflow: hidden; }
    body { font-family: 'Courier New', monospace; font-size: 9px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .label { width: 100mm; height: 70mm; border: 1.5px solid #000; padding: 2.5mm 4mm; display: flex; flex-direction: column; box-sizing: border-box; }
    .header { text-align: center; }
    .company { font-size: 13px; font-weight: bold; letter-spacing: 1px; line-height: 1.1; }
    .sub { font-size: 7px; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tracking-num { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 2px; line-height: 1.2; padding: 1mm; border: 1.5px solid #000; background: #f5f5f5; margin: 1mm 0 0.5mm; }
    .barcode-wrap { text-align: center; margin: 1mm 0; min-height: 0; }
    .barcode-wrap svg { max-width: 88mm; height: 12mm; display: inline-block; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5mm 3mm; font-size: 9px; }
    .detail-row { display: flex; }
    .lbl { color: #666; flex-shrink: 0; }
    .val { font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .route { font-size: 8px; text-align: center; margin-top: 1.5mm; border: 1px solid #000; padding: 1mm 2mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .footer { text-align: center; font-size: 7px; border-top: 1.5px dashed #000; padding-top: 1mm; margin-top: auto; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style></head><body>
    <div class="label">
      <div class="header">
        <div class="company">${escape(company?.name || 'ERP')}</div>
        <div class="sub">${escape(company?.address || '')}${company?.phone ? ' | ' + escape(company.phone) : ''}</div>
      </div>
      <div class="tracking-num">${escape(trackingNum)}</div>
      <div class="barcode-wrap"><svg id="${barcodeId}"></svg></div>
      <div class="details">
        <div class="detail-row"><span class="lbl">Order:&nbsp;</span><span class="val">${escape(tracking.orderNumber)}</span></div>
        <div class="detail-row"><span class="lbl">Status:&nbsp;</span><span class="val">${escape(tracking.status?.replace(/_/g, ' ').toUpperCase())}</span></div>
        <div class="detail-row"><span class="lbl">To:&nbsp;</span><span class="val">${escape(tracking.customerName || tracking.customer?.name || '-')}</span></div>
        <div class="detail-row"><span class="lbl">Carrier:&nbsp;</span><span class="val">${escape((tracking.carrier || 'N/A').toUpperCase())}</span></div>
      </div>
      ${routeText ? `<div class="route">${routeText}</div>` : ''}
      <div class="footer">Track: ${escape(window.location.origin)}/track/${escape(trackingNum)}</div>
    </div>
  </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '100mm';
  iframe.style.height = '70mm';
  iframe.style.zIndex = '-1';
  iframe.style.opacity = '0.01';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow.document;
  idoc.open();
  idoc.write(html);
  idoc.close();

  try {
    const svgEl = iframe.contentDocument.getElementById(barcodeId);
    if (svgEl) {
      JsBarcode(svgEl, trackingNum, {
        format: 'CODE128',
        width: 1.5,
        height: 42,
        displayValue: false,
        margin: 0,
      });
    }
  } catch (_) {}

  const w = iframe.contentWindow;
  const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
  const tryPrint = () => {
    try { w.focus(); w.print(); } catch (_) {}
    setTimeout(cleanup, 500);
  };
  if (idoc.readyState === 'complete') setTimeout(tryPrint, 400);
  else iframe.onload = () => setTimeout(tryPrint, 500);
  setTimeout(cleanup, 60000);
}

function escape(str) {
  if (str && typeof str === 'object') str = str.name || str.label || '';
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
