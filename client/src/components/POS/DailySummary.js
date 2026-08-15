import React, { useState, useEffect, useRef } from 'react';
import api from '../../api';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import { openPrintWindow } from '../UI/printCommon';

export default function DailySummary() {
  const [summary, setSummary] = useState(null);
  const [date, setDate] = useState(adToBsStr(new Date()));
  const printRef = useRef();

  useEffect(() => { load(); }, [date]);

  const load = () => {
    api.get('/reports/pos-summary', { params: { date: bsToADStr(date) } }).then(r => setSummary(r.data));
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const handlePrint = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const company = user.company || {};
    const dateLabel = new Date(date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const bodyHtml = `
      <table class="data-table">
        <tbody>
          <tr><td>Total Transactions</td><td class="text-right">${summary?.transactionCount || 0}</td></tr>
          <tr><td>Cash (Nagad)</td><td class="text-right">${formatNPR(summary?.totalCash || 0)}</td></tr>
          <tr><td>QR (Mobile Banking)</td><td class="text-right">${formatNPR(summary?.totalQR || 0)}</td></tr>
          <tr><td>Credit (Udharo)</td><td class="text-right">${formatNPR(summary?.totalCredit || 0)}</td></tr>
          ${summary?.totalRefunded > 0 ? `<tr><td>Refunds (${summary?.refundCount || 0})</td><td class="text-right">-${formatNPR(summary?.totalRefunded || 0)}</td></tr>` : ''}
          <tr style="border-top:2px solid #000;font-weight:700;"><td>Net Total</td><td class="text-right">${formatNPR(summary?.netSales || 0)}</td></tr>
        </tbody>
      </table>`;
    openPrintWindow({
      title: 'POS Daily Summary',
      company,
      subtitle: dateLabel,
      docTitle: 'POS Daily Summary',
      bodyHtml,
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>POS Daily Summary</h1>
        <button className="btn btn-secondary" onClick={handlePrint} disabled={!summary}>Print</button>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Select Date</label>
            <NepaliDatePicker value={date} onChange={setDate} />
          </div>
        </div>
      </div>
      {summary && (
        <div className="card" ref={printRef} style={{ maxWidth: 450 }}>
          <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>
            {new Date(date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h3>
          <table className="table">
            <tbody>
              <tr><td style={{ fontWeight: 500 }}>Total Transactions</td><td className="text-right">{summary.transactionCount}</td></tr>
              <tr><td style={{ fontWeight: 500 }}>Cash (Nagad)</td><td className="text-right">{formatNPR(summary.totalCash)}</td></tr>
              <tr><td style={{ fontWeight: 500 }}>QR (Mobile Banking)</td><td className="text-right">{formatNPR(summary.totalQR)}</td></tr>
              <tr><td style={{ fontWeight: 500 }}>Credit (Udharo)</td><td className="text-right">{formatNPR(summary.totalCredit)}</td></tr>
              {summary.totalRefunded > 0 && (
                <tr style={{ color: '#dc2626' }}>
                  <td style={{ fontWeight: 500 }}>Refunds ({summary.refundCount})</td>
                  <td className="text-right">-{formatNPR(summary.totalRefunded)}</td>
                </tr>
              )}
              <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                <td style={{ fontWeight: 700, fontSize: '1.1rem' }}>Net Total</td>
                <td className="text-right" style={{ fontWeight: 700, fontSize: '1.1rem' }}>{formatNPR(summary.netSales)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handlePrint}>Print Summary</button>
          </div>
        </div>
      )}
    </div>
  );
}
