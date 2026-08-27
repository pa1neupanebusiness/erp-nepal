import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { adToBsStr } from '../UI/NepaliDatePicker';
import { printCourierInvoice, printDeliverySlip } from './printCourierDocs';

const DELIVERY_TYPES = [
  { value: 'national', label: 'National' },
  { value: 'international', label: 'International' },
];

export default function CourierSalesForm() {
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';

  const [form, setForm] = useState({
    senderName: user?.name || '', senderAddress: '', senderPhone: '',
    receiverName: '', receiverAddress: '', receiverPhone: '',
    instructions: '', deliveryLocation: '', deliveryType: 'national',
    destinationBranch: '', estimatedDelivery: '', quantity: '1',
    weight: '', unit: 'pcs', ratePerUnit: '',
    vatRate: '', inclusiveVat: false,
    paymentMethod: 'cash', bankId: '', remarks: '',
  });
  const [branches, setBranches] = useState([]);
  const [banks, setBanks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [list, setList] = useState([]);
  const [showList, setShowList] = useState(false);
  const [company, setCompany] = useState(null);
  const [senderCustomer, setSenderCustomer] = useState(null);
  const [senderMatches, setSenderMatches] = useState([]);
  const [senderDropdownOpen, setSenderDropdownOpen] = useState(false);
  const [senderSearching, setSenderSearching] = useState(false);

  useEffect(() => {
    api.get('/banks').then(r => setBanks(r.data)).catch(() => {});
    api.get('/branches').then(r => setBranches(r.data)).catch(() => {});
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
  }, []);

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const debounceRef = React.useRef(null);
  const senderSearch = (value) => {
    clearTimeout(debounceRef.current);
    setSenderDropdownOpen(false);
    if (!value || !value.trim()) { setSenderMatches([]); return; }
    setSenderSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/courier-orders/customers/search', { params: { phone: value.trim() } });
        setSenderMatches(data);
        setSenderDropdownOpen(true);
      } catch (_) {
        setSenderMatches([]);
      } finally {
        setSenderSearching(false);
      }
    }, 300);
  };

  const handleSenderPhoneChange = (val) => {
    update('senderPhone', val);
    setSenderCustomer(null);
    senderSearch(val);
  };

  const selectSender = (c) => {
    setSenderCustomer(c);
    setForm(prev => ({
      ...prev,
      senderPhone: c.phone || prev.senderPhone,
      senderName: c.name || prev.senderName,
      senderAddress: c.address || prev.senderAddress,
    }));
    setSenderMatches([]);
    setSenderDropdownOpen(false);
  };

  const editSenderDebounce = React.useRef(null);
  const editSenderSearch = (value) => {
    clearTimeout(editSenderDebounce.current);
    setSenderDropdownOpen(false);
    if (!value || !value.trim()) { setSenderMatches([]); return; }
    setSenderSearching(true);
    editSenderDebounce.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/courier-orders/customers/search', { params: { phone: value.trim() } });
        setSenderMatches(data);
        setSenderDropdownOpen(true);
      } catch (_) {
        setSenderMatches([]);
      } finally {
        setSenderSearching(false);
      }
    }, 300);
  };

  const handleEditSenderPhoneChange = (val) => {
    setEditForm({ ...editForm, senderPhone: val });
    editSenderSearch(val);
  };

  const selectEditSender = (c) => {
    setEditForm(prev => ({
      ...prev,
      senderPhone: c.phone || prev.senderPhone,
      senderName: c.name || prev.senderName,
      senderAddress: c.address || prev.senderAddress,
    }));
    setSenderMatches([]);
    setSenderDropdownOpen(false);
  };

  const handleCreate = async () => {
    if (!form.senderName) return addToast('Sender name is required', 'error');
    if (!form.receiverName) return addToast('Receiver name is required', 'error');
    const qty = Number(form.quantity) || 1;
    const calcPrice = (form.weight && form.ratePerUnit) ? Math.round(qty * Number(form.weight) * Number(form.ratePerUnit) * 100) / 100 : 0;
    if (!calcPrice || calcPrice <= 0) return addToast('Quantity, weight and rate are required', 'error');
    setSaving(true);
    try {
      const { data } = await api.post('/courier-orders', {
        senderName: form.senderName, senderAddress: form.senderAddress, senderPhone: form.senderPhone,
        receiverName: form.receiverName, receiverAddress: form.receiverAddress, receiverPhone: form.receiverPhone,
        instructions: form.instructions, deliveryLocation: form.deliveryLocation, deliveryType: form.deliveryType,
        destinationBranch: form.destinationBranch || undefined,
        estimatedDelivery: form.estimatedDelivery || undefined,
        quantity: qty, weight: Number(form.weight), unit: form.unit, ratePerUnit: Number(form.ratePerUnit),
        price: calcPrice, vatRate: form.vatRate ? Number(form.vatRate) : undefined,
        inclusiveVat: form.inclusiveVat, paymentMethod: form.paymentMethod,
        bankId: form.paymentMethod === 'qr' ? form.bankId : undefined,
        remarks: form.remarks,
      });
      addToast(`Courier order created: ${data.trackingNumber}`, 'success');
      setDetail(data);
      setForm({
        senderName: user?.name || '', senderAddress: '', senderPhone: '',
        receiverName: '', receiverAddress: '', receiverPhone: '',
        instructions: '', deliveryLocation: '', deliveryType: 'national',
        destinationBranch: '', estimatedDelivery: '', quantity: '1',
        weight: '', unit: 'pcs', ratePerUnit: '',
        vatRate: '', inclusiveVat: false,
        paymentMethod: 'cash', bankId: '', remarks: '',
      });
      setSenderCustomer(null);
      setSenderMatches([]);
      setSenderDropdownOpen(false);
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
      deliveryType: detail.deliveryType || 'national', destinationBranch: detail.destinationBranch?._id || detail.destinationBranch || '',
      estimatedDelivery: detail.estimatedDelivery ? detail.estimatedDelivery.slice(0, 10) : '',
      quantity: detail.quantity || '1', weight: detail.weight || '', unit: detail.unit || 'pcs', ratePerUnit: detail.ratePerUnit || '',
      remarks: detail.remarks || '',
    });
    setEditMode(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload = {
        sender: {
          name: editForm.senderName, phone: editForm.senderPhone, address: editForm.senderAddress,
        },
        receiver: {
          name: editForm.receiverName, phone: editForm.receiverPhone, address: editForm.receiverAddress,
        },
        instructions: editForm.instructions, deliveryLocation: editForm.deliveryLocation,
        deliveryType: editForm.deliveryType, estimatedDelivery: editForm.estimatedDelivery,
        remarks: editForm.remarks,
      };
      const { data } = await api.put(`/courier-orders/${detail._id}`, payload);
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
              <div className="form-group" style={{ position: 'relative' }}>
                <label>Phone <span style={{ color: '#94a3b8', fontWeight: 400 }}>(search)</span></label>
                <input value={form.senderPhone} onChange={e => handleSenderPhoneChange(e.target.value)} placeholder="Type phone to search" />
                {senderSearching && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Searching...</div>}
                {senderDropdownOpen && senderMatches.length > 0 && (
                  <div style={{ position: 'absolute', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', zIndex: 20 }}>
                    {senderMatches.map(c => (
                      <div key={c._id} onMouseDown={() => selectSender(c)} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.phone}{c.address ? ` | ${c.address}` : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
                {senderCustomer && <div style={{ fontSize: '0.75rem', color: senderCustomer.fromHistory ? '#7c3aed' : '#15803d', marginTop: '0.25rem' }}>{senderCustomer.fromHistory ? `From previous courier order${senderCustomer.name ? `: ${senderCustomer.name}` : ''}` : `Linked to customer: ${senderCustomer.name}`}</div>}
              </div>
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
            {form.deliveryType === 'national' && (
              <div className="form-group"><label>Destination Branch *</label>
                <select value={form.destinationBranch} onChange={e => update('destinationBranch', e.target.value)}>
                  <option value="">Select branch...</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name}{b.district ? ` - ${b.district}` : ''}</option>)}
                </select>
              </div>
            )}
            <div className="form-group"><label>Delivery Location</label><input value={form.deliveryLocation} onChange={e => update('deliveryLocation', e.target.value)} placeholder="e.g. New Baneshwor" /></div>
            <div className="form-group"><label>Est. Delivery Date</label><input type="date" value={form.estimatedDelivery} onChange={e => update('estimatedDelivery', e.target.value)} /></div>
            <div className="form-group"><label>Quantity *</label><input type="number" min="1" value={form.quantity} onChange={e => update('quantity', e.target.value)} placeholder="1" /></div>
            <div className="form-group"><label>Weight *</label><input type="number" step="0.01" min="0" value={form.weight} onChange={e => update('weight', e.target.value)} placeholder="e.g. 2.5" /></div>
            <div className="form-group"><label>Unit *</label>
              <select value={form.unit} onChange={e => update('unit', e.target.value)}>
                <option value="pcs">Pcs</option>
                <option value="kg">Kg</option>
                <option value="box">Box</option>
                <option value="dozen">Dozen</option>
                <option value="quintal">Quintal</option>
              </select>
            </div>
            <div className="form-group"><label>Rate Per Unit (Rs.) *</label><input type="number" step="0.01" min="0" value={form.ratePerUnit} onChange={e => update('ratePerUnit', e.target.value)} placeholder="e.g. 100" /></div>
            <div className="form-group"><label>Calculated Price</label><div style={{ padding: '0.5rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0', fontWeight: 700, fontSize: '1rem' }}>Rs. {((Number(form.quantity) || 1) * (Number(form.weight) || 0) * (Number(form.ratePerUnit) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
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
              <button className="btn btn-sm" onClick={() => printCourierInvoice(detail, company)}>Print Invoice</button>
              <button className="btn btn-sm" onClick={() => printDeliverySlip(detail, company)}>Print Delivery Slip</button>
            </div>
          </div>

          {!editMode ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#166534', fontSize: '0.9rem' }}>Sender (Customer)</h4>
                <div style={{ fontSize: '0.85rem' }}><strong>{detail.sender?.name || '-'}</strong></div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{detail.sender?.phone || '-'} | {detail.sender?.address || '-'}</div>
              </div>
              <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#1e40af', fontSize: '0.9rem' }}>Receiver</h4>
                <div style={{ fontSize: '0.85rem' }}><strong>{detail.receiver?.name || '-'}</strong></div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{detail.receiver?.phone || '-'} | {detail.receiver?.address || '-'}</div>
              </div>

              <div style={{ gridColumn: '1 / -1', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Delivery Package</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748b' }}>From:</span> <strong>{detail.sender?.name || '-'}</strong>
                    <span style={{ color: '#94a3b8', marginLeft: '0.5rem' }}>{detail.sender?.address || ''}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748b' }}>To:</span> <strong>{detail.receiver?.name || '-'}</strong>
                    <span style={{ color: '#94a3b8', marginLeft: '0.5rem' }}>{detail.receiver?.address || ''}</span>
                  </div>
                </div>
                {detail.instructions && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#a16207' }}><strong>Instructions:</strong> {detail.instructions}</div>}
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Invoice #</span><br /><strong>{detail.sale?.invoiceNumber || '-'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Tracking #</span><br /><strong>{detail.trackingNumber}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Delivery Type</span><br /><strong>{detail.deliveryType === 'international' ? 'International' : 'National'}</strong></div>
                {detail.destinationBranch && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Destination Branch</span><br /><strong>{detail.destinationBranch?.name || '-'}</strong></div>}
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Delivery Location</span><br /><strong>{detail.deliveryLocation || '-'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Est. Delivery</span><br /><strong>{detail.estimatedDelivery ? adToBsStr(new Date(detail.estimatedDelivery)) : '-'}</strong></div>
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Quantity</span><br /><strong>{detail.quantity || '-'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Weight</span><br /><strong>{detail.weight || '-'} {detail.unit || ''}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Rate/Unit</span><br /><strong>{detail.ratePerUnit ? `Rs. ${Number(detail.ratePerUnit).toLocaleString('en-IN')}` : '-'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Delivery Charge</span><br /><strong style={{ fontSize: '1.05rem' }}>Rs. {Number(detail.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                {detail.vatAmount > 0 && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>VAT ({detail.vatRate}%)</span><br /><strong>Rs. {detail.vatAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>}
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Payment</span><br /><strong>{detail.paymentMethod === 'qr' ? 'QR' : 'Cash'} {detail.bank?.name ? `(${detail.bank.name})` : ''}</strong></div>
              </div>

              {detail.remarks && <div style={{ padding: '0.75rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}><strong style={{ color: '#0369a1', fontSize: '0.8rem' }}>Remarks:</strong><div style={{ fontSize: '0.85rem' }}>{detail.remarks}</div></div>}
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Sender</h4>
                  <div className="form-group"><label>Name</label><input value={editForm.senderName} onChange={e => setEditForm({ ...editForm, senderName: e.target.value })} /></div>
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label>Phone <span style={{ color: '#94a3b8', fontWeight: 400 }}>(search)</span></label>
                    <input value={editForm.senderPhone} onChange={e => handleEditSenderPhoneChange(e.target.value)} placeholder="Type phone to search" />
                    {senderSearching && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Searching...</div>}
                    {senderDropdownOpen && senderMatches.length > 0 && (
                      <div style={{ position: 'absolute', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', zIndex: 20, width: '100%' }}>
                        {senderMatches.map(c => (
                          <div key={c._id} onMouseDown={() => selectEditSender(c)} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.phone}{c.address ? ` | ${c.address}` : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
                {editForm.deliveryType === 'national' && (
                  <div className="form-group"><label>Destination Branch</label>
                    <select value={editForm.destinationBranch} onChange={e => setEditForm({ ...editForm, destinationBranch: e.target.value })}>
                      <option value="">Select branch...</option>
                      {branches.map(b => <option key={b._id} value={b._id}>{b.name}{b.district ? ` - ${b.district}` : ''}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group"><label>Delivery Location</label><input value={editForm.deliveryLocation} onChange={e => setEditForm({ ...editForm, deliveryLocation: e.target.value })} /></div>
                <div className="form-group"><label>Est. Delivery</label><input type="date" value={editForm.estimatedDelivery} onChange={e => setEditForm({ ...editForm, estimatedDelivery: e.target.value })} /></div>
                <div className="form-group"><label>Quantity</label><input type="number" min="1" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: e.target.value })} /></div>
                <div className="form-group"><label>Weight</label><input type="number" step="0.01" min="0" value={editForm.weight} onChange={e => setEditForm({ ...editForm, weight: e.target.value })} /></div>
                <div className="form-group"><label>Unit</label>
                  <select value={editForm.unit} onChange={e => setEditForm({ ...editForm, unit: e.target.value })}>
                    <option value="pcs">Pcs</option>
                    <option value="kg">Kg</option>
                    <option value="box">Box</option>
                    <option value="dozen">Dozen</option>
                    <option value="quintal">Quintal</option>
                  </select>
                </div>
                <div className="form-group"><label>Rate Per Unit</label><input type="number" step="0.01" min="0" value={editForm.ratePerUnit} onChange={e => setEditForm({ ...editForm, ratePerUnit: e.target.value })} /></div>
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
