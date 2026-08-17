import JsBarcode from 'jsbarcode';

export function printTrackingLabel(tracking, company) {
  const trackingNum = tracking.trackingNumber || 'N/A';
  const barcodeId = 'barcode-' + Date.now();

  const html = `<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <style>
    @page { size: 148mm 105mm; margin: 5mm; }
    @media print {
      html, body { width: 148mm; height: 105mm; margin: 0; padding: 0; overflow: hidden; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 148mm; height: 105mm; margin: 0; padding: 0; overflow: hidden; }
    body { font-family: 'Courier New', monospace; font-size: 10px; }
    .label { border: 2px solid #000; padding: 3mm 4mm; height: 100%; display: flex; flex-direction: column; }
    .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 2mm; margin-bottom: 2mm; }
    .company { font-size: 13px; font-weight: bold; letter-spacing: 1px; }
    .sub { font-size: 7px; color: #555; margin-top: 1mm; }
    .tracking-num { text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 2px; margin: 2mm 0 1mm; padding: 1.5mm; border: 1.5px solid #000; background: #f5f5f5; }
    .barcode-wrap { text-align: center; margin-bottom: 2mm; }
    .barcode-wrap svg { max-width: 120mm; max-height: 14mm; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 4mm; font-size: 8px; flex: 1; }
    .details .lbl { color: #666; }
    .details .val { font-weight: bold; }
    .route { font-size: 7px; text-align: center; margin-top: 1mm; border: 1px solid #000; padding: 1mm 2mm; }
    .footer { text-align: center; font-size: 7px; border-top: 1.5px dashed #000; padding-top: 2mm; margin-top: auto; color: #555; }
  </style></head><body>
    <div class="label">
      <div class="header">
        <div class="company">${escape(company?.name || 'ERP')}</div>
        <div class="sub">${escape(company?.address || '')} ${company?.phone ? '| ' + escape(company.phone) : ''}</div>
      </div>
      <div class="tracking-num">${escape(trackingNum)}</div>
      <div class="barcode-wrap"><svg id="${barcodeId}"></svg></div>
      <div class="details">
        <div><span class="lbl">Order:</span> <span class="val">${escape(tracking.orderNumber)}</span></div>
        <div><span class="lbl">Status:</span> <span class="val">${escape(tracking.status?.replace(/_/g, ' ').toUpperCase())}</span></div>
        <div><span class="lbl">To:</span> <span class="val">${escape(tracking.customerName || tracking.customer?.name || '-')}</span></div>
        <div><span class="lbl">Carrier:</span> <span class="val">${escape((tracking.carrier || 'N/A').toUpperCase())}</span></div>
      </div>
      ${tracking.branch ? `<div class="route">Branch: ${escape(tracking.branch.name || '')} | Driver: ${escape(tracking.driver?.name || 'Unassigned')}</div>` : ''}
      <div class="footer">
        Track: ${escape(window.location.origin)}/track/${escape(trackingNum)}
      </div>
    </div>
  </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '148mm';
  iframe.style.height = '105mm';
  iframe.style.zIndex = '-1';
  iframe.style.opacity = '0.01';
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
        height: 40,
        displayValue: false,
        margin: 0,
      });
    }
  } catch (_) {}

  const w = iframe.contentWindow;
  const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
  const tryPrint = () => {
    try { w.focus(); w.print(); } catch (_) {}
    cleanup();
  };
  if (idoc.readyState === 'complete') setTimeout(tryPrint, 400);
  else iframe.onload = () => setTimeout(tryPrint, 500);
  setTimeout(cleanup, 60000);
}

function escape(str) {
  if (str && typeof str === 'object') str = str.name || str.label || '';
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
