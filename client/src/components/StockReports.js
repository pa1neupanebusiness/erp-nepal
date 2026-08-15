import React, { useState, useEffect } from 'react';
import api from '../api';
import EntryDetailsModal from './UI/EntryDetailsModal';
import { useToast } from './UI/Toast';
import NepaliDatePicker, { adToBsStr, bsToADStr } from './UI/NepaliDatePicker';
import { printEntry } from './UI/printEntry';

const fmtN = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (n) => 'Rs. ' + fmtN(n);
const fmtQty = (n) => {
  const v = Number(n || 0);
  return v % 1 === 0 ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const MOV_LABEL = { in: 'Stock In', out: 'Stock Out', adjustment: 'Adjustment', sales_return: 'Sales Return', purchase_return: 'Purchase Return' };

export default function StockReports() {
  const today = adToBsStr(new Date());
  const firstOfMonth = adToBsStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [detailsId, setDetailsId] = useState(null);
  const [movements, setMovements] = useState([]);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({ stock: 0, minStock: 0, costPrice: 0, sellingPrice: 0 });
  const [saving, setSaving] = useState(false);
  const addToast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (from) params.from = bsToADStr(from);
      if (to) params.to = bsToADStr(to);
      const { data } = await api.get('/reports/stock-overview', { params });
      setRows(data.rows || []);
      setSummary(data.summary || {});
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load stock overview', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const q = search.trim().toLowerCase();
  const filtered = q ? rows.filter(r =>
    (r.sku || '').toLowerCase().includes(q) ||
    (r.name || '').toLowerCase().includes(q) ||
    (r.category || '').toLowerCase().includes(q)
  ) : rows;

  const openDetails = async (id) => {
    setDetailsId(id);
    setMovements([]);
    try {
      const params = {};
      if (from) params.from = bsToADStr(from);
      if (to) params.to = bsToADStr(to);
      const { data } = await api.get(`/products/${id}/movements`, { params });
      setMovements(data || []);
    } catch (err) { /* ignore */ }
  };

  const startEdit = (r) => {
    setEditRow(r);
    setEditForm({ stock: r.remaining, minStock: r.minStock, costPrice: r.costPrice, sellingPrice: r.sellingPrice });
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.put(`/products/${editRow._id}`, {
        stock: parseFloat(editForm.stock) || 0,
        minStock: parseFloat(editForm.minStock) || 0,
        costPrice: parseFloat(editForm.costPrice) || 0,
        sellingPrice: parseFloat(editForm.sellingPrice) || 0,
      });
      addToast('Product updated', 'success');
      setEditRow(null);
      await load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update product', 'error');
    }
    setSaving(false);
  };

  const stockBadge = (lvl) =>
    lvl === 'out' ? <span className="badge badge-danger">Out of Stock</span>
      : lvl === 'low' ? <span className="badge badge-warning">Low Stock</span>
        : <span className="badge badge-success">In Stock</span>;

  const detailRow = rows.find(r => r._id === detailsId);

  return (
    <div>
      <div className="page-header">
        <h1>Stock & Inventory Overview</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>From</label>
            <NepaliDatePicker value={from} onChange={v => setFrom(v)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>To</label>
            <NepaliDatePicker value={to} onChange={v => setTo(v)} />
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Apply Range'}</button>
          <button className="btn btn-secondary" onClick={() => { setFrom(''); setTo(''); }}>All</button>
          <button className="btn btn-secondary" onClick={() => {
            const rows = filtered.map(r => ({ SKU: r.sku, Product: r.name, Category: r.category, Opening: fmtQty(r.opening), 'Stock In': fmtQty(r.stockIn), 'Stock Out': fmtQty(r.stockOut), 'Sales Return': fmtQty(r.salesReturn), 'Purchase Return': fmtQty(r.purchaseReturn), Remaining: fmtQty(r.remaining), 'Min Stock': fmtQty(r.minStock), 'Cost Price': fmtP(r.costPrice), 'Sell Price': fmtP(r.sellingPrice), Status: r.stockLevel }));
            if (rows.length === 0) return;
            printEntry({ title: 'Stock & Inventory Overview', columns: Object.keys(rows[0]).map(k => ({ key: k, label: k, align: ['Opening','Stock In','Stock Out','Sales Return','Purchase Return','Remaining','Min Stock','Cost Price','Sell Price'].includes(k) ? 'right' : undefined })), rows, footer: [{ label: 'Total Products', value: String(rows.length) }] });
          }}>Print</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 260, flex: 1 }}>
            <label>Search Product / SKU / Category</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Type to filter items..." />
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Stock Valuation (filtered)</div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#059669' }}>{fmtP(filtered.reduce((s, r) => s + r.valuation, 0))}</div>
          </div>
        </div>
      </div>

      <div className="report-summary">
        <div className="summary-card" style={{ borderTop: '3px solid #7c3aed' }}><div className="summary-label">📦 Products</div><div className="summary-value">{filtered.length}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #16a34a' }}><div className="summary-label">⬇️ Stock In</div><div className="summary-value">{fmtQty(filtered.reduce((s, r) => s + r.stockIn, 0))}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #dc2626' }}><div className="summary-label">⬆️ Stock Out</div><div className="summary-value">{fmtQty(filtered.reduce((s, r) => s + r.stockOut, 0))}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #0d9488' }}><div className="summary-label">↩️ Sales Return</div><div className="summary-value">{fmtQty(filtered.reduce((s, r) => s + r.salesReturn, 0))}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #d97706' }}><div className="summary-label">↩️ Purchase Return</div><div className="summary-value">{fmtQty(filtered.reduce((s, r) => s + r.purchaseReturn, 0))}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #ef4444' }}><div className="summary-label">⚠️ Low Stock Items</div><div className="summary-value">{filtered.filter(r => r.stockLevel !== 'ok').length}</div></div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th><th>Product</th><th>Category</th>
                <th className="text-right">Opening</th><th className="text-right">Stock In</th><th className="text-right">Stock Out</th>
                <th className="text-right">Sales Return</th><th className="text-right">Purchase Return</th>
                <th className="text-right">Remaining</th><th className="text-right">Min</th>
                <th className="text-right">Cost Price</th><th className="text-right">Sell Price</th>
                <th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r._id} className={r.stockLevel === 'low' || r.stockLevel === 'out' ? 'row-warning' : ''} style={{ cursor: 'pointer' }} onClick={() => openDetails(r._id)}>
                  <td>{r.sku}</td>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.category}</td>
                  <td className="text-right">{fmtQty(r.opening)}</td>
                  <td className="text-right" style={{ color: '#16a34a' }}>{fmtQty(r.stockIn)}</td>
                  <td className="text-right" style={{ color: '#dc2626' }}>{fmtQty(r.stockOut)}</td>
                  <td className="text-right">{fmtQty(r.salesReturn)}</td>
                  <td className="text-right">{fmtQty(r.purchaseReturn)}</td>
                  <td className="text-right"><strong>{fmtQty(r.remaining)}</strong> <small style={{ color: '#94a3b8' }}>{r.unit}</small></td>
                  <td className="text-right">{fmtQty(r.minStock)}</td>
                  <td className="text-right" style={{ fontStyle: 'italic', color: '#64748b' }} title="Weighted average cost">{fmtP(r.costPrice)}<br/><small style={{ fontSize: '0.7rem' }}>avg. cost</small></td>
                  <td className="text-right">{fmtP(r.sellingPrice)}</td>
                  <td>{stockBadge(r.stockLevel)}</td>
                  <td className="action-cell" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => openDetails(r._id)}>View</button>
                    <button className="btn btn-sm btn-secondary" style={{ marginLeft: '0.25rem' }} onClick={() => startEdit(r)}>Edit</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="14" className="text-center">{loading ? 'Loading...' : 'No products found'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detailRow && (
        <EntryDetailsModal
          title={detailRow.name}
          subtitle={`SKU: ${detailRow.sku} | ${detailRow.category}`}
          meta={[
            { label: 'Opening', value: fmtQty(detailRow.opening) },
            { label: 'Stock In', value: fmtQty(detailRow.stockIn) },
            { label: 'Stock Out', value: fmtQty(detailRow.stockOut) },
            { label: 'Sales Return', value: fmtQty(detailRow.salesReturn) },
            { label: 'Purchase Return', value: fmtQty(detailRow.purchaseReturn) },
            { label: 'Remaining', value: `${fmtQty(detailRow.remaining)} ${detailRow.unit}` },
            { label: 'Min Stock', value: fmtQty(detailRow.minStock) },
            { label: 'Avg. Cost Price', value: fmtP(detailRow.costPrice) },
            { label: 'Sell Price', value: fmtP(detailRow.sellingPrice) },
            { label: 'Valuation', value: fmtP(detailRow.valuation) },
            { label: 'Status', value: detailRow.status },
          ]}
          columns={[
            { key: 'createdAt', label: 'Date', render: (d) => new Date(d).toLocaleString('en-IN') },
            { key: 'type', label: 'Type', render: (v) => MOV_LABEL[v] || v },
            { key: 'quantity', label: 'Qty', align: 'right' },
            { key: 'reference', label: 'Reference' },
            { key: 'note', label: 'Note' },
          ]}
          rows={movements}
          footer={[
            { label: 'Total In', value: fmtQty(movements.filter(m => m.type === 'in' || m.type === 'sales_return' || m.type === 'adjustment' && m.quantity > 0).reduce((s, m) => s + m.quantity, 0)) },
            { label: 'Total Out', value: fmtQty(movements.filter(m => m.type === 'out' || m.type === 'purchase_return' || m.type === 'adjustment' && m.quantity < 0).reduce((s, m) => s + Math.abs(m.quantity), 0)) },
          ]}
          actions={
            <button className="btn btn-sm" onClick={() => { setDetailsId(null); startEdit(detailRow); }}>Edit</button>
          }
          onClose={() => setDetailsId(null)}
        />
      )}

      {editRow && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Edit Product Stock / Price</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setEditRow(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '0.5rem' }}>{editRow.name} <small className="text-muted">({editRow.sku})</small></p>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group"><label>Current Stock</label><div style={{ padding: '0.5rem 0', fontWeight: 600 }}>{editForm.stock} <small className="text-muted">Use "Add Stock" to adjust</small></div></div>
                <div className="form-group"><label>Min Stock</label><input type="number" value={editForm.minStock} onChange={e => setEditForm({ ...editForm, minStock: e.target.value })} /></div>
                <div className="form-group"><label>Avg. Cost Price</label><input type="number" step="0.01" value={editForm.costPrice} onChange={e => setEditForm({ ...editForm, costPrice: e.target.value })} /></div>
                <div className="form-group"><label>Selling Price</label><input type="number" step="0.01" value={editForm.sellingPrice} onChange={e => setEditForm({ ...editForm, sellingPrice: e.target.value })} /></div>
              </div>
              <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>Stock value is recomputed as Remaining × Cost Price after saving.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setEditRow(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

