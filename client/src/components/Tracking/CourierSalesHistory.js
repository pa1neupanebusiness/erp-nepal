import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { adToBsStr } from '../UI/NepaliDatePicker';
import { printCourierInvoice, printDeliverySlip } from './printCourierDocs';
import { printTrackingLabel } from './printTrackingLabel';

export default function CourierSalesHistory() {
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    load();
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
  }, []);

  const load = () => {
    api.get('/courier-orders').then(r => setOrders(r.data)).catch(() => {});
  };

  const filtered = orders.filter(o => {
    if (filter === 'qr' && o.paymentMethod !== 'qr') return false;
    if (filter === 'cash' && o.paymentMethod !== 'cash') return false;
    if (filter === 'national' && o.deliveryType !== 'national') return false;
    if (filter === 'international' && o.deliveryType !== 'international') return false;
    if (search) {
      const q = search.toLowerCase();
      return (o.trackingNumber || '').toLowerCase().includes(q)
        || (o.sender?.name || '').toLowerCase().includes(q)
        || (o.receiver?.name || '').toLowerCase().includes(q)
        || (o.sale?.invoiceNumber || '').toLowerCase().includes(q);
    }
    return true;
  });

  const totalRevenue = filtered.reduce((s, o) => s + (o.price || 0), 0);
  const totalVat = filtered.reduce((s, o) => s + (o.vatAmount || 0), 0);

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const loadDetail = async (id) => {
    try {
      const { data } = await api.get(`/courier-orders/${id}`);
      setDetail(data);
    } catch (_) { addToast('Failed to load order', 'error'); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Courier Sales History</h1>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          { value: '', label: 'All' },
          { value: 'cash', label: 'Cash' },
          { value: 'qr', label: 'QR / Bank' },
          { value: 'national', label: 'National' },
          { value: 'international', label: 'International' },
        ].map(f => (
          <button key={f.value} className={`btn btn-sm ${filter === f.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: 150, padding: '0.5rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Orders</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{filtered.length}</div>
          </div>
          <div style={{ flex: 1, minWidth: 150, padding: '0.5rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Revenue</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{formatNPR(totalRevenue)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 150, padding: '0.5rem', background: '#fefce8', borderRadius: '8px', border: '1px solid #fde68a' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total VAT</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{formatNPR(totalVat)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '0.5rem' }}>
          <input placeholder="Search by tracking #, sender, receiver, invoice..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }} />
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr><th>Tracking #</th><th>Invoice #</th><th>Sender</th><th>Receiver</th><th>Type</th><th>Amount</th><th>Payment</th><th>Date</th><th>Action</th></tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o._id} onClick={() => loadDetail(o._id)} style={{ cursor: 'pointer' }}>
                  <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{o.trackingNumber}</code></td>
                  <td>{o.sale?.invoiceNumber || '-'}</td>
                  <td>{o.sender?.name || '-'}</td>
                  <td>{o.receiver?.name || '-'}</td>
                  <td><span className={`badge ${o.deliveryType === 'international' ? 'badge-info' : 'badge-success'}`}>{o.deliveryType === 'international' ? 'Intl' : 'National'}</span></td>
                  <td><strong>{formatNPR(o.price)}</strong></td>
                  <td><span className={`badge ${o.paymentMethod === 'qr' ? 'badge-info' : 'badge-success'}`}>{o.paymentMethod === 'qr' ? 'QR' : 'Cash'}</span></td>
                  <td>{new Date(o.createdAt).toLocaleDateString('en-GB')}</td>
                  <td className="action-cell" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => loadDetail(o._id)}>View</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="9" className="text-center">No courier orders found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Order {detail.trackingNumber}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {detail.trackingNumber && <button className="btn btn-sm" onClick={() => printTrackingLabel(detail, company)} title="Print Label">Print Label</button>}
                <button className="btn btn-sm" onClick={() => printCourierInvoice(detail, company)} title="Print Invoice">Invoice</button>
                <button className="btn btn-sm" onClick={() => printDeliverySlip(detail, company)} title="Delivery Slip">Slip</button>
                <button className="btn btn-sm modal-close-x" onClick={() => setDetail(null)}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ padding: '0.5rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#166534', marginBottom: '0.35rem' }}>Sender (Customer)</div>
                  <div style={{ fontSize: '0.85rem' }}><strong>{detail.sender?.name || '-'}</strong></div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{detail.sender?.phone || '-'} | {detail.sender?.address || '-'}</div>
                </div>
                <div style={{ padding: '0.5rem', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#1e40af', marginBottom: '0.35rem' }}>Receiver</div>
                  <div style={{ fontSize: '0.85rem' }}><strong>{detail.receiver?.name || '-'}</strong></div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{detail.receiver?.phone || '-'} | {detail.receiver?.address || '-'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', marginBottom: '0.75rem' }}>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Invoice #</span><br /><strong>{detail.sale?.invoiceNumber || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Type</span><br /><strong>{detail.deliveryType === 'international' ? 'International' : 'National'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Location</span><br /><strong>{detail.deliveryLocation || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Qty</span><br /><strong>{detail.quantity || '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Weight</span><br /><strong>{detail.weight || '-'} {detail.unit || ''}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Rate/Unit</span><br /><strong>{detail.ratePerUnit ? formatNPR(detail.ratePerUnit) : '-'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Delivery Charge</span><br /><strong style={{ fontSize: '1rem' }}>{formatNPR(detail.price)}</strong></div>
                {detail.vatAmount > 0 && <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>VAT ({detail.vatRate}%)</span><br /><strong>{formatNPR(detail.vatAmount)}</strong></div>}
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Payment</span><br /><strong>{detail.paymentMethod === 'qr' ? 'QR' : 'Cash'}</strong></div>
                <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Date</span><br /><strong>{new Date(detail.createdAt).toLocaleDateString('en-GB')}</strong></div>
              </div>

              {detail.instructions && <div style={{ padding: '0.5rem', background: '#fefce8', borderRadius: '6px', border: '1px dashed #eab308', fontSize: '0.85rem', marginBottom: '0.5rem' }}><strong style={{ color: '#a16207', fontSize: '0.75rem' }}>Instructions:</strong> {detail.instructions}</div>}
              {detail.remarks && <div style={{ padding: '0.5rem', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd', fontSize: '0.85rem' }}><strong style={{ color: '#0369a1', fontSize: '0.75rem' }}>Remarks:</strong> {detail.remarks}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
