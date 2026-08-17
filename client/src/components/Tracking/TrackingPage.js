import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { adToBsStr } from '../UI/NepaliDatePicker';
import { printTrackingLabel } from './printTrackingLabel';

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

const CARRIERS = ['fedex', 'dhl', 'pathao', 'custom'];

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
  const [availableSales, setAvailableSales] = useState([]);
  const [selectedSale, setSelectedSale] = useState(null);
  const [createForm, setCreateForm] = useState({ carrier: '', estimatedDelivery: '', note: '' });
  const [updateForm, setUpdateForm] = useState({ status: '', location: '', note: '', carrier: '', trackingNumber: '' });
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState(null);

  useEffect(() => { load(); loadStats(); api.get('/company').then(r => setCompany(r.data)).catch(() => {}); }, []);

  const load = () => {
    const params = {};
    if (filter) params.status = filter;
    if (search) params.search = search;
    api.get('/tracking', { params }).then(r => setItems(r.data)).catch(() => {});
  };

  const loadStats = () => {
    api.get('/tracking/company-stats').then(r => setStats(r.data)).catch(() => {});
  };

  const loadAvailableSales = () => {
    api.get('/tracking/available-sales').then(r => setAvailableSales(r.data)).catch(() => {});
  };

  const openCreate = () => {
    setShowCreate(true);
    setSelectedSale(null);
    setCreateForm({ carrier: '', estimatedDelivery: '', note: '' });
    loadAvailableSales();
  };

  const loadDetail = (orderId) => {
    api.get(`/tracking/${orderId}`).then(r => {
      setDetail(r.data);
      setUpdateForm({ status: r.data.status, location: '', note: '', carrier: r.data.carrier || '', trackingNumber: r.data.trackingNumber || '' });
    }).catch(() => addToast('Failed to load tracking', 'error'));
  };

  const handleCreate = async () => {
    if (!selectedSale) return addToast('Select a sale order first', 'error');
    setSaving(true);
    try {
      const { data } = await api.post('/tracking', {
        orderId: selectedSale._id,
        carrier: createForm.carrier,
        estimatedDelivery: createForm.estimatedDelivery || undefined,
        note: createForm.note,
      });
      addToast(`Tracking created: ${data.trackingNumber}`, 'success');
      setShowCreate(false);
      setSelectedSale(null);
      load();
      loadStats();
      printTrackingLabel(data, company);
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
        {isAdmin && <button className="btn btn-primary" onClick={showCreate ? () => setShowCreate(false) : openCreate}>{showCreate ? 'Cancel' : 'Add Tracking'}</button>}
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
          <h3>Create Order Tracking</h3>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '0.75rem' }}>Select a sale order from the list below. Tracking number will be auto-generated.</p>

          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontWeight: 600 }}>Select Sale Order *</label>
            <input
              type="text"
              placeholder="Search by invoice number or customer name..."
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '0.5rem' }}
              onChange={(e) => {
                const q = e.target.value.toLowerCase();
                if (!q) { loadAvailableSales(); return; }
                setAvailableSales(prev => prev.filter(s =>
                  (s.invoiceNumber || '').toLowerCase().includes(q) ||
                  (s.customer?.name || '').toLowerCase().includes(q)
                ));
              }}
            />
            <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              {availableSales.length === 0 && <p style={{ padding: '1rem', color: '#64748b', textAlign: 'center', fontSize: '0.85rem' }}>No untracked sales available</p>}
              {availableSales.map(s => (
                <div key={s._id}
                  onClick={() => setSelectedSale(s)}
                  style={{
                    padding: '0.6rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    background: selectedSale?._id === s._id ? '#eff6ff' : 'transparent',
                    borderLeft: selectedSale?._id === s._id ? '3px solid #3b82f6' : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '0.9rem' }}>{s.invoiceNumber}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{s.customer?.name || 'Walk-in'}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{formatNPR(s.grandTotal)}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.date ? new Date(s.date).toLocaleDateString('en-GB') : ''}</div>
                    </div>
                  </div>
                  {selectedSale?._id === s._id && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#dbeafe', borderRadius: '6px', fontSize: '0.8rem' }}>
                      <div><strong>Customer:</strong> {s.customer?.name || 'Walk-in'} {s.customer?.phone ? `| ${s.customer.phone}` : ''}</div>
                      <div><strong>Items:</strong> {(s.items || []).map(i => i.name || i.productName).filter(Boolean).join(', ') || '-'}</div>
                      <div style={{ marginTop: '0.25rem', color: '#1d4ed8', fontWeight: 600 }}>Tracking number will be auto-generated after creation</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedSale && (
            <div className="form-grid" style={{ marginTop: '0.75rem' }}>
              <div className="form-group"><label>Carrier</label>
                <select value={createForm.carrier} onChange={e => setCreateForm({ ...createForm, carrier: e.target.value })}>
                  <option value="">Select carrier...</option>
                  {CARRIERS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Est. Delivery</label><input type="date" value={createForm.estimatedDelivery} onChange={e => setCreateForm({ ...createForm, estimatedDelivery: e.target.value })} /></div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Note</label><input value={createForm.note} onChange={e => setCreateForm({ ...createForm, note: e.target.value })} placeholder="Optional note" /></div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !selectedSale}>{saving ? 'Creating...' : 'Create Tracking'}</button>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
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
                  <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{t.trackingNumber || '-'}</code></td>
                  <td>{t.estimatedDelivery ? adToBsStr(new Date(t.estimatedDelivery)) : '-'}</td>
                  <td>{new Date(t.updatedAt).toLocaleDateString('en-GB')}</td>
                  <td className="action-cell">
                    <button className="btn btn-sm" onClick={() => loadDetail(t.orderId._id || t.orderId)}>View</button>
                    {t.trackingNumber && <button className="btn btn-sm" onClick={() => printTrackingLabel(t, company)} title="Print tracking label">Print</button>}
                  </td>
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
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {detail.trackingNumber && <button className="btn btn-sm" onClick={() => printTrackingLabel(detail, company)}>Print Label</button>}
                <button className="btn btn-sm modal-close-x" onClick={() => setDetail(null)}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div><strong>Customer:</strong> {detail.customerName || detail.customer?.name || '-'}</div>
                <div><strong>Status:</strong> <span className={`badge ${STATUS_COLORS[detail.status]}`}>{STATUS_LABELS[detail.status]}</span></div>
                <div><strong>Carrier:</strong> {detail.carrier ? detail.carrier.toUpperCase() : '-'}</div>
                <div><strong>Tracking #:</strong> <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>{detail.trackingNumber || '-'}</code></div>
                <div><strong>Est. Delivery:</strong> {detail.estimatedDelivery ? adToBsStr(new Date(detail.estimatedDelivery)) : '-'}</div>
                <div><strong>Current Location:</strong> {detail.currentLocation || '-'}</div>
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
                        {CARRIERS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>Note</label><input value={updateForm.note} onChange={e => setUpdateForm({ ...updateForm, note: e.target.value })} placeholder="Optional note" /></div>
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
