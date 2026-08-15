import React, { useState, useEffect } from 'react';
import ConfirmModal from '../UI/ConfirmModal';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import SearchableSelect from '../UI/SearchableSelect';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import api from '../../api';

export default function Vouchers() {
  const [items, setItems] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ type: 'receipt', date: adToBsStr(new Date()), account: '', reference: '', description: '' });
  const [payments, setPayments] = useState([{ method: 'cash', amount: '' }]);
  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState('receipt');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [detailsId, setDetailsId] = useState(null);

  useEffect(() => { load(); api.get('/accounts').then(r => setAccounts(r.data)); }, []);
  const load = () => {
    api.get('/vouchers', { params: { type: tab } }).then(r => setItems(r.data.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))));
    api.get('/vouchers/summary').then(r => setSummary(r.data)).catch(() => {});
  };

  const methodOptions = [
    { value: 'cash', label: 'Cash (Nagad)' },
    { value: 'bank', label: 'Bank' },
    { value: 'qr', label: 'QR (Mobile Banking)' },
  ];

  const toggleMethod = (method) => {
    setPayments(prev => {
      const exists = prev.find(p => p.method === method);
      if (exists) return prev.filter(p => p.method !== method);
      return [...prev, { method, amount: '' }];
    });
  };

  const setMethodAmount = (method, amount) => {
    setPayments(prev => prev.map(p => p.method === method ? { ...p, amount } : p));
  };

  const totalAmount = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPayments = payments.filter(p => parseFloat(p.amount) > 0);
    if (cleanPayments.length === 0) return;
    await api.post('/vouchers', {
      ...form,
      date: bsToADStr(form.date),
      amount: cleanPayments.reduce((s, p) => s + parseFloat(p.amount), 0),
      payments: cleanPayments.map(p => ({ method: p.method, amount: parseFloat(p.amount) })),
    });
    setForm({ type: tab, date: adToBsStr(new Date()), account: '', reference: '', description: '' });
    setPayments([{ method: 'cash', amount: '' }]);
    setShowForm(false);
    load();
  };

  const cancelVoucher = (id) => { setConfirmDelete({ id, message: 'Cancel this voucher?' }); };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const typeTabs = [
    { key: 'receipt', label: 'Receipt Voucher (Prapti)' },
    { key: 'payment', label: 'Payment Voucher (Bhuktani)' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Voucher Management</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {summary && <span className="fiscal-badge">Net: {formatNPR(summary.netCashFlow)}</span>}
          <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setForm({ ...form, type: tab }); }}>{showForm ? 'Cancel' : 'New Voucher'}</button>
        </div>
      </div>

      <div className="tabs">
        {typeTabs.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => { setTab(t.key); setShowForm(false); }}>{t.label}</button>
        ))}
      </div>

      {summary && (
        <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1rem' }}>
          <div className="card" style={{ borderLeft: '4px solid #059669' }}>
            <div className="card-label">Receipts (This Month)</div>
            <div className="card-value">{formatNPR(summary.totalReceipts)}</div>
          </div>
          <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
            <div className="card-label">Payments (This Month)</div>
            <div className="card-value">{formatNPR(summary.totalPayments)}</div>
          </div>
          <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
            <div className="card-label">Net Cash Flow</div>
            <div className="card-value">{formatNPR(summary.netCashFlow)}</div>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card" style={{ maxWidth: 600 }}>
          <h3>New {tab === 'receipt' ? 'Receipt' : 'Payment'} Voucher</h3>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group"><label>Date</label><NepaliDatePicker value={form.date} onChange={v => setForm({ ...form, date: v })} required /></div>
            <div className="form-group"><label>Payment Methods</label>
              <div className="voucher-methods">
                {methodOptions.map(m => {
                  const selected = payments.some(p => p.method === m.value);
                  return (
                    <label key={m.value} className={`voucher-method-chip ${selected ? 'selected' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', border: selected ? '1.5px solid #2563eb' : '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', background: selected ? '#eff6ff' : '#fff', fontSize: '0.85rem' }}>
                      <input type="checkbox" checked={selected} onChange={() => toggleMethod(m.value)} style={{ width: '16px', height: '16px' }} />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="form-group"><label>Account</label><SearchableSelect
              options={accounts.filter(a => ['asset', 'liability', 'equity', 'revenue'].includes(a.type)).map(a => ({ value: a._id, label: `${a.code} - ${a.name}` }))}
              value={form.account}
              onChange={v => setForm({ ...form, account: v })}
              required
              placeholder="Search account..."
            /></div>
            <div className="form-group"><label>Reference</label><input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
            <div className="form-group"><label>Description *</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required /></div>
          </div>

          <div className="voucher-split" style={{ marginTop: '0.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Amount by Method</label>
              {payments.length === 0 && <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Select at least one payment method</p>}
              <div className="voucher-split-grid" style={{ display: 'grid', gap: '0.5rem' }}>
                {payments.map(p => {
                  const meta = methodOptions.find(m => m.value === p.method);
                  return (
                    <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ width: 170, fontSize: '0.85rem', fontWeight: 600 }}>{meta?.label}</span>
                      <input
                        type="number" step="0.01" min="0"
                        placeholder="0.00"
                        value={p.amount}
                        onChange={e => setMethodAmount(p.method, e.target.value)}
                        style={{ flex: 1, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                      />
                      <button type="button" onClick={() => toggleMethod(p.method)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem' }} title="Remove">✕</button>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Total</span>
                <strong style={{ fontSize: '1rem' }}>{formatNPR(totalAmount)}</strong>
              </div>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={totalAmount <= 0}>Create Voucher</button>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead><tr><th>Voucher No.</th><th>Date</th><th>Account</th><th>Amount</th><th>Method</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {items.map(v => {
              const vPayments = (v.payments && v.payments.length ? v.payments : [{ method: v.paymentMethod, amount: v.amount }]);
              return (
                <tr key={v._id} onClick={() => setDetailsId(v._id)} style={{ cursor: 'pointer' }}>
                  <td><strong>{v.voucherNumber}</strong></td>
                  <td>{adToBsStr(v.date)}</td>
                  <td>{v.account?.name || '-'}</td>
                  <td>{formatNPR(v.amount)}</td>
                  <td>
                    {vPayments.map((p, i) => (
                      <span key={i} className="badge badge-success" style={{ marginRight: 4 }}>{p.method}: {formatNPR(p.amount)}</span>
                    ))}
                  </td>
                  <td>{v.description}</td>
                  <td><span className={`badge ${v.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{v.status}</span></td>
                  <td className="action-cell" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => setDetailsId(v._id)}>View</button>
                    {v.status === 'active' && <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.25rem' }} onClick={(e) => { e.stopPropagation(); cancelVoucher(v._id); }}>Cancel</button>}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan="8" className="text-center">No vouchers</td></tr>}
          </tbody>
        </table>
      </div>
      {detailsId && (() => {
        const v = items.find(x => x._id === detailsId);
        if (!v) return null;
        const vPayments = (v.payments && v.payments.length ? v.payments : [{ method: v.paymentMethod, amount: v.amount }]);
        const accountName = v.account?.name || v.accountName || '-';
        return (
          <EntryDetailsModal
            title={v.voucherNumber || 'Voucher'}
            subtitle={v.type === 'receipt' ? 'Receipt Voucher (Prapti)' : 'Payment Voucher (Bhuktani)'}
            meta={[
              { label: 'Date', value: adToBsStr(v.date) },
              { label: 'Account', value: accountName },
              { label: 'Status', value: v.status },
              { label: 'Reference', value: v.reference || '-' },
              ...(v.description ? [{ label: 'Description', value: v.description }] : []),
            ]}
            columns={[
              { key: 'method', label: 'Method' },
              { key: 'amount', label: 'Amount', align: 'right', render: (x) => formatNPR(x) },
            ]}
            rows={vPayments}
            footer={[
              { label: 'Total', value: formatNPR(v.amount) },
            ]}
            onClose={() => setDetailsId(null)}
          />
        );
      })()}
      <ConfirmModal open={!!confirmDelete} title="Confirm Cancel" message={confirmDelete?.message} onConfirm={async () => { if (confirmDelete) { await api.put(`/vouchers/${confirmDelete.id}/cancel`); load(); } setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
