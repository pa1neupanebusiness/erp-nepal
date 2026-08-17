import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import SearchableSelect from '../UI/SearchableSelect';
import { printCreditNote } from '../UI/printCreditNote';

const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const emptyStandalone = { date: adToBsStr(new Date()), supplier: '', items: [{ product: '', quantity: 1, costPrice: 0 }], reason: '' };

export default function PurchaseReturn() {
  const addToast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchedPurchase, setSearchedPurchase] = useState(null);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [returnModal, setReturnModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [returnForm, setReturnForm] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [showStandalone, setShowStandalone] = useState(false);
  const [standalone, setStandalone] = useState({ ...emptyStandalone });
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    api.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => {});
    api.get('/products').then(r => setProducts(r.data.filter(p => p.isActive))).catch(() => {});
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
  }, []);

  const returnedCount = (p) => (p.returns || []).reduce((s, x) => s + x.quantity, 0);

  const search = async () => {
    const term = searchTerm.trim();
    if (!term) return;
    setSearching(true);
    setSearchedPurchase(null);
    setSearchNotFound(false);
    try {
      const { data } = await api.get(`/purchases/search/${encodeURIComponent(term)}`);
      setSearchedPurchase(data);
      setReturnModal(null);
      setDetail(null);
    } catch (err) {
      if (err.response?.status === 404) setSearchNotFound(true);
      else addToast(err.response?.data?.message || 'Purchase not found', 'error');
    } finally {
      setSearching(false);
    }
  };

  const submitReturn = async () => {
    if (!returnModal) return;
    const items = returnModal.items
      .filter(it => parseFloat(returnForm[String(it.product?._id || it.product)]) > 0)
      .map(it => ({ product: it.product?._id || it.product, quantity: parseFloat(returnForm[String(it.product?._id || it.product)]) }));
    if (items.length === 0) { addToast('Enter quantity to return for at least one item', 'error'); return; }
    if (!returnReason.trim()) { addToast('Reason is required', 'error'); return; }
    setSaving(true);
    try {
      const { data } = await api.post(`/purchases/${returnModal._id}/return`, { items, reason: returnReason });
      addToast('Purchase return recorded. Credit note generated.', 'success');
      setSearchedPurchase(data);
      setDetail(data);
      setReturnModal(null);
      setReturnForm({});
      setReturnReason('');
    } catch (err) { addToast(err.response?.data?.message || 'Return failed', 'error'); }
    setSaving(false);
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
        <button className="btn btn-primary" onClick={() => { setShowStandalone(!showStandalone); setSearchedPurchase(null); setSearchTerm(''); setSearchNotFound(false); setReturnModal(null); setDetail(null); }}>
          {showStandalone ? 'Back to Search' : 'Standalone Return'}
        </button>
      </div>

      {!showStandalone && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">Search Purchase</div>
            <div className="card-body">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569', marginBottom: '0.25rem', display: 'block' }}>
                    Purchase Number
                  </label>
                  <input
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setSearchNotFound(false); }}
                    onKeyDown={e => e.key === 'Enter' && search()}
                    placeholder="e.g. PUR-26-0001"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                  />
                </div>
                <button className="btn btn-primary" onClick={search} disabled={searching} style={{ height: '2.4rem' }}>
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
              {searchNotFound && <div className="alert alert-warning" style={{ marginTop: '0.5rem', marginBottom: 0 }}>Purchase not found. Please check the purchase number.</div>}
            </div>
          </div>

          {searchedPurchase && !returnModal && !detail && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Purchase: {searchedPurchase.purchaseNumber}</span>
                <span className={`badge ${searchedPurchase.status === 'returned' ? 'badge-danger' : (searchedPurchase.status === 'partial_return' ? 'badge-warning' : 'badge-success')}`}>{searchedPurchase.status}</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div><div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Date</div><div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{new Date(searchedPurchase.date || searchedPurchase.createdAt).toLocaleDateString('en-IN')}</div></div>
                  <div><div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Supplier</div><div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{searchedPurchase.supplier?.name || '-'}</div></div>
                  <div><div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Payment</div><div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{searchedPurchase.paymentMethod || 'cash'}</div></div>
                  <div><div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Grand Total</div><div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{fmt(searchedPurchase.grandTotal)}</div></div>
                  <div><div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Paid</div><div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{fmt(searchedPurchase.paidAmount)}</div></div>
                  <div><div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Due</div><div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{fmt(searchedPurchase.dueAmount)}</div></div>
                </div>

                <table className="table" style={{ marginTop: '0.5rem' }}>
                  <thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {searchedPurchase.items?.map((it, i) => (
                      <tr key={i}>
                        <td>{it.product?.name || 'Unknown'}</td>
                        <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(it.costPrice)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {searchedPurchase.creditNoteNumber && (
                  <div className="alert alert-success" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                    <strong>Credit Note:</strong> {searchedPurchase.creditNoteNumber} {searchedPurchase.creditNoteDate ? `(${new Date(searchedPurchase.creditNoteDate).toLocaleDateString('en-IN')})` : ''}
                  </div>
                )}

                {searchedPurchase.status === 'returned' ? (
                  <div className="alert alert-warning" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                    <strong>Already Returned.</strong> {searchedPurchase.returnRemark || 'N/A'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setDetail(searchedPurchase)}>View Details</button>
                    <button className="btn btn-danger" onClick={() => setReturnModal(searchedPurchase)} style={{ marginLeft: 'auto' }}>Process Return</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
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
              <SearchableSelect
                options={suppliers.map(s => ({ value: s._id, label: s.name }))}
                value={standalone.supplier}
                onChange={v => setStandalone(s => ({ ...s, supplier: v }))}
                placeholder="Cash"
              />
            </div>
            <label style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Items</label>
            {standalone.items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <select value={it.product} onChange={e => updateLine(idx, 'product', e.target.value)} style={{ flex: 3, padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <option value="">-- Product --</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name} (Stock: {p.stock})</option>)}
                </select>
                <input type="number" min="1" value={it.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseInt(e.target.value) || 0)} placeholder="Qty" style={{ flex: '0 0 70px', padding: '0.25rem 0.4rem', borderRadius: 4, border: '1px solid #e2e8f0', textAlign: 'right' }} />
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
                    const productId = it.product?._id || it.product;
                    const productName = it.product?.name || 'Unknown';
                    const already = (returnModal.returns || []).filter(x => {
                      const retId = x.product?._id || x.product;
                      return retId && String(retId) === String(productId);
                    }).reduce((s, x) => s + x.quantity, 0);
                    const max = Math.max(0, it.quantity - already);
                    return (
                      <tr key={i}>
                        <td>{productName}</td>
                        <td>{it.quantity}</td>
                        <td>{already}</td>
                        <td><input type="number" min="0" max={max} value={returnForm[String(productId)] || ''} onChange={e => setReturnForm({ ...returnForm, [String(productId)]: e.target.value })} placeholder={`0 / ${max}`} style={{ width: 70, maxWidth: 70, padding: '0.25rem 0.4rem', borderRadius: 4, border: '1px solid #e2e8f0', textAlign: 'right' }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="form-group"><label>Reason *</label><input value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="Reason for return" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setReturnModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={submitReturn} disabled={saving}>Record Return</button>
            </div>
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
            ...(detail.creditNoteNumber ? [{ label: 'Credit Note', value: detail.creditNoteNumber }] : []),
            ...(detail.returnRemark ? [{ label: 'Return Remark', value: detail.returnRemark }] : []),
            ...(detail.note ? [{ label: 'Note', value: detail.note }] : []),
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
          actions={
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {detail.creditNoteNumber && <button className="btn btn-sm btn-secondary" onClick={() => printCreditNote(detail, company)}>Print Credit Note</button>}
            </div>
          }
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
