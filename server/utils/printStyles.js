/**
 * TallyPrime-style print CSS — A4 native print engine.
 * Zero layout shift, monochromatic, sticky headers, page-break controls.
 */

function getPrintStyles() {
  return `
/* ─── RESET & BASE ─── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page {
  size: A4 portrait;
  margin: 15mm 12mm 18mm 12mm;
}

body {
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10pt;
  color: #000;
  background: #fff;
  line-height: 1.4;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ─── SCREEN-ONLY PRINT BUTTON ─── */
.print-trigger { display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; font-size: 11px; font-weight: 600; color: #fff; background: #1a1a2e; border: none; border-radius: 4px; cursor: pointer; letter-spacing: 0.3px; }
.print-trigger:hover { background: #16213e; }

/* ─── PAGE FRAME ─── */
.page-frame {
  width: 100%;
  max-width: 794px; /* A4 at 96dpi */
  margin: 0 auto;
  padding: 0;
}

/* ─── REPORT HEADER (sticky across pages) ─── */
.report-header {
  text-align: center;
  margin-bottom: 12pt;
  padding-bottom: 8pt;
  border-bottom: 2px solid #000;
}
.report-header h1 {
  font-size: 15pt;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 2pt;
}
.report-header .subtitle {
  font-size: 9pt;
  color: #444;
  font-weight: 400;
}
.report-header .company-name {
  font-size: 11pt;
  font-weight: 600;
  margin-bottom: 1pt;
}
.report-header .meta-line {
  font-size: 8pt;
  color: #666;
  margin-top: 2pt;
}

/* ─── TABLES ─── */
.report-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 14pt;
  font-size: 9.5pt;
}
.report-table thead { display: table-header-group; }
.report-table tfoot { display: table-footer-group; }
.report-table tbody { display: table-row-group; }

.report-table th {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 8pt;
  letter-spacing: 0.4px;
  padding: 5pt 6pt;
  border-top: 1.5px solid #000;
  border-bottom: 1px solid #999;
  background: #f5f5f5;
  text-align: left;
  white-space: nowrap;
}
.report-table th.num,
.report-table td.num { text-align: right; }

.report-table td {
  padding: 3.5pt 6pt;
  border-bottom: 0.5px solid #d3d3d3;
  vertical-align: top;
}

/* Row hierarchy indent */
.indent-1 { padding-left: 18pt; }
.indent-2 { padding-left: 30pt; }
.indent-3 { padding-left: 42pt; }
.indent-4 { padding-left: 54pt; }

/* Group headers */
.group-header td {
  font-weight: 700;
  font-size: 9pt;
  padding-top: 6pt;
  padding-bottom: 3pt;
  border-bottom: 1px solid #999;
  background: #fafafa;
}

/* Subtotal / total rows */
.subtotal-row td {
  font-weight: 700;
  border-top: 1px solid #999;
  border-bottom: 1px solid #999;
  background: #f0f0f0;
  padding-top: 4pt;
  padding-bottom: 4pt;
}

/* Grand total — double underline */
.grand-total-row td {
  font-weight: 800;
  font-size: 10pt;
  border-top: 2px solid #000;
  border-bottom: 3px double #000;
  padding-top: 5pt;
  padding-bottom: 5pt;
  background: #e8e8e8;
}

/* ─── BALANCE UNDERLINE ─── */
.balance-underline {
  border-bottom: 1.5px solid #000;
  display: inline-block;
  min-width: 60pt;
  text-align: right;
}

/* ─── FOOTER / PAGE NUMBER ─── */
.report-footer {
  margin-top: 14pt;
  padding-top: 6pt;
  border-top: 1px solid #999;
  font-size: 7.5pt;
  color: #888;
  display: flex;
  justify-content: space-between;
}
.report-footer .page-num::after {
  content: counter(page);
}
.report-footer .pages-total::after {
  content: counter(pages);
}

/* ─── VOUCHER-SPECIFIC ─── */
.voucher-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10pt;
  padding-bottom: 6pt;
  border-bottom: 2px solid #000;
}
.voucher-header .left { text-align: left; }
.voucher-header .right { text-align: right; }
.voucher-header .voucher-title {
  font-size: 14pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.voucher-header .voucher-no {
  font-size: 11pt;
  font-weight: 600;
}
.voucher-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2pt 20pt;
  font-size: 9pt;
  margin-bottom: 10pt;
}
.voucher-meta .label {
  font-weight: 600;
  color: #333;
}

.voucher-narration {
  font-size: 9pt;
  font-style: italic;
  color: #444;
  padding: 5pt 8pt;
  background: #fafafa;
  border-left: 2px solid #999;
  margin: 8pt 0;
}

/* ─── SECTION DIVIDERS ─── */
.section-title {
  font-size: 11pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 4pt 0;
  margin-top: 10pt;
  margin-bottom: 4pt;
  border-bottom: 1px solid #999;
}

/* ─── SIGNATURE BLOCK ─── */
.signature-block {
  margin-top: 30pt;
  display: flex;
  justify-content: space-between;
  font-size: 8.5pt;
  color: #555;
}
.signature-block .sig-line {
  border-top: 1px solid #999;
  width: 140pt;
  padding-top: 3pt;
  text-align: center;
}

/* ─── PRINT OVERRIDES ─── */
@media print {
  body { background: #fff; margin: 0; padding: 0; }
  .no-print { display: none !important; }
  .page-frame { max-width: 100%; margin: 0; padding: 0; }

  .report-header { page-break-after: avoid; }
  .group-header { page-break-inside: avoid; }
  .subtotal-row { page-break-inside: avoid; }
  .grand-total-row { page-break-inside: avoid; }

  table, tr, td, th { page-break-inside: avoid; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }

  .report-footer { position: fixed; bottom: 0; left: 0; right: 0; }
  .report-footer .page-num::after { content: counter(page); }
  .report-footer .pages-total::after { content: counter(pages); }
}

/* ─── ZERO AMOUNT HIDE ─── */
.zero-hide:empty,
.zero-hide[data-val="0"] { display: none; }

/* ─── UTILITY ─── */
.text-right { text-align: right; }
.text-center { text-align: center; }
.text-left { text-align: left; }
.font-bold { font-weight: 700; }
.font-normal { font-weight: 400; }
.color-muted { color: #666; }
.border-top { border-top: 1px solid #000; }
.border-top-thick { border-top: 2px solid #000; }
.border-bottom-double { border-bottom: 3px double #000; }
.mt-2 { margin-top: 8pt; }
.mb-2 { margin-bottom: 8pt; }
.pt-1 { padding-top: 4pt; }
.pb-1 { padding-bottom: 4pt; }

/* ─── A4 CONTAINER FOR SCREEN ─── */
@media screen {
  body { background: #e0e0e0; padding: 20px; }
  .page-frame {
    background: #fff;
    box-shadow: 0 1px 6px rgba(0,0,0,0.12);
    padding: 25mm 20mm;
    min-height: 297mm;
  }
}
`;
}

module.exports = { getPrintStyles };
