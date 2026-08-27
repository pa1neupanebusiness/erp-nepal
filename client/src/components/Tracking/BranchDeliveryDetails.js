import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { printTrackingLabel } from './printTrackingLabel';

const STATUS_LABELS = {
  pending: 'Pending', processing: 'Processing', shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery', delivered: 'Delivered', returned: 'Returned',
};
const STATUS_COLORS = {
  pending: 'badge-secondary', processing: 'badge-info', shipped: 'badge-warning',
  out_for_delivery: 'badge-info', delivered: 'badge-success', returned: 'badge-danger',
};

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 Days' },
  { key: 'month', label: 'Last 30 Days' },
  { key: 'custom', label: 'Custom' },
];

function dateStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function dateEnd(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function presetRange(key) {
  const now = new Date();
  if (key === 'today') return { from: dateStart(now), to: dateEnd(now) };
  if (key === 'week') {
    const from = new Date(now); from.setDate(now.getDate() - 6); return { from: dateStart(from), to: dateEnd(now) };
  }
  if (key === 'month') {
    const from = new Date(now); from.setDate(now.getDate() - 29); return { from: dateStart(from), to: dateEnd(now) };
  }
  return null;
}

export default function BranchDeliveryDetails() {
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';
  const isBranchStaff = (user.groups || []).includes('branch');

  const [preset, setPreset] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [branchStats, setBranchStats] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [company, setCompany] = useState(null);

  const buildDateParams = () => {
    if (preset === 'custom') {
      if (!customFrom || !customTo) return { from: '', to: '' };
      return { from: dateStart(new Date(customFrom)).toISOString(), to: dateEnd(new Date(customTo)).toISOString() };
    }
    const r = presetRange(preset);
    return r ? { from: r.from.toISOString(), to: r.to.toISOString() } : { from: '', to: '' };
  };

  useEffect(() => {
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [preset, customFrom, customTo]);

  const loadData = async () => {
    setLoading(true);
    const params = buildDateParams();
    // For branch staff, restrict to their own branch
    if (!isAdmin && user.branch) params.branchId = user.branch;
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get('/tracking/branch-stats', { params }),
        api.get('/tracking/branch-orders', { params }),
      ]);
      setBranchStats(statsRes.data || []);
      setOrders(ordersRes.data || []);
      // If branch staff, always show only their branch
      if (!isAdmin && user.branch) setSelectedBranch(statsRes.data && statsRes.data.length ? statsRes.data[0]._id : '');
    } catch (err) { addToast(err.response?.data?.message || 'Failed to load delivery data', 'error'); }
    setLoading(false);
  };

  const filtered = selectedBranch
    ? orders.filter(o => (o.sourceBranch?._id === selectedBranch || o?.branch?._id === selectedBranch))
    : orders;
  const selectedBranchInfo = branchStats.find(b => b._id === selectedBranch);

  const loadDetail = async (order) => {
    const orderId = order.orderId?._id || order.orderId;
    try {
      const { data } = await api.get('/tracking/' + orderId);
      setDetail(data);
    } catch { addToast('Failed to load detail', 'error'); }
  };

  const selectPreset = (key) => {
    setPreset(key);
    setSelectedBranch('');
  };

  return (
    <div>
      <div className="page-header">
        <h1>Branch Delivery Details</h1>
        <button className="btn btn-secondary" onClick={loadData}>Refresh</button>
      </div>

      <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            {PRESETS.map(p => (
              <button key={p.key} className={`btn btn-sm ${preset === p.key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => selectPreset(p.key)} style={{ marginRight: '0.35rem' }}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label style={{ fontSize: '0.85rem' }}>From</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <label style={{ fontSize: '0.85rem' }}>To</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          )}
          <span className="text-muted" style={{ fontSize: '0.85rem', marginLeft: 'auto' }}>
            {orders.length} delivery order(s)
          </span>
        </div>
      </div>

      <div className="report-summary" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {branchStats.map(b => (
          <div key={b._id} className="summary-card" style={{ borderTop: `3px solid ${b._id === selectedBranch ? '#2563eb' : '#94a3b8'}`, cursor: 'pointer' }}
            onClick={() => setSelectedBranch(b._id === selectedBranch ? '' : b._id)}>
            <div className="summary-label">{b.name}</div>
            <div className="summary-value">{b.total} orders</div>
            <div style={{ display: 'flex', gap: '1rem', margin: '0.4rem 0 0.35rem', fontSize: '0.85rem' }}>
              <span><span style={{ color: '#2563eb', fontWeight: 700 }}>{b.sent}</span> sent</span>
              <span><span style={{ color: '#16a34a', fontWeight: 700 }}>{b.received}</span> received</span>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.35rem', fontSize: '0.7rem' }}>
              {b.pending > 0 && <span className="badge badge-secondary">{b.pending} pending</span>}
              {b.processing > 0 && <span className="badge badge-info">{b.processing} processing</span>}
              {b.shipped > 0 && <span className="badge badge-warning">{b.shipped} shipped</span>}
              {b.out_for_delivery > 0 && <span className="badge badge-info">{b.out_for_delivery} transit</span>}
              {b.delivered > 0 && <span className="badge badge-success">{b.delivered} delivered</span>}
              {b.returned > 0 && <span className="badge badge-danger">{b.returned} returned</span>}
            </div>
          </div>
        ))}
        {!loading && branchStats.length === 0 && (
          <div className="summary-card"><div className="summary-label">No branches configured yet</div></div>
        )}
      </div>

      {selectedBranchInfo && (
        <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>{selectedBranchInfo.name}</strong>
            <span className="text-muted" style={{ marginLeft: '0.5rem' }}>{filtered.length} order(s) | {selectedBranchInfo.sent} sent | {selectedBranchInfo.received} received</span>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => setSelectedBranch('')}>Clear Filter</button>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Tracking #</th><th>Order #</th><th>Customer</th><th>From Branch</th><th>To Branch</th><th>Direction</th><th>Status</th><th>Updated</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="9">Loading...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan="9" className="text-center">No orders found</td></tr>
                : filtered.map(o => (
                  <tr key={o._id} style={{ cursor: 'pointer' }} onClick={() => loadDetail(o)}>
                    <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{o.trackingNumber}</code></td>
                    <td>{o.orderNumber}</td>
                    <td>{o.customer?.name || o.customerName || '-'}</td>
                    <td>{o.sourceBranch?.name || '-'}</td>
                    <td>{o.branch?.name || '-'}</td>
                    <td>
                      {o.direction === 'sent' && <span className="badge badge-info">Sent</span>}
                      {o.direction === 'received' && <span className="badge badge-success">Received</span>}
                      {o.direction === 'internal' && <span className="badge badge-secondary">Internal</span>}
                    </td>
                    <td><span className={`badge ${STATUS_COLORS[o.status] || 'badge-secondary'}`}>{STATUS_LABELS[o.status] || o.status}</span></td>
                    <td>{new Date(o.updatedAt).toLocaleDateString('en-GB')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => loadDetail(o)}>View</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{detail.trackingNumber}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {company && <button className="btn btn-sm" onClick={() => printTrackingLabel(detail, company)}>Print Label</button>}
                <button className="btn btn-sm modal-close-x" onClick={() => setDetail(null)}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Order #</span><br /><strong>{detail.orderNumber}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Status</span><br /><span className={`badge ${STATUS_COLORS[detail.status]}`}>{STATUS_LABELS[detail.status]}</span></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Customer</span><br /><strong>{detail.customerName || detail.customer?.name || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Driver</span><br /><strong>{detail.driver?.name || 'Unassigned'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>From Branch</span><br /><strong>{detail.sourceBranch?.name || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>To Branch</span><br /><strong>{detail.branch?.name || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Location</span><br /><strong>{detail.currentLocation || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Carrier</span><br /><strong>{detail.carrier || 'N/A'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Est. Delivery</span><br /><strong>{detail.estimatedDelivery ? new Date(detail.estimatedDelivery).toLocaleDateString('en-GB') : '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Created</span><br /><strong>{detail.createdAt ? new Date(detail.createdAt).toLocaleString('en-GB') : '-'}</strong></div>
              </div>
              {detail.events && detail.events.length > 0 && (
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>Event Timeline</strong>
                  <div style={{ marginTop: '0.5rem' }}>
                    {detail.events.slice().reverse().map((e, i) => (
                      <div key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                        <div><span className={`badge ${STATUS_COLORS[e.status] || 'badge-secondary'}`}>{STATUS_LABELS[e.status] || e.status}</span> <span className="text-muted">{new Date(e.timestamp).toLocaleString('en-IN')}</span></div>
                        {e.note && <div style={{ color: '#64748b', marginTop: '2px' }}>{e.note}</div>}
                        {e.updatedBy && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>by {e.updatedBy?.name || e.updatedBy}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
