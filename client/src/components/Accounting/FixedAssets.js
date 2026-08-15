import React, { useState, useEffect, useRef } from 'react';
import SearchableSelect from '../UI/SearchableSelect';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import ConfirmModal from '../UI/ConfirmModal';
import { useToast } from '../UI/Toast';
import { printHtmlDocument } from '../UI/printCommon';
import api from '../../api';

const CATEGORIES = [
  { value: 'furniture', label: 'Furniture & Fixtures' },
  { value: 'equipment', label: 'Office Equipment' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'building', label: 'Building' },
  { value: 'land', label: 'Land' },
  { value: 'computer', label: 'Computers & IT' },
  { value: 'other', label: 'Other' },
];

const emptyForm = { name: '', assetCode: '', category: 'other', description: '', date: adToBsStr(new Date()), purchaseCost: '', salvageValue: '', usefulLife: '', usefulLifeUnit: 'years', depreciationMethod: 'straight_line', supplier: '', location: '', serialNumber: '', sourceProduct: '', stockQuantity: '1', source: 'new' };

export default function FixedAssets() {
  const [assets, setAssets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [details, setDetails] = useState(null);
  const [confirmDep, setConfirmDep] = useState(null);
  const [confirmDisp, setConfirmDisp] = useState(null);
  const [dispForm, setDispForm] = useState({ date: adToBsStr(new Date()), amount: '' });
  const [suppliers, setSuppliers] = useState([]);
  const [filter, setFilter] = useState({ status: '', category: '' });
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', address: '', pan: '' });
  const productRef = useRef(null);
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = user.role === 'super_admin';

  useEffect(() => { load(); api.get('/suppliers').then(r => setSuppliers(r.data || [])).catch(() => {}); }, []);

  const load = () => {
    const params = {};
    if (filter.status) params.status = filter.status;
    if (filter.category) params.category = filter.category;
    api.get('/fixed-assets', { params }).then(r => setAssets(r.data)).catch(() => {});
    api.get('/fixed-assets/summary').then(r => setSummary(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, [filter]);

  useEffect(() => {
    if (!productQuery || productQuery.length < 2) { setProductResults([]); return; }
    const t = setTimeout(() => {
      api.get('/fixed-assets/search-products', { params: { q: productQuery } }).then(r => setProductResults(r.data || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [productQuery]);

  useEffect(() => {
    const handler = (e) => { if (productRef.current && !productRef.current.contains(e.target)) setShowProductDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectProduct = (p) => {
    setSelectedProduct(p);
    setForm(f => ({ ...f, name: p.name, purchaseCost: String(p.costPrice || ''), sourceProduct: p._id, source: 'stock' }));
    setProductQuery(p.name);
    setShowProductDropdown(false);
  };

  const handleCreateSupplier = async () => {
    if (!newSupplier.name) return addToast('Supplier name required', 'error');
    try {
      const { data } = await api.post('/fixed-assets/create-supplier', newSupplier);
      setSuppliers(s => [...s, data]);
      setForm(f => ({ ...f, supplier: data._id }));
      setNewSupplier({ name: '', phone: '', address: '', pan: '' });
      setShowNewSupplier(false);
      addToast('Supplier created', 'success');
    } catch (err) { addToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        purchaseDate: bsToADStr(form.date),
        purchaseCost: parseFloat(form.purchaseCost),
        salvageValue: parseFloat(form.salvageValue) || 0,
        usefulLife: parseInt(form.usefulLife),
        stockQuantity: parseInt(form.stockQuantity) || 1,
      };
      if (editing) {
        await api.put(`/fixed-assets/${editing._id}`, payload);
        addToast('Asset updated', 'success');
      } else {
        await api.post('/fixed-assets', payload);
        addToast('Asset added with journal entry', 'success');
      }
      setForm({ ...emptyForm });
      setEditing(null);
      setShowForm(false);
      setSelectedProduct(null);
      setProductQuery('');
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleDepreciate = async (asset) => {
    try {
      await api.post(`/fixed-assets/${asset._id}/depreciate`, { date: new Date() });
      addToast('Depreciation recorded', 'success');
      setConfirmDep(null);
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Depreciation failed', 'error'); }
  };

  const handleDispose = async (asset) => {
    try {
      await api.post(`/fixed-assets/${asset._id}/dispose`, {
        disposalDate: bsToADStr(dispForm.date),
        disposalAmount: parseFloat(dispForm.amount) || 0,
      });
      addToast('Asset disposed', 'success');
      setConfirmDisp(null);
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Dispose failed', 'error'); }
  };

  const startEdit = (a) => {
    setForm({ name: a.name, assetCode: a.assetCode || '', category: a.category || 'other', description: a.description || '', date: adToBsStr(a.purchaseDate), purchaseCost: a.purchaseCost || '', salvageValue: a.salvageValue || '', usefulLife: a.usefulLife || '', usefulLifeUnit: a.usefulLifeUnit || 'years', depreciationMethod: a.depreciationMethod || 'straight_line', supplier: a.supplier?._id || '', location: a.location || '', serialNumber: a.serialNumber || '', sourceProduct: a.sourceProduct?._id || '', stockQuantity: a.stockQuantity || '1', source: a.sourceProduct ? 'stock' : 'new' });
    setSelectedProduct(a.sourceProduct || null);
    setProductQuery(a.sourceProduct?.name || '');
    setEditing(a);
    setShowForm(true);
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const statusColors = { active: 'badge-success', fully_depreciated: 'badge-secondary', disposed: 'badge-danger', under_maintenance: 'badge-warning' };

  const filtered = assets.filter(a =>
    (!filter.status || a.status === filter.status) && (!filter.category || a.category === filter.category)
  );

  return (
    <div>
      <div className="page-header">
        <h1>Fixed Assets</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => {
            const el = document.querySelector('.table-responsive table');
            if (el) printHtmlDocument(el.outerHTML, 'Fixed Assets');
          }}>Print</button>
          <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ ...emptyForm }); setSelectedProduct(null); setProductQuery(''); }}>{showForm ? 'Cancel' : 'Add Asset'}</button>
        </div>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <div className="card" style={{ padding: '0.75rem 1rem', borderTop: '3px solid #2563eb' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Cost</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{formatNPR(summary.totalCost)}</div>
          </div>
          <div className="card" style={{ padding: '0.75rem 1rem', borderTop: '3px solid #7c3aed' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Accumulated Dep.</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#7c3aed' }}>{formatNPR(summary.totalAccDep)}</div>
          </div>
          <div className="card" style={{ padding: '0.75rem 1rem', borderTop: '3px solid #16a34a' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Net Book Value</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a' }}>{formatNPR(summary.netBookValue)}</div>
          </div>
          <div className="card" style={{ padding: '0.75rem 1rem', borderTop: '3px solid #f59e0b' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Active / Total</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{summary.active} / {summary.total}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem 1rem', flexWrap: 'wrap' }}>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} style={{ padding: '0.4rem', borderRadius: 6 }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="fully_depreciated">Fully Depreciated</option>
          <option value="disposed">Disposed</option>
          <option value="under_maintenance">Under Maintenance</option>
        </select>
        <select value={filter.category} onChange={e => setFilter(f => ({ ...f, category: e.target.value }))} style={{ padding: '0.4rem', borderRadius: 6 }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{filtered.length} asset(s)</span>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card" style={{ borderLeft: editing ? '4px solid #2563eb' : '4px solid #16a34a' }}>
          <h3>{editing ? `Edit: ${editing.name}` : 'Add Fixed Asset'}</h3>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button type="button" className={`btn btn-sm ${form.source === 'new' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm(f => ({ ...f, source: 'new', sourceProduct: '', purchaseCost: '' }))}>New Purchase</button>
            <button type="button" className={`btn btn-sm ${form.source === 'stock' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm(f => ({ ...f, source: 'stock', sourceProduct: '' }))}>From Stock</button>
          </div>

          {form.source === 'stock' && (
            <div className="form-group" style={{ position: 'relative' }} ref={productRef}>
              <label>Search Stock Item *</label>
              <input value={productQuery} onChange={e => { setProductQuery(e.target.value); setShowProductDropdown(true); setSelectedProduct(null); setForm(f => ({ ...f, sourceProduct: '' })); }} placeholder="Type product name or SKU..." required />
              {showProductDropdown && productResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 240, overflow: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  {productResults.map(p => (
                    <div key={p._id} onClick={() => selectProduct(p)} style={{ padding: '0.6rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>SKU: {p.sku || 'N/A'} | Stock: {p.stock || 0} {p.unit || 'pcs'}</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#059669' }}>Rs. {Number(p.costPrice || 0).toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                </div>
              )}
              {selectedProduct && (
                <div style={{ marginTop: '0.5rem', padding: '0.6rem', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0', fontSize: '0.8rem' }}>
                  <strong>{selectedProduct.name}</strong> | Stock: {selectedProduct.stock || 0} | Cost: Rs. {Number(selectedProduct.costPrice || 0).toLocaleString('en-IN')}
                </div>
              )}
            </div>
          )}

          <div className="form-grid">
            <div className="form-group"><label>Asset Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="form-group"><label>Asset Code</label><input value={form.assetCode} onChange={e => setForm({ ...form, assetCode: e.target.value })} placeholder="e.g. FA-001" /></div>
            <div className="form-group"><label>Category</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div className="form-group"><label>Purchase Date *</label><NepaliDatePicker value={form.date} onChange={v => setForm({ ...form, date: v })} /></div>
            <div className="form-group"><label>Purchase Cost (Rs.) *</label><input type="number" step="0.01" value={form.purchaseCost} onChange={e => setForm({ ...form, purchaseCost: e.target.value })} required /></div>
            {form.source === 'stock' && <div className="form-group"><label>Quantity *</label><input type="number" min="1" max={selectedProduct?.stock || 999} value={form.stockQuantity} onChange={e => setForm({ ...form, stockQuantity: e.target.value })} required /></div>}
            <div className="form-group"><label>Salvage Value (Rs.)</label><input type="number" step="0.01" value={form.salvageValue} onChange={e => setForm({ ...form, salvageValue: e.target.value })} /></div>
            <div className="form-group"><label>Useful Life *</label><div style={{ display: 'flex', gap: '0.4rem' }}><input type="number" min="1" value={form.usefulLife} onChange={e => setForm({ ...form, usefulLife: e.target.value })} required style={{ flex: 1 }} /><select value={form.usefulLifeUnit} onChange={e => setForm({ ...form, usefulLifeUnit: e.target.value })}><option value="years">Years</option><option value="months">Months</option></select></div></div>
            <div className="form-group"><label>Depreciation Method</label><select value={form.depreciationMethod} onChange={e => setForm({ ...form, depreciationMethod: e.target.value })}><option value="straight_line">Straight Line</option><option value="declining_balance">Declining Balance</option></select></div>
            <div className="form-group">
              <label>Supplier</label>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <div style={{ flex: 1 }}><SearchableSelect options={[{ value: '', label: 'Select' }, ...suppliers.map(s => ({ value: s._id, label: s.name }))]} value={form.supplier} onChange={v => setForm({ ...form, supplier: v })} placeholder="Search supplier..." /></div>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowNewSupplier(!showNewSupplier)} title="Add new supplier">+</button>
              </div>
              {showNewSupplier && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.4rem' }}>New Supplier</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    <input placeholder="Name *" value={newSupplier.name} onChange={e => setNewSupplier(s => ({ ...s, name: e.target.value }))} style={{ padding: '0.35rem', fontSize: '0.8rem' }} />
                    <input placeholder="Phone" value={newSupplier.phone} onChange={e => setNewSupplier(s => ({ ...s, phone: e.target.value }))} style={{ padding: '0.35rem', fontSize: '0.8rem' }} />
                    <input placeholder="Address" value={newSupplier.address} onChange={e => setNewSupplier(s => ({ ...s, address: e.target.value }))} style={{ padding: '0.35rem', fontSize: '0.8rem' }} />
                    <input placeholder="PAN" value={newSupplier.pan} onChange={e => setNewSupplier(s => ({ ...s, pan: e.target.value }))} style={{ padding: '0.35rem', fontSize: '0.8rem' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={handleCreateSupplier}>Save Supplier</button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowNewSupplier(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div className="form-group"><label>Location</label><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Office 2nd Floor" /></div>
            <div className="form-group"><label>Serial Number</label><input value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} /></div>
            <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <button type="submit" className="btn btn-primary">{editing ? 'Update Asset' : 'Add Asset'}</button>
        </form>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Purchase Date</th><th className="text-right">Cost</th><th className="text-right">Acc. Dep.</th><th className="text-right">NBV</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a._id} style={{ cursor: 'pointer' }} onDoubleClick={() => setDetails(a)}>
                  <td>{a.assetCode || '-'}</td>
                  <td>{a.name}{a.sourceProduct && <span className="badge badge-info" style={{ marginLeft: 4, fontSize: '0.65rem' }}>FROM STOCK</span>}</td>
                  <td><span className="badge badge-info">{CATEGORIES.find(c => c.value === a.category)?.label || a.category}</span></td>
                  <td>{adToBsStr(a.purchaseDate)}</td>
                  <td className="text-right">{formatNPR(a.purchaseCost)}</td>
                  <td className="text-right" style={{ color: '#7c3aed' }}>{formatNPR(a.accumulatedDepreciation)}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>{formatNPR(a.netBookValue)}</td>
                  <td><span className={`badge ${statusColors[a.status] || 'badge-secondary'}`}>{a.status?.replace('_', ' ')}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {a.status === 'active' && isSuperAdmin && <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setConfirmDep(a); }}>Depreciate</button>}
                      {a.status === 'active' && isSuperAdmin && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); startEdit(a); }}>Edit</button>}
                      {a.status === 'active' && isSuperAdmin && <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setConfirmDisp(a); setDispForm({ date: adToBsStr(new Date()), amount: '' }); }}>Dispose</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="9" className="text-center">No fixed assets found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {details && (
        <EntryDetailsModal
          title={details.name}
          subtitle={`${details.assetCode || 'N/A'} | ${CATEGORIES.find(c => c.value === details.category)?.label || details.category}`}
          meta={[
            { label: 'Purchase Date', value: adToBsStr(details.purchaseDate) },
            { label: 'Purchase Cost', value: formatNPR(details.purchaseCost) },
            { label: 'Salvage Value', value: formatNPR(details.salvageValue) },
            { label: 'Useful Life', value: `${details.usefulLife} ${details.usefulLifeUnit}` },
            { label: 'Method', value: details.depreciationMethod?.replace('_', ' ') },
            { label: 'Accumulated Dep.', value: formatNPR(details.accumulatedDepreciation) },
            { label: 'Net Book Value', value: formatNPR(details.netBookValue) },
            { label: 'Status', value: details.status?.replace('_', ' ') },
            { label: 'Location', value: details.location || '-' },
            { label: 'Serial', value: details.serialNumber || '-' },
            ...(details.sourceProduct ? [{ label: 'Source', value: `Stock (${details.stockQuantity || 1} units from ${details.sourceProduct.name || 'Product'})` }] : []),
            { label: 'Asset Account', value: details.assetAccount ? `${details.assetAccount.code} - ${details.assetAccount.name}` : '-' },
            ...(details.description ? [{ label: 'Description', value: details.description }] : []),
          ]}
            columns={[
              { key: 'date', label: 'Date', render: (d) => new Date(d).toLocaleDateString('en-IN') },
              { key: 'amount', label: 'Amount', align: 'right', render: (v) => formatNPR(v) },
              { key: 'fiscalYear', label: 'Fiscal Year' },
            ]}
            rows={(details.depreciationHistory || []).map(h => ({ date: h.date, amount: h.amount, fiscalYear: h.fiscalYear || '-' }))}
            footer={[{ label: 'Total Depreciation', value: formatNPR(details.accumulatedDepreciation) }]}
            onClose={() => setDetails(null)}
          />
      )}

      {confirmDep && (
        <ConfirmModal
          open={true}
          title="Record Depreciation"
          message={`Record depreciation for "${confirmDep.name}"? Current NBV: ${formatNPR(confirmDep.netBookValue)}`}
          onConfirm={() => handleDepreciate(confirmDep)}
          onCancel={() => setConfirmDep(null)}
        />
      )}

      {confirmDisp && (
        <ConfirmModal
          open={true}
          title="Dispose Asset"
          message={`Dispose "${confirmDisp.name}"? This will reverse the asset accounts and record any gain/loss.`}
          onConfirm={() => handleDispose(confirmDisp)}
          onCancel={() => setConfirmDisp(null)}
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <NepaliDatePicker value={dispForm.date} onChange={v => setDispForm(f => ({ ...f, date: v }))} />
              <input type="number" step="0.01" placeholder="Sale amount" value={dispForm.amount} onChange={e => setDispForm(f => ({ ...f, amount: e.target.value }))} style={{ width: 120, padding: '0.4rem', borderRadius: 6, border: '1px solid #e2e8f0' }} />
            </div>
          }
        />
      )}
    </div>
  );
}
