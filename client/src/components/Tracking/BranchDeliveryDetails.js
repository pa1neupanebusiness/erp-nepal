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

export default function BranchDeliveryDetails() {
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [branchStats, setBranchStats] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    loadData();
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get('/tracking/branch-stats'),
        api.get('/tracking/branch-orders'),
      ]);
      setBranchStats(statsRes.data);
      setOrders(ordersRes.data);
    } catch (err) { addToast('Failed to load delivery data', 'error'); }
    setLoading(false);
  };

  const filtered = selectedBranch ? orders.filter(o => o.branch?._id === selectedBranch) : orders;
  const selectedBranchInfo = branchStats.find(b => b._id === selectedBranch);

  const loadDetail = async (orderId) => {
    try {
      const { data } = await api.get('/tracking/' + orderId);
      setDetail(data);
    } catch { addToast('Failed to load detail', 'error'); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Branch Delivery Details</h1>
        <button className="btn btn-secondary" onClick={loadData}>Refresh</button>
      </div>

      <div className="report-summary" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {branchStats.map(b => (
          <div key={b._id} className="summary-card" style={{ borderTop: `3px solid ${b._id === selectedBranch ? '#2563eb' : '#94a3b8'}`, cursor: 'pointer' }}
            onClick={() => setSelectedBranch(b._id === selectedBranch ? '' : b._id)}>
            <div className="summary-label">{b.name}</div>
            <div className="summary-value">{b.total} orders</div>
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
      </div>

      {selectedBranchInfo && (
        <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>{selectedBranchInfo.name}</strong>
            <span className="text-muted" style={{ marginLeft: '0.5rem' }}>{filtered.length} order(s) | {selectedBranchInfo.delivered} delivered</span>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => setSelectedBranch('')}>Clear Filter</button>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Tracking #</th><th>Order #</th><th>Customer</th><th>Branch</th><th>Driver</th><th>Status</th><th>Updated</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="8">Loading...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan="8" className="text-center">No orders found</td></tr>
                : filtered.map(o => (
                  <tr key={o._id} style={{ cursor: 'pointer' }} onClick={() => loadDetail(o._id)}>
                    <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{o.trackingNumber}</code></td>
                    <td>{o.orderNumber}</td>
                    <td>{o.customer?.name || o.customerName || '-'}</td>
                    <td>{o.branch?.name || '-'}</td>
                    <td>{o.driver?.name || 'Unassigned'}</td>
                    <td><span className={`badge ${STATUS_COLORS[o.status] || 'badge-secondary'}`}>{STATUS_LABELS[o.status] || o.status}</span></td>
                    <td>{new Date(o.updatedAt).toLocaleDateString('en-GB')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => loadDetail(o._id)}>View</button>
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
                <button className="btn btn-sm" onClick={() => printTrackingLabel(detail, company)}>Print Label</button>
                <button className="btn btn-sm modal-close-x" onClick={() => setDetail(null)}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Order #</span><br /><strong>{detail.orderNumber}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Status</span><br /><span className={`badge ${STATUS_COLORS[detail.status]}`}>{STATUS_LABELS[detail.status]}</span></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Customer</span><br /><strong>{detail.customerName || detail.customer?.name || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Driver</span><br /><strong>{detail.driver?.name || 'Unassigned'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Branch</span><br /><strong>{detail.branch?.name || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Location</span><br /><strong>{detail.currentLocation || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Carrier</span><br /><strong>{detail.carrier || 'N/A'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Est. Delivery</span><br /><strong>{detail.estimatedDelivery ? new Date(detail.estimatedDelivery).toLocaleDateString('en-GB') : '-'}</strong></div>
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
