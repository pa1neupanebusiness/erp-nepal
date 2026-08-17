import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { adToBsStr } from '../UI/NepaliDatePicker';

const STATUS_LABELS = {
  pending: 'Pending', processing: 'Processing', shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery', delivered: 'Delivered', returned: 'Returned',
};

const STATUS_COLORS = {
  pending: 'badge-secondary', processing: 'badge-info', shipped: 'badge-warning',
  out_for_delivery: 'badge-info', delivered: 'badge-success', returned: 'badge-danger',
};

export default function BranchDashboard() {
  const addToast = useToast();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [updateForm, setUpdateForm] = useState({ status: '', location: '', note: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [filter]);

  const load = () => {
    const params = {};
    if (filter) params.status = filter;
    api.get('/tracking/branch-orders', { params }).then(r => setOrders(r.data)).catch(() => {});
  };

  const loadDetail = (orderId) => {
    api.get(`/tracking/${orderId}`).then(r => {
      setDetail(r.data);
      setUpdateForm({ status: r.data.status, location: r.data.currentLocation || '', note: '' });
    }).catch(() => addToast('Failed to load tracking', 'error'));
  };

  const handleStatusUpdate = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/tracking/${detail.orderId._id || detail.orderId}/status`, updateForm);
      setDetail(data);
      load();
      addToast('Status updated', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update status', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header"><h1>Branch Orders <span className="badge badge-info">{orders.length}</span></h1></div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {['', 'pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'returned'].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(s)}>
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Driver</th><th>Location</th><th>Updated</th><th>Action</th></tr></thead>
            <tbody>
              {orders.map(t => (
                <tr key={t._id}>
                  <td><strong>{t.orderNumber}</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.trackingNumber || 'No tracking #'}</span></td>
                  <td>{t.customer?.name || t.customerName || '-'}</td>
                  <td><span className={`badge ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span></td>
                  <td>{t.driver?.name || <span style={{ color: '#f59e0b' }}>Unassigned</span>}</td>
                  <td>{t.currentLocation || '-'}</td>
                  <td>{new Date(t.updatedAt).toLocaleDateString('en-GB')}</td>
                  <td><button className="btn btn-sm btn-primary" onClick={() => loadDetail(t.orderId._id || t.orderId)}>Update</button></td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan="7" className="text-center">No orders for this branch</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Order {detail.orderNumber}</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setDetail(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div><strong>Customer:</strong> {detail.customer?.name || '-'}</div>
                <div><strong>Status:</strong> <span className={`badge ${STATUS_COLORS[detail.status]}`}>{STATUS_LABELS[detail.status]}</span></div>
                <div><strong>Driver:</strong> {detail.driver?.name || 'Unassigned'}</div>
                <div><strong>Location:</strong> {detail.currentLocation || '-'}</div>
                <div><strong>Tracking #:</strong> {detail.trackingNumber || '-'}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                <h4 style={{ marginTop: 0 }}>Update Status</h4>
                <div className="form-grid">
                  <div className="form-group"><label>Status</label>
                    <select value={updateForm.status} onChange={e => setUpdateForm({ ...updateForm, status: e.target.value })}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>Location</label><input value={updateForm.location} onChange={e => setUpdateForm({ ...updateForm, location: e.target.value })} placeholder="e.g. Local Hub" /></div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Note</label><input value={updateForm.note} onChange={e => setUpdateForm({ ...updateForm, note: e.target.value })} placeholder="Optional note" /></div>
                </div>
                <button className="btn btn-primary" onClick={handleStatusUpdate} disabled={saving}>{saving ? 'Saving...' : 'Update Status'}</button>
              </div>
              <h4 style={{ marginTop: '1rem' }}>Timeline</h4>
              <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
                {(detail.events || []).slice().reverse().map((ev, i) => (
                  <div key={i} style={{ marginBottom: '1rem', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '-1.5rem', top: '0.25rem', width: '10px', height: '10px', borderRadius: '50%', background: i === 0 ? '#3b82f6' : '#94a3b8' }} />
                    {i < (detail.events || []).length - 1 && <div style={{ position: 'absolute', left: '-1.25rem', top: '0.75rem', bottom: '-0.75rem', width: '2px', background: '#e2e8f0' }} />}
                    <div style={{ fontSize: '0.85rem' }}>
                      <strong>{STATUS_LABELS[ev.status] || ev.status}</strong>
                      {ev.location && <span style={{ color: '#64748b' }}> — {ev.location}</span>}
                      <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{ev.note}</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{new Date(ev.timestamp).toLocaleString('en-GB')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
