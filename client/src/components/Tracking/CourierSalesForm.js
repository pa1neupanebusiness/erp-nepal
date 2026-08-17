import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { adToBsStr } from '../UI/NepaliDatePicker';
import { printCourierInvoice, printDeliverySlip } from './printCourierDocs';

const DELIVERY_TYPES = [
  { value: 'home_delivery', label: 'Home Delivery' },
  { value: 'branch_pickup', label: 'Branch Pickup' },
];

export default function CourierSalesForm() {
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';

  const [form, setForm] = useState({
    senderName: user?.name || '', senderAddress: '', senderPhone: '',
    receiverName: '', receiverAddress: '', receiverPhone: '',
    instructions: '', deliveryLocation: '', deliveryType: 'home_delivery',
    estimatedDelivery: '', price: '', vatRate: '', inclusiveVat: false,
    paymentMethod: 'cash', bankId: '', remarks: '',
  });
  const [banks, setBanks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [list, setList] = useState([]);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    api.get('/banks').then(r => setBanks(r.data)).catch(() => {});
  }, []);

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleCreate = async () => {
    if (!form.senderName) return addToast('Sender name is required', 'error');
    if (!form.receiverName) return addToast('Receiver name is required', 'error');
    if (!form.price || Number(form.price) <= 0) return addToast('Price is required', 'error');
    setSaving(true);
    try {
      const { data } = await api.post('/courier-orders', {
        senderName: form.senderName, senderAddress: form.senderAddress, senderPhone: form.senderPhone,
        receiverName: form.receiverName, receiverAddress: form.receiverAddress, receiverPhone: form.receiverPhone,
        instructions: form.instructions, deliveryLocation: form.deliveryLocation, deliveryType: form.deliveryType,
        estimatedDelivery: form.estimatedDelivery || undefined,
        price: Number(form.price), vatRate: form.vatRate ? Number(form.vatRate) : undefined,
        inclusiveVat: form.inclusiveVat, paymentMethod: form.paymentMethod,
        bankId: form.paymentMethod === 'qr' ? form.bankId : undefined,
        remarks: form.remarks,
      });
      addToast(`Courier order created: ${data.trackingNumber}`, 'success');
      setDetail(data);
      setForm({
        senderName: user?.name || '', senderAddress: '', senderPhone: '',
        receiverName: '', receiverAddress: '', receiverPhone: '',
        instructions: '', deliveryLocation: '', deliveryType: 'home_delivery',
        estimatedDelivery: '', price: '', vatRate: '', inclusiveVat: false,
        paymentMethod: 'cash', bankId: '', remarks: '',
      });
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create courier order', 'error');
    } finally {
      setSaving(false);
    }
  };

  const loadList = () => {
    api.get('/courier-orders').then(r => { setList(r.data); setShowList(true); }).catch(() => {});
  };

  const loadDetail = async (id) => {
    try {
      const { data } = await api.get(`/courier-orders/${id}`);
      setDetail(data);
      setShowList(false);
      setEditMode(false);
    } catch (_) { addToast('Failed to load', 'error'); }
  };

  const startEdit = () => {
    setEditForm({
      senderName: detail.sender?.name || '', senderAddress: detail.sender?.address || '', senderPhone: detail.sender?.phone || '',
      receiverName: detail.receiver?.name || '', receiverAddress: detail.receiver?.address || '', receiverPhone: detail.receiver?.phone || '',
      instructions: detail.instructions || '', deliveryLocation: detail.deliveryLocation || '',
      deliveryType: detail.deliveryType || 'home_delivery', estimatedDelivery: detail.estimatedDelivery ? detail.estimatedDelivery.slice(0, 10) : '',
      remarks: detail.remarks || '',
    });
    setEditMode(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/courier-orders/${detail._id}`, editForm);
      setDetail({ ...detail, ...data });
      setEditMode(false);
      addToast('Updated', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Courier Sales</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={loadList}>View All Orders</button>
        </div>
      </div>

      {showList && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>All Courier Orders</h3>
            <button className="btn btn-sm" onClick={() => setShowList(false)}>Close</button>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>Tracking #</th><th>Invoice #</th><th>Sender</th><th>Receiver</th><th>Price</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {list.map(o => (
                  <tr key={o._id} onClick={() => loadDetail(o._id)} style={{ cursor: 'pointer' }}>
                    <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{o.trackingNumber}</code></td>
                    <td>{o.sale?.invoiceNumber || '-'}</td>
                    <td>{o.sender?.name || '-'}</td>
                    <td>{o.receiver?.name || '-'}</td>
                    <td>Rs. {Number(o.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td><span className={`badge ${o.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>{o.status}</span></td>
                    <td className="action-cell" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => loadDetail(o._id)}>View</button>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan="7" className="text-center">No orders</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!detail && (
        <div className="card">
          <h3>New Courier Order</h3>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>Fill in the details below. Tracking number and invoice will be auto-generated.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#166534', fontSize: '0.9rem' }}>Sender Details</h4>
              <div className="form-group"><label>Name *</label><input value={form.senderName} onChange={e => update('senderName', e.target.value)} /></div>
              <div className="form-group"><label>Phone</label><input value={form.senderPhone} onChange={e => update('senderPhone', e.target.value)} /></div>
              <div className="form-group"><label>Address</label><input value={form.senderAddress} onChange={e => update('senderAddress', e.target.value)} /></div>
            </div>
            <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#1e40af', fontSize: '0.9rem' }}>Receiver Details</h4>
              <div className="form-group"><label>Name *</label><input value={form.receiverName} onChange={e => update('receiverName', e.target.value)} /></div>
              <div className="form-group"><label>Phone</label><input value={form.receiverPhone} onChange={e => update('receiverPhone', e.target.value)} /></div>
              <div className="form-group"><label>Address</label><input value={form.receiverAddress} onChange={e => update('receiverAddress', e.target.value)} /></div>
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: '1rem' }}>
            <div className="form-group"><label>Delivery Type *</label>
              <select value={form.deliveryType} onChange={e => update('deliveryType', e.target.value)}>
                {DELIVERY_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Delivery Location</label><input value={form.deliveryLocation} onChange={e => update('deliveryLocation', e.target.value)} placeholder="e.g. New Baneshwor" /></div>
            <div className="form-group"><label>Est. Delivery Date</label><input type="date" value={form.estimatedDelivery} onChange={e => update('estimatedDelivery', e.target.value)} /></div>
            <div className="form-group"><label>Price (Rs.) *</label><input type="number" step="0.01" min="0" value={form.price} onChange={e => update('price', e.target.value)} /></div>
            <div className="form-group"><label>VAT Rate (%)</label><input type="number" step="0.01" min="0" value={form.vatRate} onChange={e => update('vatRate', e.target.value)} placeholder={`Default: ${user?.company?.vatRate || 13}%`} /></div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.inclusiveVat} onChange={e => update('inclusiveVat', e.target.checked)} style={{ accentColor: '#16a34a' }} />
                Inclusive VAT
              </label>
            </div>
            <div className="form-group"><label>Payment Method *</label>
              <select value={form.paymentMethod} onChange={e => update('paymentMethod', e.target.value)}>
                <option value="cash">Cash</option>
                <option value="qr">QR / Bank Transfer</option>
              </select>
            </div>
            {form.paymentMethod === 'qr' && (
              <div className="form-group"><label>Select Bank / QR *</label>
                <select value={form.bankId} onChange={e => update('bankId', e.target.value)}>
                  <option value="">Select bank...</option>
                  {banks.map(b => <option key={b._id} value={b._id}>{b.name} {b.accountNumber ? `(${b.accountNumber})` : ''}</option>)}
                </select>
              </div>
            )}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Instructions</label><input value={form.instructions} onChange={e => update('instructions', e.target.value)} placeholder="Handle with care, fragile, etc." /></div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Remarks</label><input value={form.remarks} onChange={e => update('remarks', e.target.value)} placeholder="Internal notes" /></div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Courier Order'}</button>
          </div>
        </div>
      )}

      {detail && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Order {detail.trackingNumber}</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-sm" onClick={() => { setDetail(null); setEditMode(false); }}>New Order</button>
              {!editMode && <button className="btn btn-sm" onClick={startEdit}>Edit</button>}
              <button className="btn btn-sm" onClick={() => printCourierInvoice(detail, user.company)}>Print Invoice</button>
              <button className="btn btn-sm" onClick={() => printDeliverySlip(detail, user.company)}>Print Delivery Slip</button>
            </div>
          </div>

          {!editMode ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#166534', fontSize: '0.9rem' }}>Sender</h4>
                <div style={{ fontSize: '0.85rem' }}><strong>{detail.sender?.name || '-'}</strong></div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{detail.sender?.phone || '-'} | {detail.sender?.address || '-'}</div>
              </div>
              <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#1e40af', fontSize: '0.9rem' }}>Receiver</h4>
                <div style={{ fontSize: '0.85rem' }}><strong>{detail.receiver?.name || '-'}</strong></div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{detail.receiver?.phone || '-'} | {detail.receiver?.address || '-'}</div>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Invoice #</span><br /><strong>{detail.sale?.invoiceNumber || '-'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Tracking #</span><br /><strong>{detail.trackingNumber}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Delivery Type</span><br /><strong>{detail.deliveryType === 'branch_pickup' ? 'Branch Pickup' : 'Home Delivery'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Location</span><br /><strong>{detail.deliveryLocation || '-'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Est. Delivery</span><br /><strong>{detail.estimatedDelivery ? adToBsStr(new Date(detail.estimatedDelivery)) : '-'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Amount</span><br /><strong>Rs. {Number(detail.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Payment</span><br /><strong>{detail.paymentMethod === 'qr' ? 'QR' : 'Cash'} {detail.bank?.name ? `(${detail.bank.name})` : ''}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>VAT</span><br /><strong>{detail.vatAmount > 0 ? `Rs. ${detail.vatAmount.toLocaleString('en-IN', {minimumFractionDigits:2})} (${detail.vatRate}%)` : 'None'}</strong></div>
              </div>
              {detail.instructions && <div style={{ padding: '0.75rem', background: '#fefce8', borderRadius: '8px', border: '1px dashed #eab308' }}><strong style={{ color: '#a16207', fontSize: '0.8rem' }}>Instructions:</strong><div style={{ fontSize: '0.85rem' }}>{detail.instructions}</div></div>}
              {detail.remarks && <div style={{ padding: '0.75rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}><strong style={{ color: '#0369a1', fontSize: '0.8rem' }}>Remarks:</strong><div style={{ fontSize: '0.85rem' }}>{detail.remarks}</div></div>}
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Sender</h4>
                  <div className="form-group"><label>Name</label><input value={editForm.senderName} onChange={e => setEditForm({ ...editForm, senderName: e.target.value })} /></div>
                  <div className="form-group"><label>Phone</label><input value={editForm.senderPhone} onChange={e => setEditForm({ ...editForm, senderPhone: e.target.value })} /></div>
                  <div className="form-group"><label>Address</label><input value={editForm.senderAddress} onChange={e => setEditForm({ ...editForm, senderAddress: e.target.value })} /></div>
                </div>
                <div>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Receiver</h4>
                  <div className="form-group"><label>Name</label><input value={editForm.receiverName} onChange={e => setEditForm({ ...editForm, receiverName: e.target.value })} /></div>
                  <div className="form-group"><label>Phone</label><input value={editForm.receiverPhone} onChange={e => setEditForm({ ...editForm, receiverPhone: e.target.value })} /></div>
                  <div className="form-group"><label>Address</label><input value={editForm.receiverAddress} onChange={e => setEditForm({ ...editForm, receiverAddress: e.target.value })} /></div>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label>Delivery Type</label>
                  <select value={editForm.deliveryType} onChange={e => setEditForm({ ...editForm, deliveryType: e.target.value })}>
                    {DELIVERY_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Delivery Location</label><input value={editForm.deliveryLocation} onChange={e => setEditForm({ ...editForm, deliveryLocation: e.target.value })} /></div>
                <div className="form-group"><label>Est. Delivery</label><input type="date" value={editForm.estimatedDelivery} onChange={e => setEditForm({ ...editForm, estimatedDelivery: e.target.value })} /></div>
                <div className="form-group"><label>Instructions</label><input value={editForm.instructions} onChange={e => setEditForm({ ...editForm, instructions: e.target.value })} /></div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Remarks</label><input value={editForm.remarks} onChange={e => setEditForm({ ...editForm, remarks: e.target.value })} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                <button className="btn btn-secondary" onClick={() => setEditMode(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
