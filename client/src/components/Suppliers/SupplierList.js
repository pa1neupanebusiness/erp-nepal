import React, { useState, useEffect } from 'react';
import ConfirmModal from '../UI/ConfirmModal';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import api from '../../api';

const fmtNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SupplierList() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', contactPerson: '', email: '', phone: '', address: '', pan: '' });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [detailData, setDetailData] = useState(null);

  useEffect(() => { load(); }, []);
  const load = () => api.get('/suppliers').then(r => setItems(r.data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))));

  const viewDetails = async (s) => {
    setDetailsId(s._id);
    setDetailData(null);
    try {
      const res = await api.get(`/suppliers/${s._id}/outstanding`);
      setDetailData({ supplier: s, purchases: res.data.purchases || [], totalDue: res.data.totalDue || 0 });
    } catch {
      setDetailData({ supplier: s, purchases: [], totalDue: 0 });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) { await api.put(`/suppliers/${editing._id}`, form); setEditing(null); }
    else { await api.post('/suppliers', form); }
    setForm({ name: '', contactPerson: '', email: '', phone: '', address: '', pan: '' });
    setShowForm(false); load();
  };

  const edit = (item) => { setForm(item); setEditing(item); setShowForm(true); };
  const remove = (id) => { setConfirmDelete({ id, message: 'Delete?' }); };

  return (
    <div>
      <div className="page-header">
        <h1>Suppliers</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', contactPerson: '', email: '', phone: '', address: '' }); }}>{showForm ? 'Cancel' : 'Add Supplier'}</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card" style={{ maxWidth: 600 }}>
          <h3>{editing ? 'Edit Supplier' : 'New Supplier'}</h3>
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="form-group"><label>Contact Person</label><input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></div>
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
          <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>PAN</th><th>Address</th><th>Actions</th></tr></thead>
          <tbody>
            {items.map(s => (
              <tr key={s._id} onClick={() => viewDetails(s)} style={{ cursor: 'pointer' }}>
                <td><strong>{s.name}</strong></td><td>{s.contactPerson || '-'}</td><td>{s.email || '-'}</td>
                <td>{s.phone || '-'}</td><td>{s.pan || '-'}</td><td>{s.address || '-'}</td>
                <td className="action-cell" onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm" onClick={() => edit(s)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(s._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailsId && detailData && (
        <EntryDetailsModal
          title={detailData.supplier.name}
          subtitle="Supplier Details & Outstanding Purchases"
          meta={[
            { label: 'Contact', value: detailData.supplier.contactPerson || '-' },
            { label: 'Phone', value: detailData.supplier.phone || '-' },
            { label: 'Email', value: detailData.supplier.email || '-' },
            { label: 'PAN', value: detailData.supplier.pan || '-' },
            { label: 'Address', value: detailData.supplier.address || '-' },
            { label: 'Outstanding Due', value: fmtNPR(detailData.totalDue) },
          ]}
          columns={[
            { key: 'purchaseNumber', label: 'Purchase No' },
            { key: 'date', label: 'Date', render: (v) => new Date(v).toLocaleDateString('en-IN') },
            { key: 'grandTotal', label: 'Total', align: 'right', render: (v) => fmtNPR(v) },
            { key: 'paidAmount', label: 'Paid', align: 'right', render: (v) => fmtNPR(v) },
            { key: 'dueAmount', label: 'Due', align: 'right', render: (v) => fmtNPR(v) },
          ]}
          rows={detailData.purchases}
          footer={[{ label: 'Total Due', value: detailData.totalDue, render: (v) => fmtNPR(v) }]}
          onClose={() => setDetailsId(null)}
        />
      )}
      <ConfirmModal open={!!confirmDelete} title="Confirm Delete" message={confirmDelete?.message} onConfirm={async () => { if (confirmDelete) { await api.delete(`/suppliers/${confirmDelete.id}`); load(); } setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
