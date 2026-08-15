import React, { useState, useEffect } from 'react';
import api from '../../api';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import { useToast } from '../UI/Toast';

const taxLabels = {
  nepal: { vat: 'VAT', rate: 13, input: 'VAT Input', output: 'VAT Output', filingLabel: 'VAT Filing Date' },
  india: { vat: 'GST', rate: 18, input: 'Input GST', output: 'Output GST', filingLabel: 'GST Filing Date' },
  usa: { vat: 'Sales Tax', rate: 0, input: '', output: 'Sales Tax Payable', filingLabel: 'Filing Date' },
  uk: { vat: 'VAT', rate: 20, input: 'VAT Input', output: 'VAT Output', filingLabel: 'VAT Filing Date' },
  australia: { vat: 'GST', rate: 10, input: 'GST Paid', output: 'GST Collected', filingLabel: 'BAS Filing Date' },
  canada: { vat: 'GST/HST', rate: 5, input: 'GST/HST Input', output: 'GST/HST Output', filingLabel: 'Filing Date' },
  germany: { vat: 'USt', rate: 19, input: 'Vorsteuer', output: 'Umsatzsteuer', filingLabel: 'USt-Anmeldedatum' },
  france: { vat: 'TVA', rate: 20, input: 'TVA Déductible', output: 'TVA Collectée', filingLabel: 'Date de déclaration' },
  japan: { vat: '消費税', rate: 10, input: '仮払消費税', output: '仮受消費税', filingLabel: '申告日' },
  singapore: { vat: 'GST', rate: 9, input: 'GST Input', output: 'GST Output', filingLabel: 'Filing Date' },
  uae: { vat: 'VAT', rate: 5, input: 'VAT Input', output: 'VAT Output', filingLabel: 'VAT Filing Date' },
  southafrica: { vat: 'VAT', rate: 15, input: 'VAT Input', output: 'VAT Output', filingLabel: 'VAT Filing Date' },
  newzealand: { vat: 'GST', rate: 15, input: 'GST Input', output: 'GST Output', filingLabel: 'Filing Date' },
  ireland: { vat: 'VAT', rate: 23, input: 'VAT Input', output: 'VAT Output', filingLabel: 'VAT Filing Date' },
};

export default function VATReport() {
  const formatNPR = (n) => (user?.company?.currencySymbol || 'Rs. ') + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilingDate, setShowFilingDate] = useState(false);
  const [filingDate, setFilingDate] = useState('');
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
    fetchVATData();
    api.get('/accounts/banks').then(r => setBanks(r.data || [])).catch(() => {});
  }, [period, startDate, endDate]);

  const fetchVATData = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (startDate) params.startDate = bsToADStr(startDate);
      if (endDate) params.endDate = bsToADStr(endDate);
      const res = await api.get('/reports/vat', { params });
      setTransactions(res.data.transactions || []);
    } catch (err) {
      console.error('Failed to fetch VAT data', err);
    }
    setLoading(false);
  };

  const calculateTotals = () => {
    let totalOutput = 0, totalInput = 0;
    transactions.forEach(t => { totalOutput += t.outputTax || 0; totalInput += t.inputTax || 0; });
    return { output: totalOutput, input: totalInput, net: totalOutput - totalInput };
  };

  const totals = calculateTotals();
  const vatRate = user?.company?.vatRate || tax.rate;

  const handlePay = async () => {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) return addToast('Enter valid amount', 'error');
    setPaying(true);
    try {
      await api.post('/reports/pay-tax', {
        taxType: 'vat',
        amount: parseFloat(payForm.amount),
        paymentMethod: payForm.paymentMethod,
        bank: payForm.paymentMethod === 'bank' ? payForm.bank : undefined,
        date: bsToADStr(payForm.date),
      });
      addToast(`${tax.vat} payment recorded successfully`, 'success');
      setShowPayModal(false);
      setPayForm({ date: adToBsStr(new Date()), amount: '', paymentMethod: 'bank', bank: '' });
    } catch (err) {
      addToast(err.response?.data?.message || 'Payment failed', 'error');
    }
    setPaying(false);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{tax.vat} Report</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <p style={{ margin: 0 }}>Track your {tax.vat} liability and input credits</p>
          {totals.net > 0 && hasAccountsAccess && (
            <button className="btn btn-primary" onClick={() => { setPayForm(f => ({ ...f, amount: String(Math.round(totals.net)) })); setShowPayModal(true); }}>
              Pay {tax.vat} - {formatNPR(totals.net)}
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
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', marginLeft: 'auto', padding: '0.35rem 0' }}>
          <input type="checkbox" checked={showFilingDate} onChange={e => setShowFilingDate(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          Show {tax.filingLabel}
        </label>
      </div>

      {showFilingDate && (
        <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>{tax.filingLabel}:</label>
          <NepaliDatePicker value={filingDate} onChange={v => setFilingDate(v)} />
        </div>
      )}

      <div className="report-summary">
        <div className="summary-card" style={{ borderTop: '3px solid #16a34a' }}>
          <div className="summary-label">Output {tax.vat} (Collected)</div>
          <div className="summary-value">{formatNPR(totals.output)}</div>
        </div>
        <div className="summary-card" style={{ borderTop: '3px solid #0891b2' }}>
          <div className="summary-label">Input {tax.vat} (Paid)</div>
          <div className="summary-value">{formatNPR(totals.input)}</div>
        </div>
        <div className="summary-card" style={{ borderTop: '3px solid ' + (totals.net >= 0 ? '#2563eb' : '#d97706') }}>
          <div className="summary-label">Net {tax.vat} Payable</div>
          <div className={`summary-value ${totals.net >= 0 ? 'text-red' : 'text-green'}`}>
            {formatNPR(Math.abs(totals.net))} {totals.net < 0 ? '(Refundable)' : ''}
          </div>
        </div>
        <div className="summary-card" style={{ borderTop: '3px solid #7c3aed' }}>
          <div className="summary-label">Transactions</div>
          <div className="summary-value">{transactions.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.6rem' }}>
          <strong>Transaction Details</strong>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>Rate: {vatRate}%</span>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Date</th><th>Reference</th><th>Party</th><th className="text-right">Taxable Amount</th><th className="text-right">{tax.vat} Rate</th><th className="text-right">{tax.vat} Amount</th><th>Type</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="7">Loading...</td></tr> : transactions.length === 0 ? <tr><td colSpan="7">No transactions found</td></tr> : (
                transactions.map((t, i) => (
                  <tr key={i} onClick={() => setDetail(t)} style={{ cursor: 'pointer' }}>
                    <td>{t.date}</td>
                    <td>{t.reference}</td>
                    <td>{t.partyName}</td>
                    <td className="text-right">{formatNPR(t.taxableAmount)}</td>
                    <td className="text-right">{t.taxRate || vatRate}%</td>
                    <td className="text-right">{formatNPR(t.outputTax || t.inputTax || 0)}</td>
                    <td><span className={`badge ${t.type === 'output' ? 'badge-info' : 'badge-success'}`}>{t.type === 'output' ? 'Output' : 'Input'}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <EntryDetailsModal title={`${tax.vat} Transaction - ${detail.reference}`}
          meta={[
            { label: 'Date', value: new Date(detail.date).toLocaleDateString('en-IN') },
            { label: 'Reference', value: detail.reference },
            { label: 'Party', value: detail.partyName },
            { label: 'Type', value: detail.type === 'output' ? 'Output (Collected)' : 'Input (Paid)' },
            { label: 'Rate', value: `${detail.taxRate || vatRate}%` },
            { label: 'Taxable Amount', value: formatNPR(detail.taxableAmount) },
          ]}
          columns={[{ label: 'Particular', key: 'label' }, { label: 'Amount', key: 'value', align: 'right' }]}
          rows={[{ label: `${tax.vat} Amount`, value: formatNPR(detail.outputTax || detail.inputTax || 0) }]}
          footer={[{ label: `${tax.vat} Amount`, value: formatNPR(detail.outputTax || detail.inputTax || 0) }]}
          onClose={() => setDetail(null)}
        />
      )}

      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header"><h3>Pay {tax.vat}</h3><button className="btn btn-sm modal-close-x" onClick={() => setShowPayModal(false)}>×</button></div>
            <div className="modal-body">
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                Net Payable: <strong>{formatNPR(totals.net)}</strong>
                <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '0.25rem' }}>This will debit {tax.vat} Payable (liability) and credit Cash/Bank (asset). No P&L impact.</div>
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
