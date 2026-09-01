import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { adToBsStr } from '../UI/NepaliDatePicker';
import { openPrintWindow } from '../UI/printCommon';

export default function CourierDailyReport() {
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashierId, setCashierId] = useState('all');
  const [report, setReport] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!date) return;
    setLoading(true);
    api.get('/courier-orders/daily-report', { params: { date, cashierId } })
      .then(r => setReport(r.data))
      .catch(() => addToast('Failed to load daily report', 'error'))
      .finally(() => setLoading(false));
  }, [date, cashierId, addToast]);

  useEffect(() => { load(); }, [load]);

  const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const rows = report?.cashierRows || [];
  const s = report?.summary || { totalOrders: 0, cash: 0, qr: 0, bank: 0, total: 0 };

  const cashierOptions = rows.filter(r => r.cashier && r.cashier._id !== 'unknown');

  const handlePrint = () => {
    if (!report) return;
    const subtitle = `${report.branchName || 'All Branches'} \u2022 ${report.date}${isAdmin ? '' : ''}`;
    const trs = rows.map(r => `
      <tr>
        <td>${(r.cashier?.name || 'Unknown')}</td>
        <td class="text-right">${fmt(r.cash)}</td>
        <td class="text-right">${fmt(r.qr)}</td>
        <td class="text-right">${fmt(r.bank)}</td>
        <td class="text-right">${fmt(r.credit)}</td>
        <td class="text-right">${fmt(r.total)}</td>
        <td class="text-center">${r.count}</td>
      </tr>`).join('');
    const noRows = rows.length === 0 ? '<tr><td colspan="7" class="text-center">No courier sales for this day</td></tr>' : '';

    const body = `
      <table class="data-table">
        <thead>
          <tr><th class="text-center">Cashier / Staff</th><th class="text-right">Cash</th><th class="text-right">QR / Bank</th><th class="text-right">Bank Transfer</th><th class="text-right">Credit</th><th class="text-right">Total</th><th class="text-center">Orders</th></tr>
        </thead>
        <tbody>${trs || noRows}</tbody>
        <tfoot>
          <tr><td>TOTAL</td><td class="text-right">${fmt(s.cash)}</td><td class="text-right">${fmt(s.qr)}</td><td class="text-right">${fmt(s.bank)}</td><td class="text-right">${fmt(s.credit)}</td><td class="text-right">${fmt(s.total)}</td><td class="text-center">${s.totalOrders || 0}</td></tr>
        </tfoot>
      </table>
      <div class="signatures">
        <div class="sig-line">Handed Over By</div>
        <div class="sig-line">Received By (Supervisor)</div>
        <div class="sig-line">Approved By</div>
      </div>`;

    openPrintWindow({
      title: 'Courier Daily Report',
      company,
      subtitle,
      docTitle: 'Courier Sales Daily Report',
      bodyHtml: body,
      landscape: true,
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Courier Daily Report</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          {isAdmin && (
            <select value={cashierId} onChange={e => setCashierId(e.target.value)}>
              <option value="all">All Staff</option>
              {cashierOptions.map(o => <option key={o.cashier._id} value={o.cashier._id}>{o.cashier.name}</option>)}
            </select>
          )}
          <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Load'}</button>
          <button className="btn btn-secondary" onClick={handlePrint} disabled={!report}>Print / Handover</button>
        </div>
      </div>

      {report && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 130, padding: '0.5rem', background: '#fbfbfb', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Branch</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{report.branchName || 'All Branches'}</div>
              </div>
              <div style={{ flex: 1, minWidth: 130, padding: '0.5rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Cash</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{fmt(s.cash)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 130, padding: '0.5rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>QR / Bank</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{fmt(s.qr)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 130, padding: '0.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Bank Transfer</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{fmt(s.bank)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 130, padding: '0.5rem', background: '#fefce8', borderRadius: '8px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{fmt(s.total)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 130, padding: '0.5rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Orders ({adToBsStr(new Date(report.date))})</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{s.totalOrders || 0}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr><th>Cashier / Staff</th><th className="text-right">Cash</th><th className="text-right">QR / Bank</th><th className="text-right">Bank Transfer</th><th className="text-right">Credit</th><th className="text-right">Total</th><th className="text-center">Orders</th></tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.cashier?._id || 'unknown'}>
                      <td>{r.cashier?.name || 'Unknown'}</td>
                      <td className="text-right">{fmt(r.cash)}</td>
                      <td className="text-right">{fmt(r.qr)}</td>
                      <td className="text-right">{fmt(r.bank)}</td>
                      <td className="text-right">{fmt(r.credit)}</td>
                      <td className="text-right"><strong>{fmt(r.total)}</strong></td>
                      <td className="text-center">{r.count}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan="7" className="text-center">No courier sales for this day</td></tr>}
                  <tr style={{ fontWeight: 700, background: '#f1f5f9' }}>
                    <td>TOTAL</td>
                    <td className="text-right">{fmt(s.cash)}</td>
                    <td className="text-right">{fmt(s.qr)}</td>
                    <td className="text-right">{fmt(s.bank)}</td>
                    <td className="text-right">{fmt(s.credit)}</td>
                    <td className="text-right">{fmt(s.total)}</td>
                    <td className="text-center">{s.totalOrders || 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
