import React, { useState, useEffect } from 'react';
import api from '../../api';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import { printHtmlDocument } from '../UI/printCommon';
import { useToast } from '../UI/Toast';

const taxLabels = {
  nepal: { tds: 'TDS', rates: { salary: 1, contract: 1.5, consulting: 1.5, rent: 5, interest: 5, commission: 1.5, dividend: 5 } },
  india: { tds: 'TDS', rates: { salary: 10, contract: 10, consulting: 10, rent: 10, interest: 10, commission: 5, dividend: 10 } },
  usa: { tds: '', rates: {} },
  uk: { tds: 'PAYE', rates: { salary: 20 } },
  australia: { tds: 'PAYG', rates: { salary: 19 } },
  canada: { tds: 'CPP/EI', rates: {} },
  germany: { tds: 'Lohnsteuer', rates: { salary: 42 } },
  france: { tds: 'PAS', rates: { salary: 10 } },
  japan: { tds: '源泉税', rates: { salary: 10.21, consulting: 10.21 } },
  singapore: { tds: 'CPF', rates: { salary: 20 } },
  uae: { tds: 'WPS', rates: {} },
  southafrica: { tds: 'PAYE', rates: { salary: 25 } },
  newzealand: { tds: 'PAYE', rates: { salary: 17.5 } },
  ireland: { tds: 'PAYE/PRSI', rates: { salary: 20 } },
};

export default function TDSReport() {
  const formatNPR = (n) => (user?.company?.currencySymbol || 'Rs. ') + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [detail, setDetail] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ date: adToBsStr(new Date()), amount: '', paymentMethod: 'bank', bank: '' });
  const [banks, setBanks] = useState([]);
  const [paying, setPaying] = useState(false);
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  const hasAccountsAccess = isAdmin || (user.groups || []).includes('accounts');
  const country = user?.company?.country || 'nepal';
  const tax = taxLabels[country] || taxLabels.nepal;

  useEffect(() => {
    fetchTDSData();
    api.get('/accounts/banks').then(r => setBanks(r.data || [])).catch(() => {});
  }, [period, startDate, endDate]);

  const fetchTDSData = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (startDate) params.startDate = bsToADStr(startDate);
      if (endDate) params.endDate = bsToADStr(endDate);
      const res = await api.get('/reports/tds', { params });
      setTransactions(res.data.transactions || []);
    } catch (err) { console.error('Failed to fetch TDS data', err); }
    setLoading(false);
  };

  const calculateTotals = () => {
    let totalTDS = 0;
    transactions.forEach(t => { totalTDS += t.tdsAmount || 0; });
    return { total: totalTDS };
  };

  const totals = calculateTotals();

  const handlePay = async () => {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) return addToast('Enter valid amount', 'error');
    setPaying(true);
    try {
      await api.post('/reports/pay-tax', {
        taxType: 'tds',
        amount: parseFloat(payForm.amount),
        paymentMethod: payForm.paymentMethod,
        bank: payForm.paymentMethod === 'bank' ? payForm.bank : undefined,
        date: bsToADStr(payForm.date),
      });
      addToast(`${tax.tds} payment recorded successfully`, 'success');
      setShowPayModal(false);
      setPayForm({ date: adToBsStr(new Date()), amount: '', paymentMethod: 'bank', bank: '' });
    } catch (err) {
      addToast(err.response?.data?.message || 'Payment failed', 'error');
    }
    setPaying(false);
  };

  if (!tax.tds) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>Tax Reports</h1>
          <p>Withholding tax reporting is not applicable for {user?.company?.country || 'your country'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{tax.tds} Report</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <p style={{ margin: 0 }}>Track {tax.tds} deductions and payments</p>
          <button className="btn btn-sm btn-secondary" onClick={() => {
            const el = document.querySelector('.card table.table');
            if (el) printHtmlDocument(el.outerHTML, `${tax.tds} Report`);
          }}>Print</button>
          {totals.total > 0 && hasAccountsAccess && (
            <button className="btn btn-primary" onClick={() => { setPayForm(f => ({ ...f, amount: String(Math.round(totals.total)) })); setShowPayModal(true); }}>
              Pay {tax.tds} - {formatNPR(totals.total)}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: '0.5rem', alignItems: 'end', marginBottom: '1rem', padding: '0.9rem 1rem', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>Period</label>
          <select value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
        {period === 'custom' && (
          <>
            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>From</label><NepaliDatePicker value={startDate} onChange={v => setStartDate(v)} /></div>
            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>To</label><NepaliDatePicker value={endDate} onChange={v => setEndDate(v)} /></div>
            <button className="btn btn-secondary" onClick={() => { setStartDate(''); setEndDate(''); }}>All</button>
          </>
        )}
      </div>

      <div className="report-summary">
        <div className="summary-card" style={{ borderTop: '3px solid #2563eb' }}>
          <div className="summary-label">Total {tax.tds} Deducted</div>
          <div className="summary-value">{formatNPR(totals.total)}</div>
        </div>
        <div className="summary-card" style={{ borderTop: '3px solid #7c3aed' }}>
          <div className="summary-label">Transactions</div>
          <div className="summary-value">{transactions.length}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <strong>Applicable {tax.tds} Rates</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.6rem' }}>
          {Object.entries(tax.rates).map(([category, rate]) => (
            <span key={category} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
              {category.charAt(0).toUpperCase() + category.slice(1)} <span style={{ background: '#e0e7ff', color: '#4338ca', borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.72rem' }}>{rate}%</span>
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.6rem' }}>
          <strong>Deduction Details</strong>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>{transactions.length} transaction(s)</span>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Date</th><th>Reference</th><th>Party</th><th>Category</th><th className="text-right">Amount</th><th className="text-right">{tax.tds} Rate</th><th className="text-right">{tax.tds} Amount</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="8">Loading...</td></tr> : transactions.length === 0 ? <tr><td colSpan="8">No transactions found</td></tr> : (
                transactions.map((t, i) => (
                  <tr key={i} onClick={() => setDetail(t)} style={{ cursor: 'pointer' }}>
                    <td>{t.date}</td>
                    <td>{t.reference}</td>
                    <td>{t.partyName}</td>
                    <td>{t.category}</td>
                    <td className="text-right">{formatNPR(t.amount)}</td>
                    <td className="text-right">{t.rate || tax.rates[t.category] || 0}%</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{formatNPR(t.tdsAmount)}</td>
                    <td><span className={`badge ${t.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>{t.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <EntryDetailsModal
          title={`${tax.tds} Deduction - ${detail.reference}`}
          meta={[
            { label: 'Date', value: new Date(detail.date).toLocaleDateString('en-IN') },
            { label: 'Reference', value: detail.reference },
            { label: 'Party', value: detail.partyName },
            { label: 'Category', value: detail.category },
            { label: 'Status', value: detail.status },
            { label: `${tax.tds} Rate`, value: `${detail.rate || tax.rates[detail.category] || 0}%` },
          ]}
          columns={[{ label: 'Particular', key: 'label' }, { label: 'Amount', key: 'value', align: 'right' }]}
          rows={[
            { label: 'Amount', value: formatNPR(detail.amount) },
            { label: `${tax.tds} Deducted`, value: formatNPR(detail.tdsAmount) },
          ]}
          footer={[{ label: `${tax.tds} Amount`, value: formatNPR(detail.tdsAmount) }]}
          onClose={() => setDetail(null)}
        />
      )}

      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header"><h3>Pay {tax.tds}</h3><button className="btn btn-sm modal-close-x" onClick={() => setShowPayModal(false)}>×</button></div>
            <div className="modal-body">
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                Total Payable: <strong>{formatNPR(totals.total)}</strong>
                <div style={{ fontSize: '0.75rem', color: '#1e40af', marginTop: '0.25rem' }}>This will debit {tax.tds} Payable (liability) and credit Cash/Bank (asset). No P&L impact.</div>
              </div>
              <div className="form-group"><label>Date</label><NepaliDatePicker value={payForm.date} onChange={v => setPayForm(f => ({ ...f, date: v }))} /></div>
              <div className="form-group"><label>Amount (Rs.)</label><input type="number" step="0.01" min="1" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} required /></div>
              <div className="form-group"><label>Pay From</label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value, bank: '' }))}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              {payForm.paymentMethod === 'bank' && (
                <div className="form-group"><label>Bank Account</label>
                  <select value={payForm.bank} onChange={e => setPayForm(f => ({ ...f, bank: e.target.value }))}>
                    <option value="">Select bank...</option>
                    {banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowPayModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handlePay} disabled={paying || !payForm.amount}>{paying ? 'Processing...' : 'Confirm Payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
