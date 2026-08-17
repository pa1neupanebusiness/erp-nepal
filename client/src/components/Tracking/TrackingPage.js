import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { adToBsStr } from '../UI/NepaliDatePicker';

const STATUS_LABELS = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  returned: 'Returned',
};

const STATUS_COLORS = {
  pending: 'badge-secondary',
  processing: 'badge-info',
  shipped: 'badge-warning',
  out_for_delivery: 'badge-info',
  delivered: 'badge-success',
  returned: 'badge-danger',
};

const CARRIERS = ['', 'fedex', 'dhl', 'pathao', 'custom'];

export default function TrackingPage() {
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';

  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ orderId: '', carrier: '', trackingNumber: '', estimatedDelivery: '', note: '' });
  const [updateForm, setUpdateForm] = useState({ status: '', location: '', note: '', carrier: '', trackingNumber: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); loadStats(); }, []);

  const load = () => {
    const params = {};
    if (filter) params.status = filter;
    if (search) params.search = search;
    api.get('/tracking', { params }).then(r => setItems(r.data)).catch(() => {});
  };

  const loadStats = () => {
    api.get('/tracking/company-stats').then(r => setStats(r.data)).catch(() => {});
  };

  const loadDetail = (orderId) => {
    api.get(`/tracking/${orderId}`).then(r => {
      setDetail(r.data);
      setUpdateForm({ status: r.data.status, location: '', note: '', carrier: r.data.carrier || '', trackingNumber: r.data.trackingNumber || '' });
    }).catch(() => addToast('Failed to load tracking', 'error'));
  };

  const handleCreate = async () => {
    if (!createForm.orderId) return addToast('Enter an Order ID', 'error');
    setSaving(true);
    try {
      await api.post('/tracking', createForm);
      addToast('Tracking created', 'success');
      setShowCreate(false);
      setCreateForm({ orderId: '', carrier: '', trackingNumber: '', estimatedDelivery: '', note: '' });
      load();
      loadStats();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create tracking', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/tracking/${detail.orderId._id || detail.orderId}/status`, updateForm);
      setDetail(data);
      load();
      loadStats();
      addToast('Status updated', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update status', 'error');
    } finally {
      setSaving(false);
    }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <h1>Order Tracking <span className="badge badge-info">{stats.total || 0}</span></h1>
        {isAdmin && <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Cancel' : 'Add Tracking'}</button>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {['', 'pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'returned'].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFilter(s); setTimeout(load, 0); }}>
            {s ? STATUS_LABELS[s] : `All (${stats.total || 0})`}
            {s && stats[s] ? ` (${stats[s]})` : ''}
          </button>
        ))}
      </div>

      {isAdmin && showCreate && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>Add Order Tracking</h3>
          <div className="form-grid">
            <div className="form-group"><label>Order ID *</label><input value={createForm.orderId} onChange={e => setCreateForm({ ...createForm, orderId: e.target.value })} placeholder="Sale _id" /></div>
            <div className="form-group"><label>Carrier</label>
              <select value={createForm.carrier} onChange={e => setCreateForm({ ...createForm, carrier: e.target.value })}>
                <option value="">None</option>
                {CARRIERS.filter(Boolean).map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Tracking Number</label><input value={createForm.trackingNumber} onChange={e => setCreateForm({ ...createForm, trackingNumber: e.target.value })} /></div>
            <div className="form-group"><label>Est. Delivery</label><input type="date" value={createForm.estimatedDelivery} onChange={e => setCreateForm({ ...createForm, estimatedDelivery: e.target.value })} /></div>
            <div className="form-group"><label>Note</label><input value={createForm.note} onChange={e => setCreateForm({ ...createForm, note: e.target.value })} /></div>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Tracking'}</button>
        </div>
      )}

      <div className="card">
        <div style={{ padding: '0.5rem', marginBottom: '0.5rem' }}>
          <input placeholder="Search by order number..." value={search} onChange={e => { setSearch(e.target.value); setTimeout(load, 300); }} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }} />
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Status</th><th>Carrier</th><th>Tracking #</th><th>Est. Delivery</th><th>Updated</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map(t => (
                <tr key={t._id}>
                  <td><strong>{t.orderNumber}</strong></td>
                  <td>{t.customerName || t.customer?.name || '-'}</td>
                  <td><span className={`badge ${STATUS_COLORS[t.status] || 'badge-secondary'}`}>{STATUS_LABELS[t.status] || t.status}</span></td>
                  <td>{t.carrier ? t.carrier.toUpperCase() : '-'}</td>
                  <td>{t.trackingNumber || '-'}</td>
                  <td>{t.estimatedDelivery ? adToBsStr(new Date(t.estimatedDelivery)) : '-'}</td>
                  <td>{new Date(t.updatedAt).toLocaleDateString('en-GB')}</td>
                  <td><button className="btn btn-sm" onClick={() => loadDetail(t.orderId._id || t.orderId)}>View</button></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan="8" className="text-center">No tracking records</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Tracking - {detail.orderNumber}</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setDetail(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div><strong>Customer:</strong> {detail.customerName || detail.customer?.name || '-'}</div>
                <div><strong>Status:</strong> <span className={`badge ${STATUS_COLORS[detail.status]}`}>{STATUS_LABELS[detail.status]}</span></div>
                <div><strong>Carrier:</strong> {detail.carrier ? detail.carrier.toUpperCase() : '-'}</div>
                <div><strong>Tracking #:</strong> {detail.trackingNumber || '-'}</div>
                <div><strong>Est. Delivery:</strong> {detail.estimatedDelivery ? adToBsStr(new Date(detail.estimatedDelivery)) : '-'}</div>
              </div>

              {isAdmin && (
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                  <h4 style={{ marginTop: 0 }}>Update Status</h4>
                  <div className="form-grid">
                    <div className="form-group"><label>Status</label>
                      <select value={updateForm.status} onChange={e => setUpdateForm({ ...updateForm, status: e.target.value })}>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>Location</label><input value={updateForm.location} onChange={e => setUpdateForm({ ...updateForm, location: e.target.value })} placeholder="e.g. Kathmandu Hub" /></div>
                    <div className="form-group"><label>Carrier</label>
                      <select value={updateForm.carrier} onChange={e => setUpdateForm({ ...updateForm, carrier: e.target.value })}>
                        <option value="">None</option>
                        {CARRIERS.filter(Boolean).map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>Tracking Number</label><input value={updateForm.trackingNumber} onChange={e => setUpdateForm({ ...updateForm, trackingNumber: e.target.value })} /></div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Note</label><input value={updateForm.note} onChange={e => setUpdateForm({ ...updateForm, note: e.target.value })} placeholder="Optional note" /></div>
                  </div>
                  <button className="btn btn-primary" onClick={handleStatusUpdate} disabled={saving}>{saving ? 'Saving...' : 'Update Status'}</button>
                </div>
              )}

              <h4>Timeline</h4>
              <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
                {(detail.events || []).slice().reverse().map((ev, i) => (
                  <div key={i} style={{ marginBottom: '1rem', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '-1.5rem', top: '0.25rem', width: '10px', height: '10px', borderRadius: '50%', background: i === 0 ? '#3b82f6' : '#94a3b8' }} />
                    {i < (detail.events || []).length - 1 && <div style={{ position: 'absolute', left: '-1.25rem', top: '0.75rem', bottom: '-0.75rem', width: '2px', background: '#e2e8f0' }} />}
                    <div style={{ fontSize: '0.85rem' }}>
                      <strong>{STATUS_LABELS[ev.status] || ev.status}</strong>
                      {ev.location && <span style={{ color: '#64748b' }}> — {ev.location}</span>}
                      <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{ev.note}</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{new Date(ev.timestamp).toLocaleString('en-GB')} {ev.updatedBy?.name ? `by ${ev.updatedBy.name}` : ''}</div>
                    </div>
                  </div>
                ))}
                {(!detail.events || detail.events.length === 0) && <p style={{ color: '#94a3b8' }}>No events recorded</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
