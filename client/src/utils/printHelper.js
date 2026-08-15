/**
 * Client-side print helpers.
 * Fetches server-rendered HTML reports and prints them inside a hidden iframe
 * (avoiding popup blockers / blank tabs).
 *
 * Usage:
 *   import { printReport } from '../utils/printHelper';
 *   printReport('trial-balance');
 *   printReport('income-statement');
 *   printReport('balance-sheet');
 *   printReport('voucher', voucherId);
 *   printReport('ledger', accountId);
 */

const API_BASE = process.env.REACT_APP_API_URL || '';

function getAuthHeaders() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const headers = {};
  if (user.token) headers.Authorization = `Bearer ${user.token}`;
  if (user.role === 'super_admin') {
    const sc = JSON.parse(localStorage.getItem('selectedCompany') || 'null');
    if (sc) headers['X-Company-Id'] = sc;
  }
  return headers;
}

// Mirror the axios interceptor so prints respect the selected fiscal year.
function getFiscalYearParams() {
  const fy = JSON.parse(localStorage.getItem('fiscalYear') || '{}');
  if (!fy._id) return {};
  const viewing = localStorage.getItem('viewingFiscalYear');
  const showFy = fy.isActive || viewing === fy._id;
  if (!showFy) return {};
  return {
    fiscalYear: fy._id,
    fyStart: fy.startDate,
    fyEnd: fy.endDate,
    fyIsActive: fy.isActive ? '1' : '0',
  };
}

function buildUrl(type, id, queryParams = {}) {
  let url;
  switch (type) {
    case 'trial-balance':
      url = `${API_BASE}/api/reports/print/trial-balance`;
      break;
    case 'income-statement':
      url = `${API_BASE}/api/reports/print/income-statement`;
      break;
    case 'balance-sheet':
      url = `${API_BASE}/api/reports/print/balance-sheet`;
      break;
    case 'voucher':
      if (!id) throw new Error('Voucher ID is required');
      url = `${API_BASE}/api/reports/print/voucher/${id}`;
      break;
    case 'ledger':
      if (!id) throw new Error('Account ID is required');
      url = `${API_BASE}/api/reports/print/ledger/${id}`;
      break;
    case 'sales':
      url = `${API_BASE}/api/reports/print/sales`;
      break;
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
  const params = new URLSearchParams(queryParams).toString();
  if (params) url += `?${params}`;
  return url;
}

// Print arbitrary HTML inside a hidden, off-screen iframe. Returns a Promise.
function printIframe(html) {
  return new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:absolute;left:-10000px;top:0;width:800px;height:1000px;border:none;';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      const w = iframe.contentWindow;
      const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
      const tryPrint = () => {
        try { w.focus(); w.print(); } catch (e) { /* ignore */ }
        cleanup();
        resolve(true);
      };
      if (doc.readyState === 'complete') setTimeout(tryPrint, 300);
      else iframe.onload = () => setTimeout(tryPrint, 400);
      setTimeout(cleanup, 60000);
    } catch (e) {
      reject(e);
    }
  });
}

async function fetchReportHtml(type, id, queryParams = {}) {
  const url = buildUrl(type, id, { ...getFiscalYearParams(), ...queryParams });
  const response = await fetch(url, {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Print request failed' }));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
  return response.text();
}

export async function printReport(type, id, queryParams = {}) {
  const html = await fetchReportHtml(type, id, queryParams);
  return printIframe(html);
}

export async function printReportInline(type, id, queryParams = {}) {
  const html = await fetchReportHtml(type, id, queryParams);
  return printIframe(html);
}
