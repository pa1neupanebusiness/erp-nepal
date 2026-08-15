// Shared print infrastructure for all client-side ERP print/export templates.
// All prints route through openPrintWindow so they share one consistent "Invoice" design.

export const INVOICE_CSS = `
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; margin: 0; padding: 0; }
.invoice-card { width: 100%; margin: 0; border: 1px solid #000; padding: 0; }
.invoice-card table { width: 100%; border-collapse: collapse; }
.invoice-card table th, .invoice-card table td { border: 1px solid #000; padding: 5px 6px; white-space: normal; word-break: break-word; }
.invoice-card table th { background-color: #f0f0f0; font-weight: bold; }
.invoice-card td, .invoice-card th { vertical-align: top; word-break: break-word; white-space: normal; }
.header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
.company-title { font-size: 22px; font-weight: bold; text-transform: uppercase; text-align: center; white-space: nowrap; }
.company-detail { white-space: nowrap; font-size: 11px; line-height: 1.4; }
.doc-title { font-size: 16px; font-weight: bold; text-align: center; text-transform: uppercase; text-decoration: underline; margin-top: 6px; }
.meta-grid { display: flex; gap: 20px; margin-bottom: 15px; line-height: 1.5; }
.meta-box { width: 48%; }
table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
table.data-table th, table.data-table td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
table.data-table th { background-color: #f0f0f0; font-weight: bold; }
.text-right { text-align: right; }
.text-center { text-align: center; }
.footer-section { display: flex; justify-content: space-between; margin-top: 10px; }
.summary-box { width: 45%; margin-left: auto; }
.summary-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #ccc; }
.summary-row.grand-total { border-top: 2px solid #000; border-bottom: 2px double #000; font-weight: bold; font-size: 14px; padding: 6px 0; }
.vat-tag { font-size: 10px; color: #475569; }
.signatures { display: flex; justify-content: space-between; margin-top: 50px; padding-top: 10px; }
.sig-line { border-top: 1px solid #000; width: 28%; text-align: center; padding-top: 4px; font-weight: bold; font-size: 11px; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } tr, td, th { page-break-inside: avoid; } }

/* ---- Extended utilities (same neutral black/grey aesthetic) ---- */
.report-subtitle { text-align: center; color: #555; font-size: 13px; margin: 4px 0 12px; }
.footer-text { font-size: 10px; color: #888; }
.avoid-break { page-break-inside: avoid; }
.meta-list { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin-bottom: 16px; }
.meta-item { display: inline-flex; gap: 6px; border-bottom: 1px dotted #ccc; padding: 3px 0; font-size: 12px; }
.mlabel { color: #555; }
.mvalue { font-weight: bold; }
.emi-meta { margin: 4px 0 14px; line-height: 1.7; font-size: 12px; }
.emi-meta .mlabel { color: #555; display: inline-block; min-width: 110px; }
.emi-meta .mvalue { font-weight: bold; }
.stat-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin: 12px 0 16px; }
.stat { border: 1px solid #ddd; border-radius: 6px; padding: 10px; text-align: center; }
.stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
.stat-value { font-size: 15px; font-weight: 700; margin-top: 4px; }
.words { margin-top: 12px; font-weight: 600; border-top: 1px dashed #666; padding-top: 8px; }
.wide { width: 42%; min-width: 180px; white-space: normal; word-break: break-word; }
tfoot td { font-weight: bold; border-top: 2px solid #000; }
tr.tfoot-row td { background: #f2f2f2; font-weight: bold; border-top: 2px solid #000; }
tr.closing-row td { background: #e6e6e6; font-weight: bold; border-top: 2px solid #000; }
tr.sub-row td { font-weight: normal; color: #555; border-top: none; }
`;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Open a new window and render the shared invoice-style shell around `bodyHtml`.
 * @param {object} opts
 * @param {string} opts.title      - window/document title
 * @param {object} [opts.company]  - { name, address, city, pan, phone, email }
 * @param {string} [opts.subtitle] - optional line shown under the header
 * @param {string} opts.docTitle   - big right-aligned document title (Invoice/Ledger/Report...)
 * @param {string} opts.bodyHtml   - the print-specific body markup
 * @param {boolean} [opts.landscape] - use A4 landscape instead of portrait
 */
export function openPrintWindow({ title, company, subtitle, docTitle, bodyHtml, landscape = false }) {
  const c = company || {};
  const companyName = esc(c.name || 'Your Company');
  const address = [c.address, c.city].filter(Boolean).map(esc).join(', ');
  const phone = esc(c.phone || '-');
  const email = c.email ? ` | ${esc(c.email)}` : '';
  const dateStr = new Date().toLocaleString('en-IN');
  const landscapeStyle = landscape ? '<style>@page { size: A4 landscape; margin: 10mm; }</style>' : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>${INVOICE_CSS}</style>${landscapeStyle}
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div class="company-title">${companyName}</div>
      <div class="company-detail">${address}</div>
      <div class="company-detail">Phone: ${phone}${email}</div>
      <div class="doc-title">${esc(docTitle || 'Invoice')}</div>
    </div>
    ${subtitle ? `<div class="report-subtitle">${esc(subtitle)}</div>` : ''}
    ${bodyHtml}
  <div class="footer-section">
    <div class="footer-text">Generated by ERP</div>
    <div class="footer-text">${dateStr}</div>
  </div>
</div>
</body>
</html>`;

  // Render inside a hidden iframe and print from it. This avoids popup blockers
  // and blank-page issues that occur with window.open('_blank').
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
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
  // Safety net in case the dialog is dismissed/never fires.
  setTimeout(cleanup, 60000);
}

// Print arbitrary HTML (e.g. a cloned on-screen report) in a hidden iframe.
export function printHtmlDocument(html, title = 'Report') {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'absolute';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '800px';
  iframe.style.height = '1000px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const idoc = iframe.contentWindow.document;
  idoc.open();
  idoc.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${INVOICE_CSS}</style></head><body><div class="invoice-card">${html}</div></body></html>`);
  idoc.close();

  const w = iframe.contentWindow;
  const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
  const tryPrint = () => { try { w.focus(); w.print(); } catch (e) { /* ignore */ } cleanup(); };
  if (idoc.readyState === 'complete') setTimeout(tryPrint, 300);
  else iframe.onload = () => setTimeout(tryPrint, 400);
  setTimeout(cleanup, 60000);
}
