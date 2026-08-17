import React, { useState, useEffect, useMemo } from 'react';
import { showConfirm } from '../UI/ConfirmDialog';
import api from '../../api';
import { useToast } from '../UI/Toast';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import SearchableSelect from '../UI/SearchableSelect';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import { sortByDate } from '../../utils/timeService';

const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export default function PaymentOut() {
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [outstanding, setOutstanding] = useState({ invoices: [], totalDue: 0 });
  const [form, setForm] = useState({ date: adToBsStr(new Date()), supplier: '', amount: '', method: 'cash', bank: '', chequeNumber: '', reference: '', remarks: '' });
  const [banks, setBanks] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const addToast = useToast();

  const load = () => {
    const params = {};
    if (startDate) params.startDate = bsToADStr(startDate);
    if (endDate) params.endDate = bsToADStr(endDate);
    api.get('/payment-out', { params }).then(r => setItems(sortByDate(r.data))).catch(() => {});
  };

  useEffect(() => {
    load();
    api.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => {});
    api.get('/banks').then(r => setBanks(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.supplier) {
      api.get(`/suppliers/${form.supplier}/outstanding`).then(r => setOutstanding(r.data)).catch(() => setOutstanding({ invoices: [], totalDue: 0 }));
    } else {
      setOutstanding({ invoices: [], totalDue: 0 });
    }
  }, [form.supplier]);

  const active = items.filter(i => i.status !== 'cancelled');
  const totalAmount = active.reduce((s, i) => s + i.amount, 0);
  const totalCash = active.filter(i => i.method === 'cash').reduce((s, i) => s + i.amount, 0);
  const totalBank = active.filter(i => i.method !== 'cash').reduce((s, i) => s + i.amount, 0);

  const amount = parseFloat(form.amount) || 0;
  const invoices = (outstanding.invoices && outstanding.invoices.length > 0)
    ? outstanding.invoices
    : (outstanding.purchases || []).map(p => ({ _id: p._id, ref: p.purchaseNumber, type: 'purchase', date: p.date, due: p.dueAmount }));
  const allocationPreview = useMemo(() => {
    const rows = [];
    let remaining = amount;
    for (const inv of invoices) {
      if (remaining <= 0) break;
      const apply = Math.min(remaining, inv.due);
      rows.push({ ...inv, apply });
      remaining = Math.round((remaining - apply) * 100) / 100;
    }
    return rows;
  }, [amount, invoices]);

  const canSubmit = amount > 0 && form.supplier && outstanding.totalDue > 0 && amount <= outstanding.totalDue;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!canSubmit) { addToast('Check amount / supplier / outstanding balance', 'error'); return; }
    if (form.method !== 'cash' && !form.bank) { addToast('Please choose a bank', 'error'); return; }
    if (form.method === 'bank' && form.amount > outstanding.totalDue) {
      addToast('Insufficient bank balance. Amount exceeds outstanding total.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/payment-out', { ...form, date: bsToADStr(form.date), amount, bank: form.method === 'cash' ? null : form.bank });
      addToast('Payment recorded', 'success');
      setShowForm(false);
      setForm({ date: adToBsStr(new Date()), supplier: '', amount: '', method: 'cash', bank: '', chequeNumber: '', reference: '', remarks: '' });
      setOutstanding({ invoices: [], totalDue: 0 });
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Error recording payment', 'error'); }
    setSubmitting(false);
  };

  const handleCancel = async (p) => {
    if (!(await showConfirm(`Cancel payment ${p.paymentNumber}? Supplier dues will be restored.`, { danger: true }))) return;
    try {
      await api.post(`/payment-out/${p._id}/cancel`);
      addToast('Payment cancelled', 'success');
      setDetail(null);
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Cancel failed', 'error'); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Payment Out</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Payment'}</button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: '0.5rem', alignItems: 'end', marginBottom: '1rem', padding: '1rem' }}>
        <div className="form-group" style={{ margin: 0 }}><label>From</label><NepaliDatePicker value={startDate} onChange={setStartDate} /></div>
        <div className="form-group" style={{ margin: 0 }}><label>To</label><NepaliDatePicker value={endDate} onChange={setEndDate} /></div>
        <button className="btn btn-primary" onClick={load}>Filter</button>
        <button className="btn btn-secondary" onClick={() => { setStartDate(''); setEndDate(''); load(); }}>All</button>
        <input type="text" placeholder="Search supplier / payment..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '0.4rem 0.7rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', minWidth: 200 }} />
      </div>

      <div className="report-summary" style={{ marginBottom: '1rem' }}>
        <div className="summary-card"><div className="summary-label">Payments</div><div className="summary-value">{active.length}</div></div>
        <div className="summary-card"><div className="summary-label">Total Paid</div><div className="summary-value">{fmt(totalAmount)}</div></div>
        <div className="summary-card"><div className="summary-label">Cash</div><div className="summary-value">{fmt(totalCash)}</div></div>
        <div className="summary-card"><div className="summary-label">Bank/Other</div><div className="summary-value">{fmt(totalBank)}</div></div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card">
          <h3>New Supplier Payment</h3>
          <div className="form-grid">
            <div className="form-group"><label>Date</label><NepaliDatePicker value={form.date} onChange={v => setForm({ ...form, date: v })} /></div>
            <div className="form-group"><label>Supplier *</label>
              <SearchableSelect options={suppliers.map(s => ({ value: s._id, label: s.name }))} value={form.supplier} onChange={v => setForm({ ...form, supplier: v })} placeholder="Search supplier..." required />
              {form.supplier && outstanding.balance !== undefined && outstanding.balance !== 0 && (
                <div style={{ marginTop: 4, fontSize: '0.8rem', fontWeight: 600, color: outstanding.balance > 0 ? '#dc2626' : '#16a34a' }}>
                  Balance: {fmt(Math.abs(outstanding.balance))} {outstanding.balance > 0 ? 'Cr' : 'Dr'}
                </div>
              )}
            </div>
            <div className="form-group"><label>Amount *</label><input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
            <div className="form-group"><label>Method</label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value, bank: e.target.value === 'cash' ? '' : form.bank })}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="qr">QR</option>
              </select>
            </div>
            {form.method !== 'cash' && <div className="form-group"><label>Bank *</label><select value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} required><option value="">-- Select Bank --</option>{banks.map(b => <option key={b._id} value={b._id}>{b.name}{b.accountNumber ? ` (${b.accountNumber})` : ''}</option>)}</select></div>}
            {form.method !== 'cash' && <div className="form-group"><label>Cheque No.</label><input value={form.chequeNumber} onChange={e => setForm({ ...form, chequeNumber: e.target.value })} placeholder="Required for bank" /></div>}
            <div className="form-group"><label>Reference</label><input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Remarks</label><input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>

          <h4 style={{ margin: '0.75rem 0 0.5rem' }}>Open Purchase Dues {outstanding.totalDue > 0 && <small className="text-muted">(Total due: {fmt(outstanding.totalDue)})</small>}</h4>
          {invoices.length > 0 ? (
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>Invoice</th><th className="text-right">Due</th>{amount > 0 && <th className="text-right">Apply</th>}</tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv._id}>
                      <td>{inv.ref} <span className="badge badge-info">{inv.type === 'sale' ? 'Purchase' : 'Other'}</span></td>
                      <td className="text-right">{fmt(inv.due)}</td>
                      {amount > 0 && <td className="text-right">{fmt(allocationPreview.find(a => a._id === inv._id)?.apply || 0)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : form.supplier ? <p className="text-muted">No outstanding dues for this supplier.</p> : <p className="text-muted">Select a supplier to see open invoices.</p>}

          {amount > 0 && outstanding.totalDue > 0 && amount <= outstanding.totalDue && (
            <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Oldest invoices are settled first ({allocationPreview.filter(a => a.apply > 0).length} invoice(s)).</div>
          )}
          <button type="submit" className="btn btn-primary" disabled={!canSubmit || submitting}>{submitting ? 'Saving...' : 'Record Payment'}</button>
        </form>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Payment No</th><th>Date</th><th>Supplier</th><th>Method</th><th>Amount</th><th>Invoices</th><th>Status</th><th>Remarks</th><th>Actions</th></tr></thead>
            <tbody>
              {items.filter(p => !search || (p.supplier?.name || '').toLowerCase().includes(search.toLowerCase()) || (p.paymentNumber || '').toLowerCase().includes(search.toLowerCase())).map(p => (
                <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => setDetail(p)}>
                  <td>{p.paymentNumber}</td>
                  <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                  <td>{p.supplier?.name || '-'}</td>
                  <td>{p.method}</td>
                  <td className="text-right">{fmt(p.amount)}</td>
                  <td>{(p.allocations || []).slice(0, 3).map(a => a.ref || '—').join(', ') || '-'}</td>
                  <td><span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{p.status}</span></td>
                  <td>{p.remarks || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-sm btn-secondary" onClick={(ev) => { ev.stopPropagation(); setDetail(p); }}>View</button>
                      {p.status === 'active' && <button className="btn btn-sm btn-danger" onClick={(ev) => { ev.stopPropagation(); handleCancel(p); }}>Cancel</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan="9" className="text-center">No payments found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (() => {
        const p = detail;
        return (
          <EntryDetailsModal
            title={`Payment Out - ${p.paymentNumber}`}
            subtitle={p.supplier?.name || ''}
            meta={[
              { label: 'Date', value: new Date(p.date).toLocaleDateString('en-IN') },
              { label: 'Method', value: p.method },
              { label: 'Cheque', value: p.chequeNumber || '-' },
              { label: 'Amount', value: fmt(p.amount) },
              { label: 'Debit', value: p.method === 'cash' ? 'Cash' : p.method === 'bank' ? 'Bank' : 'Cash' },
              { label: 'Credit', value: p.method === 'cash' ? 'Supplier' : p.method === 'bank' ? 'Supplier' : 'Supplier' },
              { label: 'Status', value: p.status },
              { label: 'Remarks', value: p.remarks || '-' },
            ]}
            columns={[
              { key: 'purchase', label: 'Invoice', render: (v) => v?.purchaseNumber || '—' },
              { key: 'amount', label: 'Amount', align: 'right', render: (v) => fmt(v) },
            ]}
            rows={p.allocations || []}
            footer={[{ label: 'Total', value: fmt(p.amount) }]}
            actions={p.status === 'active' ? <button className="btn btn-sm btn-danger" onClick={() => handleCancel(p)}>Cancel Payment</button> : null}
            onClose={() => setDetail(null)}
          />
        );
      })()}
    </div>
  );
}
