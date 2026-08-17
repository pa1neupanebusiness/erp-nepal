import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { adToBsStr } from '../UI/NepaliDatePicker';
import { printTrackingLabel } from './printTrackingLabel';
import { printCourierInvoice, printDeliverySlip } from './printCourierDocs';

const STATUS_LABELS = {
  pending: 'Pending', processing: 'Processing', shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery', delivered: 'Delivered', returned: 'Returned',
};

const STATUS_COLORS = {
  pending: 'badge-secondary', processing: 'badge-info', shipped: 'badge-warning',
  out_for_delivery: 'badge-info', delivered: 'badge-success', returned: 'badge-danger',
};

const STATUS_ORDER = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered'];

function canTransitionTo(current, target) {
  if (target === 'returned') return true;
  const curIdx = STATUS_ORDER.indexOf(current);
  const tgtIdx = STATUS_ORDER.indexOf(target);
  if (curIdx === -1 || tgtIdx === -1) return false;
  return tgtIdx === curIdx + 1;
}

function nextAllowedStatus(current) {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}

export default function DriverDashboard() {
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [courierOrder, setCourierOrder] = useState(null);
  const [company, setCompany] = useState(null);
  const [updateForm, setUpdateForm] = useState({ status: '', location: '', note: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); api.get('/company').then(r => setCompany(r.data)).catch(() => {}); }, [filter]);

  const load = () => {
    const params = {};
    if (filter) params.status = filter;
    api.get('/tracking/driver-orders', { params }).then(r => setOrders(r.data)).catch(() => {});
  };

  const loadDetail = async (order) => {
    try {
      const { data } = await api.get(`/tracking/${order.orderId._id || order.orderId}`);
      setDetail(data);
      setUpdateForm({ status: nextAllowedStatus(data.status) || data.status, location: data.currentLocation || '', note: '' });
      if (data.trackingNumber) {
        try {
          const { data: co } = await api.get(`/courier-orders/by-tracking/${data.trackingNumber}`);
          setCourierOrder(co);
        } catch (_) { setCourierOrder(null); }
      }
    } catch (_) { addToast('Failed to load tracking', 'error'); }
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
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header"><h1>My Deliveries <span className="badge badge-info">{orders.length}</span></h1></div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {['', 'shipped', 'out_for_delivery', 'delivered'].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(s)}>
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Branch</th><th>Location</th><th>Updated</th><th>Action</th></tr></thead>
            <tbody>
              {orders.map(t => (
                <tr key={t._id} onClick={() => loadDetail(t)} style={{ cursor: 'pointer' }}>
                  <td><strong>{t.orderNumber}</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.trackingNumber || 'No tracking #'}</span></td>
                  <td>{t.customer?.name || t.customerName || '-'}</td>
                  <td><span className={`badge ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span></td>
                  <td>{t.branch?.name || '-'}</td>
                  <td>{t.currentLocation || '-'}</td>
                  <td>{new Date(t.updatedAt).toLocaleDateString('en-GB')}</td>
                  <td className="action-cell" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm btn-primary" onClick={() => loadDetail(t)}>View</button>
                    {t.trackingNumber && courierOrder?._id && <button className="btn btn-sm" onClick={() => printCourierInvoice(courierOrder, company)} title="Print Invoice">Invoice</button>}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan="7" className="text-center">No deliveries assigned</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => { setDetail(null); setCourierOrder(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Order {detail.orderNumber}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {detail.trackingNumber && <button className="btn btn-sm" onClick={() => printTrackingLabel(detail, company)} title="Print Tracking Label">Print Label</button>}
                {courierOrder && <button className="btn btn-sm" onClick={() => printCourierInvoice(courierOrder, company)} title="Print Invoice">Print Invoice</button>}
                {courierOrder && <button className="btn btn-sm" onClick={() => printDeliverySlip(courierOrder, company)} title="Print Delivery Slip">Print Slip</button>}
                <button className="btn btn-sm modal-close-x" onClick={() => { setDetail(null); setCourierOrder(null); }}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div><strong>Customer:</strong> {detail.customer?.name || detail.customerName || '-'}</div>
                <div><strong>Status:</strong> <span className={`badge ${STATUS_COLORS[detail.status]}`}>{STATUS_LABELS[detail.status]}</span></div>
                <div><strong>Tracking #:</strong> <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>{detail.trackingNumber || '-'}</code></div>
                <div><strong>Current Location:</strong> {detail.currentLocation || '-'}</div>
                <div><strong>Branch:</strong> {detail.branch?.name || '-'}</div>
                <div><strong>Carrier:</strong> {detail.carrier ? detail.carrier.toUpperCase() : '-'}</div>
              </div>

              {courierOrder && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ padding: '0.5rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#166534', marginBottom: '0.35rem' }}>Sender</div>
                    <div style={{ fontSize: '0.85rem' }}><strong>{courierOrder.sender?.name || '-'}</strong></div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{courierOrder.sender?.phone || '-'} | {courierOrder.sender?.address || '-'}</div>
                  </div>
                  <div style={{ padding: '0.5rem', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#1e40af', marginBottom: '0.35rem' }}>Receiver</div>
                    <div style={{ fontSize: '0.85rem' }}><strong>{courierOrder.receiver?.name || '-'}</strong></div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{courierOrder.receiver?.phone || '-'} | {courierOrder.receiver?.address || '-'}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
                    <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Invoice #</span><br /><strong>{courierOrder.sale?.invoiceNumber || '-'}</strong></div>
                    <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Delivery Type</span><br /><strong>{courierOrder.deliveryType === 'international' ? 'International' : 'National'}</strong></div>
                    <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Location</span><br /><strong>{courierOrder.deliveryLocation || '-'}</strong></div>
                    <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Amount</span><br /><strong>Rs. {Number(courierOrder.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                    <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Payment</span><br /><strong>{courierOrder.paymentMethod === 'qr' ? 'QR' : 'Cash'}</strong></div>
                    <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Est. Delivery</span><br /><strong>{courierOrder.estimatedDelivery ? adToBsStr(new Date(courierOrder.estimatedDelivery)) : '-'}</strong></div>
                  </div>
                  {courierOrder.instructions && <div style={{ gridColumn: '1 / -1', padding: '0.5rem', background: '#fefce8', borderRadius: '6px', border: '1px dashed #eab308', fontSize: '0.85rem' }}><strong style={{ color: '#a16207', fontSize: '0.75rem' }}>Instructions:</strong> {courierOrder.instructions}</div>}
                  {courierOrder.remarks && <div style={{ gridColumn: '1 / -1', padding: '0.5rem', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd', fontSize: '0.85rem' }}><strong style={{ color: '#0369a1', fontSize: '0.75rem' }}>Remarks:</strong> {courierOrder.remarks}</div>}
                </div>
              )}

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                <h4 style={{ marginTop: 0 }}>Update Delivery</h4>
                {detail.status !== 'returned' && nextAllowedStatus(detail.status) && (
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                    Current: <strong>{STATUS_LABELS[detail.status]}</strong> → Next: <strong style={{ color: '#2563eb' }}>{STATUS_LABELS[nextAllowedStatus(detail.status)]}</strong>
                    {detail.status !== 'delivered' && <span> | Also: <strong style={{ color: '#dc2626' }}>Returned</strong></span>}
                  </div>
                )}
                {detail.status === 'delivered' && <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>Delivery completed</div>}
                {detail.status === 'returned' && <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>Order returned</div>}
                <div className="form-grid">
                  <div className="form-group"><label>Status</label>
                    <select value={updateForm.status} onChange={e => setUpdateForm({ ...updateForm, status: e.target.value })}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => {
                        const allowed = canTransitionTo(detail.status, k);
                        return <option key={k} value={k} disabled={!allowed}>{v}{!allowed && k !== detail.status ? ' (not available)' : ''}</option>;
                      })}
                    </select>
                  </div>
                  <div className="form-group"><label>Current Location</label><input value={updateForm.location} onChange={e => setUpdateForm({ ...updateForm, location: e.target.value })} placeholder="e.g. Kathmandu Hub" /></div>
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
                {(!detail.events || detail.events.length === 0) && <p style={{ color: '#94a3b8' }}>No events recorded</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
