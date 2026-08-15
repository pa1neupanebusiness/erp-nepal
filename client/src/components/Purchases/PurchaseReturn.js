import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const emptyStandalone = { date: adToBsStr(new Date()), supplier: '', items: [{ product: '', quantity: 1, costPrice: 0 }], reason: '' };

export default function PurchaseReturn() {
  const addToast = useToast();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [returnModal, setReturnModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [returnForm, setReturnForm] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [showStandalone, setShowStandalone] = useState(false);
  const [standalone, setStandalone] = useState({ ...emptyStandalone });
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/purchases').then(r => setPurchases(r.data.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)))).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => {});
    api.get('/products').then(r => setProducts(r.data.filter(p => p.isActive))).catch(() => {});
  }, []);

  const returnedCount = (p) => (p.returns || []).reduce((s, x) => s + x.quantity, 0);

  const submitReturn = async () => {
    const items = returnModal.items
      .filter(it => parseFloat(returnForm[String(it.product)]) > 0)
      .map(it => ({ product: it.product._id || it.product, quantity: parseFloat(returnForm[String(it.product)]) }));
    if (items.length === 0) { addToast('Enter quantity to return for at least one item', 'error'); return; }
    try {
      await api.post(`/purchases/${returnModal._id}/return`, { items, reason: returnReason });
      addToast('Purchase return recorded', 'success');
      setReturnModal(null);
      setReturnForm({});
      setReturnReason('');
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Return failed', 'error'); }
  };

  const submitStandalone = async () => {
    if (!standalone.supplier) { addToast('Please select a supplier', 'error'); return; }
    const validItems = standalone.items.filter(it => it.product && it.quantity > 0);
    if (validItems.length === 0) { addToast('Add at least one product with quantity', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/purchases/standalone-return', {
        date: bsToADStr(standalone.date),
        supplier: standalone.supplier,
        items: validItems.map(it => ({ product: it.product, quantity: it.quantity, costPrice: it.costPrice })),
        reason: standalone.reason,
      });
      addToast('Standalone purchase return recorded', 'success');
      setStandalone({ ...emptyStandalone });
      setShowStandalone(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Return failed', 'error');
    } finally { setSaving(false); }
  };

  const addLine = () => setStandalone(s => ({ ...s, items: [...s.items, { product: '', quantity: 1, costPrice: 0 }] }));
  const removeLine = (idx) => setStandalone(s => ({ ...s, items: s.items.filter((_, i) => i !== idx) }));
  const updateLine = (idx, field, val) => setStandalone(s => {
    const next = [...s.items];
    next[idx] = { ...next[idx], [field]: val };
    if (field === 'product') {
      const p = products.find(p => p._id === val);
      if (p) next[idx].costPrice = p.costPrice || 0;
    }
    return { ...s, items: next };
  });

  const standaloneTotal = standalone.items.reduce((s, it) => s + (it.costPrice || 0) * (it.quantity || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1>Purchase Return</h1>
        <button className="btn btn-primary" onClick={() => { setShowStandalone(!showStandalone); setReturnModal(null); }}>
          {showStandalone ? 'Back to List' : 'Standalone Return'}
        </button>
      </div>

      {!showStandalone && (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>Purchase No</th><th>Date</th><th>Supplier</th><th>Amount</th><th>Returned</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => setDetail(p)}>
                    <td>{p.purchaseNumber}</td>
                    <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                    <td>{p.supplier?.name || '-'}</td>
                    <td className="text-right">{fmt(p.total || p.grandTotal)}</td>
                    <td>{fmt(returnedCount(p))}</td>
                    <td><span className={`badge ${p.status === 'returned' ? 'badge-danger' : (p.status === 'partial_return' ? 'badge-warning' : 'badge-success')}`}>{p.status}</span></td>
                    <td>
                      <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setReturnModal(p); setReturnForm({}); setReturnReason(''); }}>Return Items</button>
                    </td>
                  </tr>
                ))}
                {!loading && purchases.length === 0 && <tr><td colSpan="7" className="text-center">No purchases found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showStandalone && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="card-header">Standalone Purchase Return</div>
          <div className="card-body">
            <div className="form-group">
              <label>Date</label>
              <NepaliDatePicker value={standalone.date} onChange={v => setStandalone(s => ({ ...s, date: v }))} />
            </div>
            <div className="form-group">
              <label>Supplier</label>
              <select value={standalone.supplier} onChange={e => setStandalone(s => ({ ...s, supplier: e.target.value }))} style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <option value="">-- Select Supplier --</option>
                {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <label style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Items</label>
            {standalone.items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <select value={it.product} onChange={e => updateLine(idx, 'product', e.target.value)} style={{ flex: 3, padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <option value="">-- Product --</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name} (Stock: {p.stock})</option>)}
                </select>
                <input type="number" min="1" value={it.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseInt(e.target.value) || 0)} placeholder="Qty" style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                <input type="number" value={it.costPrice || ''} onChange={e => updateLine(idx, 'costPrice', parseFloat(e.target.value) || 0)} placeholder="Cost Price" style={{ flex: 1.5, padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                <div style={{ flex: 1.5, textAlign: 'right', fontWeight: 600 }}>{fmt((it.costPrice || 0) * (it.quantity || 0))}</div>
                {standalone.items.length > 1 && <button className="btn btn-sm btn-danger" onClick={() => removeLine(idx)}>&times;</button>}
              </div>
            ))}
            <button className="btn btn-sm btn-secondary" onClick={addLine} style={{ marginTop: '0.25rem' }}>+ Add Item</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '2px solid #e2e8f0', fontWeight: 700, fontSize: '1.05rem' }}>
              <span>Total Return Value</span><span>{fmt(standaloneTotal)}</span>
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label>Reason</label>
              <input value={standalone.reason} onChange={e => setStandalone(s => ({ ...s, reason: e.target.value }))} placeholder="Reason for return" style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0' }} />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '0.5rem' }} onClick={submitStandalone} disabled={saving}>
              {saving ? 'Saving...' : 'Record Standalone Return'}
            </button>
          </div>
        </div>
      )}

      {detail && (
        <EntryDetailsModal
          title={`Purchase ${detail.purchaseNumber}`}
          subtitle={`${new Date(detail.date).toLocaleDateString('en-IN')} | ${detail.supplier?.name || '-'}`}
          meta={[
            { label: 'Supplier', value: detail.supplier?.name || '-' },
            { label: 'Status', value: detail.status },
            { label: 'Payment Method', value: detail.paymentMethod || 'cash' },
            { label: 'Grand Total', value: fmt(detail.grandTotal) },
            { label: 'Paid', value: fmt(detail.paidAmount) },
            { label: 'Due', value: fmt(detail.dueAmount) },
          ]}
          columns={[
            { key: 'product', label: 'Product', render: (v) => v?.name || v || 'Unknown' },
            { key: 'quantity', label: 'Qty', align: 'right' },
            { key: 'costPrice', label: 'Rate', align: 'right', render: (v) => fmt(v) },
            { key: 'subtotal', label: 'Amount', align: 'right', render: (v) => fmt(v) },
          ]}
          rows={detail.items || []}
          footer={[
            { label: 'Subtotal', value: fmt(detail.subtotal) },
            ...(detail.tax > 0 ? [{ label: 'VAT', value: fmt(detail.tax) }] : []),
            ...(detail.tds > 0 ? [{ label: 'TDS', value: fmt(detail.tds) }] : []),
            { label: 'Grand Total', value: fmt(detail.grandTotal) },
            { label: 'Paid', value: fmt(detail.paidAmount) },
            { label: 'Due', value: fmt(detail.dueAmount) },
          ]}
          onClose={() => setDetail(null)}
        />
      )}

      {returnModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Return Items - {returnModal.purchaseNumber}</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setReturnModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="text-muted" style={{ fontSize: '0.8rem' }}>Returned quantity is deducted from stock.</p>
              <table className="table">
                <thead><tr><th>Product</th><th>Purchased</th><th>Returned</th><th>Qty to Return</th></tr></thead>
                <tbody>
                  {returnModal.items.map((it, i) => {
                    const already = (returnModal.returns || []).filter(x => x.product && String(x.product) === String(it.product)).reduce((s, x) => s + x.quantity, 0);
                    const max = Math.max(0, it.quantity - already);
                    return (
                      <tr key={i}>
                        <td>{it.product?.name || 'Unknown'}</td>
                        <td>{it.quantity}</td>
                        <td>{already}</td>
                        <td><input type="number" min="0" max={max} value={returnForm[String(it.product)] || ''} onChange={e => setReturnForm({ ...returnForm, [String(it.product)]: e.target.value })} placeholder={`0 / ${max}`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="form-group"><label>Reason</label><input value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="Reason for return" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setReturnModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={submitReturn}>Record Return</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
