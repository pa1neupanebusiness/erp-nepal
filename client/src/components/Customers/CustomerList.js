import React, { useState, useEffect } from 'react';
import ConfirmModal from '../UI/ConfirmModal';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import api from '../../api';
import { printEntry } from '../UI/printEntry';

export default function CustomerList() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', pan: '' });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [txMap, setTxMap] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);
  const load = () => api.get('/customers').then(r => setItems(r.data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))));
  const filtered = items.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search) || (c.pan || '').includes(search));

  const loadTransactions = async (c) => {
    if (txMap[c._id]) return;
    try {
      const { data } = await api.get(`/customers/${c._id}/transactions`);
      setTxMap(prev => ({ ...prev, [c._id]: data }));
    } catch (err) { /* ignore */ }
  };

  const handleRowClick = (c) => {
    setDetailsId(c._id);
    loadTransactions(c);
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const fmtDate = (d) => {
    const t = new Date(d);
    return isNaN(t.getTime()) ? '-' : t.toLocaleDateString('en-IN');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) { await api.put(`/customers/${editing._id}`, form); setEditing(null); }
    else { await api.post('/customers', form); }
    setForm({ name: '', email: '', phone: '', address: '', pan: '' }); setShowForm(false); load();
  };

  const edit = (item) => { setForm(item); setEditing(item); setShowForm(true); };
  const remove = (id) => { setConfirmDelete({ id, message: 'Delete?' }); };

  return (
    <div>
      <div className="page-header">
        <h1>Customers</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input className="search-input" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-secondary" onClick={() => {
            const rows = filtered.map(c => ({ Name: c.name, Email: c.email || '-', Phone: c.phone || '-', PAN: c.pan || '-', Address: c.address || '-', 'Loyalty Points': String(c.loyaltyPoints || 0) }));
            if (rows.length === 0) return;
            printEntry({ title: 'Customers List', columns: Object.keys(rows[0]).map(k => ({ key: k, label: k })), rows, footer: [{ label: 'Total Customers', value: String(rows.length) }] });
          }}>Print</button>
          <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', email: '', phone: '', address: '' }); }}>{showForm ? 'Cancel' : 'Add Customer'}</button>
        </div>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card" style={{ maxWidth: 600 }}>
          <h3>{editing ? 'Edit Customer' : 'New Customer'}</h3>
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-group"><label>Address</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="form-group"><label>PAN No.</label><input value={form.pan || ''} onChange={e => setForm({ ...form, pan: e.target.value })} placeholder="Optional" /></div>
          </div>
          <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
        </form>
      )}
      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>PAN</th><th>Address</th><th>Loyalty Points</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(c => {
              const tx = txMap[c._id];
              const allTx = tx ? [
                ...(tx.sales || []).map(s => ({ type: 'Sale', date: s.invoiceDate || s.date || s.createdAt, ref: s.invoiceNumber || s._id, amount: s.total, balance: s.dueAmount || 0 })),
                ...(tx.emis || []).map(e => ({ type: 'EMI', date: e.createdAt || e.date, ref: e.emiNumber || e._id, amount: e.netAmount || e.totalPrice || 0, balance: e.remainingAmount || 0 })),
              ] : [];
              return (
                <tr key={c._id} onClick={() => handleRowClick(c)} style={{ cursor: 'pointer' }}>
                  <td>{c.name}</td><td>{c.email || '-'}</td><td>{c.phone || '-'}</td>
                  <td>{c.pan || '-'}</td><td>{c.address || '-'}</td><td>{c.loyaltyPoints || 0}</td>
                  <td className="action-cell" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => handleRowClick(c)}>View</button>
                    <button className="btn btn-sm" style={{ marginLeft: '0.25rem' }} onClick={() => edit(c)}>Edit</button>
                    <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.25rem' }} onClick={() => remove(c._id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan="7" className="text-center">No customers</td></tr>}
          </tbody>
        </table>
      </div>
      {detailsId && (() => {
        const c = items.find(x => x._id === detailsId);
        if (!c) return null;
        const tx = txMap[c._id] || { sales: [], emis: [] };
        const allTx = [
          ...(tx.sales || []).map(s => ({ type: 'Sale', date: s.invoiceDate || s.date || s.createdAt, ref: s.invoiceNumber || s._id, amount: s.total || 0, balance: s.dueAmount || 0 })),
          ...(tx.emis || []).map(e => ({ type: 'EMI', date: e.createdAt || e.date, ref: e.emiNumber || e._id, amount: e.netAmount || e.totalPrice || 0, balance: e.remainingAmount || 0 })),
        ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        return (
          <EntryDetailsModal
            title={c.name}
            subtitle="Customer Transactions"
            meta={[
              { label: 'Email', value: c.email || '-' },
              { label: 'Phone', value: c.phone || '-' },
              { label: 'PAN', value: c.pan || '-' },
              { label: 'Address', value: c.address || '-' },
              { label: 'Loyalty Points', value: String(c.loyaltyPoints || 0) },
            ]}
            columns={[
              { key: 'type', label: 'Type' },
              { key: 'date', label: 'Date', render: (d) => fmtDate(d) },
              { key: 'ref', label: 'Reference' },
              { key: 'amount', label: 'Amount', align: 'right', render: (v) => formatNPR(v) },
              { key: 'balance', label: 'Balance', align: 'right', render: (v) => formatNPR(v) },
            ]}
            rows={allTx}
            footer={[
              { label: 'Total Amount', value: formatNPR(allTx.reduce((s, t) => s + (t.amount || 0), 0)) },
              { label: 'Total Balance', value: formatNPR(allTx.reduce((s, t) => s + (t.balance || 0), 0)) },
            ]}
            onClose={() => setDetailsId(null)}
          />
        );
      })()}
      <ConfirmModal open={!!confirmDelete} title="Confirm Delete" message={confirmDelete?.message} onConfirm={async () => { if (confirmDelete) { await api.delete(`/customers/${confirmDelete.id}`); load(); } setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
