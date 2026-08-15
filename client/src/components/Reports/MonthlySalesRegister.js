import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import { amountToWords } from '../../utils/numberToWords';
import { useToast } from '../UI/Toast';
import { openPrintWindow } from '../UI/printCommon';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBlank = (n) => Number(n || 0) === 0 ? '' : fmt(n);
const monthName = (m) => new Date(`${m}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export default function MonthlySalesRegister() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [invoice, setInvoice] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const currencySymbol = user?.company?.currencySymbol || 'Rs. ';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { month };
      if (invoice) params.invoice = invoice;
      const regRes = await api.get('/reports/monthly-sales-register', { params });
      setRows(regRes.data.rows || []);
      setSummary(regRes.data.summary || {});
    } catch (err) {
      console.error('Failed to load', err);
    }
    setLoading(false);
  }, [month, invoice]);

  useEffect(() => { load(); }, [load]);

  const hasVat = Number(summary.totalVat || 0) > 0;

  const printRegister = () => {
    const company = user?.company || {};
    const bodyRows = rows.map((r, i) => `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td>${r.invoiceNumber}</td>
        <td>${r.date}</td>
        <td>${r.miti || ''}</td>
        <td>${r.buyerName}</td>
        <td class="text-center">${r.buyerPan || ''}</td>
        <td class="text-center">${(r.paymentMethod || '').toUpperCase()}</td>
        <td class="text-right">${fmt(r.totalGross)}</td>
        <td class="text-right">${fmt(r.discount)}</td>
        ${hasVat ? `<td class="text-right">${fmt(r.taxableAmount)}</td>` : ''}
        ${hasVat ? `<td class="text-right">${fmtBlank(r.vatAmount)}</td>` : ''}
        <td class="text-right">${fmt(r.netTotal)}</td>
        <td class="text-center">${r.status === 'refunded' ? 'REFUNDED' : 'OK'}</td>
      </tr>`).join('');

    const bodyHtml = `
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Invoices</div><div class="stat-value">${summary.transactionCount || 0}</div></div>
        <div class="stat"><div class="stat-label">Gross</div><div class="stat-value">${fmt(summary.totalGross)}</div></div>
        <div class="stat"><div class="stat-label">Discount</div><div class="stat-value">${fmt(summary.totalDiscount)}</div></div>
        ${hasVat ? `<div class="stat"><div class="stat-label">Taxable</div><div class="stat-value">${fmt(summary.totalTaxable)}</div></div>` : ''}
        ${hasVat ? `<div class="stat"><div class="stat-label">VAT 13%</div><div class="stat-value">${fmt(summary.totalVat)}</div></div>` : ''}
        <div class="stat"><div class="stat-label">Net Total</div><div class="stat-value">${fmt(summary.totalNet)}</div></div>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>S.No</th><th>Invoice No</th><th>Date (AD)</th><th>Miti (BS)</th><th>Buyer</th><th class="text-center">PAN</th><th class="text-center">Pay Mode</th>
          <th class="text-right">Gross</th><th class="text-right">Discount</th>${hasVat ? '<th class="text-right">Taxable</th>' : ''}${hasVat ? '<th class="text-right">VAT</th>' : ''}<th class="text-right">Net Total</th><th class="text-center">Status</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div class="words">Amount in Words: ${amountToWords(summary.totalNet)}</div>
      <div class="signatures"><div class="sig-line">Prepared By</div><div class="sig-line">Authorized Signatory</div></div>`;

    openPrintWindow({
      title: 'Monthly Sales Register',
      company,
      subtitle: `${monthName(month)} (${month})`,
      docTitle: 'Monthly Sales Register',
      bodyHtml,
      landscape: true,
    });
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Monthly Sales Register</h1>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>IRD Annex-5 style sales register for VAT filing</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
          <input type="text" placeholder="Search invoice..." value={invoice} onChange={e => setInvoice(e.target.value)} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e1' }} />
          <button className="btn btn-secondary" onClick={load}>Filter</button>
          <button className="btn btn-primary" onClick={printRegister}>🖨️ Print</button>
        </div>
      </div>

      <div className="report-summary">
        <div className="summary-card" style={{ borderTop: '3px solid #7c3aed' }}><div className="summary-label">🧾 Invoices</div><div className="summary-value">{summary.transactionCount || 0}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #0f172a' }}><div className="summary-label">Gross Amount</div><div className="summary-value">{currencySymbol}{fmt(summary.totalGross)}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #d97706' }}><div className="summary-label">Discount</div><div className="summary-value">{currencySymbol}{fmt(summary.totalDiscount)}</div></div>
        {hasVat && <div className="summary-card" style={{ borderTop: '3px solid #0891b2' }}><div className="summary-label">Taxable</div><div className="summary-value">{currencySymbol}{fmt(summary.totalTaxable)}</div></div>}
        {hasVat && <div className="summary-card" style={{ borderTop: '3px solid #16a34a' }}><div className="summary-label">VAT 13%</div><div className="summary-value">{currencySymbol}{fmt(summary.totalVat)}</div></div>}
        <div className="summary-card" style={{ borderTop: '3px solid #2563eb' }}><div className="summary-label">Net Total</div><div className="summary-value">{currencySymbol}{fmt(summary.totalNet)}</div></div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{monthName(month)}</strong>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>{rows.length} invoice(s)</span>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th><th>Date</th><th>Miti (BS)</th><th>Buyer</th><th>PAN</th><th>Pay Mode</th>
                <th className="text-right">Gross</th><th className="text-right">Discount</th>{hasVat && <th className="text-right">Taxable</th>}{hasVat && <th className="text-right">VAT</th>}<th className="text-right">Net</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={hasVat ? 11 : 9}>Loading...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={hasVat ? 11 : 9}>No sales found for this month</td></tr>
                : rows.map((r, i) => (
                  <tr key={i} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{r.invoiceNumber}</td>
                    <td>{r.date}</td>
                    <td>{r.miti}</td>
                    <td>{r.buyerName}</td>
                    <td>{r.buyerPan || '-'}</td>
                    <td><span className={`badge ${r.paymentMethod === 'cash' ? 'badge-success' : r.paymentMethod === 'refunded' ? 'badge-danger' : 'badge-info'}`}>{r.paymentMethod}</span></td>
                    <td className="text-right">{fmt(r.totalGross)}</td>
                    <td className="text-right">{fmt(r.discount)}</td>
                    {hasVat && <td className="text-right">{fmt(r.taxableAmount)}</td>}
                    {hasVat && <td className="text-right">{fmtBlank(r.vatAmount)}</td>}
                    <td className="text-right" style={{ fontWeight: 700 }}>{fmt(r.netTotal)}</td>
                    <td>{r.status === 'refunded' ? <span className="badge badge-danger">Refunded</span> : <span className="badge badge-success">OK</span>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {detail && (
        <EntryDetailsModal
          title={`Invoice - ${detail.invoiceNumber}`}
          meta={[
            { label: 'Date', value: detail.date },
            { label: 'Miti (BS)', value: detail.miti || '-' },
            { label: 'Buyer', value: detail.buyerName || '-' },
            { label: 'PAN', value: detail.buyerPan || '-' },
            { label: 'Pay Mode', value: detail.paymentMethod || '-' },
            { label: 'Status', value: detail.status || '-' },
          ]}
          columns={[
            { label: 'Particular', key: 'label' },
            { label: 'Amount', key: 'value', align: 'right', render: v => fmt(v) },
          ]}
          rows={[
            { label: 'Gross Amount', value: detail.totalGross },
            { label: 'Discount', value: detail.discount },
            ...(hasVat ? [{ label: 'Taxable Amount', value: detail.taxableAmount }] : []),
            ...(hasVat ? [{ label: 'VAT 13%', value: detail.vatAmount }] : []),
            { label: 'Net Total', value: detail.netTotal },
          ]}
          footer={[{ label: 'Net Total', value: detail.netTotal, render: v => fmt(v) }]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
