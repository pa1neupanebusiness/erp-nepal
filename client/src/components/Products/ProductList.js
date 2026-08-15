import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../UI/Toast';
import ConfirmModal from '../UI/ConfirmModal';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import SearchableSelect from '../UI/SearchableSelect';
import { printEntry } from '../UI/printEntry';
import api from '../../api';
import UploadModal from '../UploadModal';

const emptyForm = { name: '', sku: '', barcode: '', category: '', unit: 'pcs', minStock: 5, costPrice: 0, sellingPrice: 0, stock: 0, itemCondition: 'new' };

export default function ProductList() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [movMap, setMovMap] = useState({});
  const [catModal, setCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dropCat, setDropCat] = useState(null);
  const addToast = useToast();
  const formRef = useRef(null);

  useEffect(() => {
    load();
    api.get('/categories').then(r => setCategories(r.data));
  }, []);

  const load = () => api.get('/products').then(r => setItems(r.data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))));

  const loadMovements = async (p) => {
    if (movMap[p._id]) return;
    try {
      const { data } = await api.get(`/products/${p._id}/movements`);
      setMovMap(prev => ({ ...prev, [p._id]: data }));
    } catch (err) { /* ignore */ }
  };

  const handleDoubleClick = (p) => {
    if (expandedId === p._id) { setDetailsId(p._id); return; }
    setExpandedId(p._id);
    loadMovements(p);
  };

  const filtered = items.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/products/${editing._id}`, form);
      } else {
        await api.post('/products', form);
      }
      setForm({ ...emptyForm });
      setEditing(null);
      setShowForm(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to save product', 'error');
    }
  };

  const edit = (item) => {
    setForm({
      name: item.name, sku: item.sku || '', barcode: item.barcode || '',
      category: item.category?._id || '', unit: item.unit || 'pcs', minStock: item.minStock || 5,
      costPrice: item.costPrice || 0, sellingPrice: item.sellingPrice || 0,
      stock: item.stock || 0, taxRate: item.taxRate || 0,
      vatEnabled: item.vatEnabled || false, priceIncludesTax: item.priceIncludesTax || false,
      itemCondition: item.itemCondition || 'new',
    });
    setEditing(item);
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const remove = (id) => {
    setConfirmDelete({ id, message: 'Delete this product?' });
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    try {
      const { data } = await api.post('/categories', { name: newCatName.trim() });
      setCategories(prev => [...prev, data]);
      setForm(f => ({ ...f, category: data._id }));
      setNewCatName('');
      setCatModal(false);
      addToast('Category created', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create category', 'error');
    } finally { setCatSaving(false); }
  };

  const moveToCategory = async (productId, categoryId) => {
    try {
      await api.put(`/products/${productId}`, { category: categoryId });
      setItems(prev => prev.map(p => p._id === productId ? { ...p, category: categories.find(c => c._id === categoryId) || null } : p));
      addToast('Product moved', 'success');
    } catch (err) {
      addToast('Failed to move product', 'error');
    }
  };

  const handleDragStart = (e, productId) => {
    setDragId(productId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, catId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropCat(catId);
  };

  const handleDrop = (e, catId) => {
    e.preventDefault();
    if (dragId) moveToCategory(dragId, catId);
    setDragId(null);
    setDropCat(null);
  };

  const handleDragEnd = () => { setDragId(null); setDropCat(null); };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const uncategorized = filtered.filter(p => !p.category);
  const grouped = {};
  categories.forEach(c => { grouped[c._id] = { cat: c, products: [] }; });
  filtered.forEach(p => { if (p.category && grouped[p.category._id]) grouped[p.category._id].products.push(p); });

  return (
    <div>
      <div className="page-header">
        <h1>Products</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input className="search-input" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-secondary" onClick={() => setShowUpload(true)}>Excel Import</button>
          <button className="btn btn-secondary" onClick={() => {
            const rows = filtered.map(p => ({ SKU: p.sku || '-', Name: p.name, Category: p.category?.name || '-', 'Cost Price': formatNPR(p.costPrice), 'Selling Price': formatNPR(p.sellingPrice), VAT: p.vatEnabled ? `${p.taxRate}% ${p.priceIncludesTax ? 'Incl' : 'Excl'}` : '-', Stock: p.stock }));
            printEntry({ title: 'Products List', columns: Object.keys(rows[0] || {}).map(k => ({ key: k, label: k })), rows, footer: [{ label: 'Total Products', value: String(filtered.length) }] });
          }}>Print</button>
          <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ ...emptyForm }); }}>{showForm ? 'Cancel' : 'Add Product'}</button>
        </div>
      </div>

      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="card form-card" style={{ borderLeft: editing ? '4px solid #2563eb' : '4px solid #16a34a' }}>
          <h3>{editing ? `Edit: ${editing.name}` : 'New Product'}</h3>
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="form-group"><label>SKU</label><input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="Auto if empty" /></div>
            <div className="form-group"><label>Barcode</label><input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} /></div>
            <div className="form-group">
              <label>Category</label>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <SearchableSelect
                    options={[{ value: '', label: 'Select' }, ...categories.map(c => ({ value: c._id, label: c.name }))]}
                    value={form.category}
                    onChange={v => setForm({ ...form, category: v })}
                    placeholder="Search category..."
                  />
                </div>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setCatModal(true)} title="Add new category" style={{ padding: '0.4rem 0.6rem', fontWeight: 700, fontSize: '0.9rem' }}>+</button>
              </div>
            </div>
            <div className="form-group"><label>Unit</label><select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}><option value="pcs">Pieces (pcs)</option><option value="kg">Kilogram (kg)</option><option value="ltr">Liter (ltr)</option><option value="box">Box</option><option value="pack">Pack</option></select></div>
            <div className="form-group"><label>Min Stock</label><input type="number" value={form.minStock} onChange={e => setForm({ ...form, minStock: parseInt(e.target.value) || 0 })} /></div>
            <div className="form-group"><label>Cost Price (Rs.)</label><input type="number" step="0.01" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: parseFloat(e.target.value) || 0 })} /></div>
            <div className="form-group"><label>Selling Price (Rs.)</label><input type="number" step="0.01" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: parseFloat(e.target.value) || 0 })} /></div>
            {editing && <div className="form-group"><label>Stock</label><input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: parseInt(e.target.value) || 0 })} /></div>}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.vatEnabled} onChange={e => setForm({ ...form, vatEnabled: e.target.checked })} />
                Enable VAT
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary">{editing ? 'Update Product' : 'Create Product'}</button>
            {editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setShowForm(false); setForm({ ...emptyForm }); }}>Cancel Edit</button>}
          </div>
        </form>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {categories.map(c => (
          <div key={c._id}
            onDragOver={e => handleDragOver(e, c._id)}
            onDrop={e => handleDrop(e, c._id)}
            onDragLeave={() => setDropCat(null)}
            style={{
              padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, cursor: 'default',
              border: dropCat === c._id ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: dropCat === c._id ? '#eff6ff' : '#f8fafc',
              transition: 'all 0.15s',
            }}>
            {c.name} ({grouped[c._id]?.products.length || 0})
          </div>
        ))}
        {uncategorized.length > 0 && (
          <span style={{ padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
            Uncategorized ({uncategorized.length})
          </span>
        )}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr><th style={{ width: 30 }}></th><th>SKU</th><th>Name</th><th>Category</th><th>Cost Price</th><th>Selling Price</th><th>VAT</th><th>Stock</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p._id}
                  draggable
                  onDragStart={e => handleDragStart(e, p._id)}
                  onDragEnd={handleDragEnd}
                  className={p.stock <= p.minStock ? 'row-warning' : ''}
                  style={{ cursor: 'grab', opacity: dragId === p._id ? 0.4 : 1 }}
                  onDoubleClick={() => handleDoubleClick(p)}>
                  <td style={{ fontSize: '0.7rem', color: '#94a3b8' }}>⠿</td>
                  <td>{p.sku || '-'}</td><td>{p.name}</td>
                  <td>
                    {p.category ? (
                      <span className="badge badge-info">{p.category.name}</span>
                    ) : (
                      <span className="badge badge-warning">Uncategorized</span>
                    )}
                  </td>
                  <td>{formatNPR(p.costPrice)}</td><td>{formatNPR(p.sellingPrice)}</td>
                  <td>{p.vatEnabled ? <span className={`badge ${p.priceIncludesTax ? 'badge-success' : 'badge-secondary'}`}>{p.taxRate}% {p.priceIncludesTax ? 'Incl' : 'Excl'}</span> : '-'}</td>
                  <td><span className={`badge ${p.stock <= p.minStock ? 'badge-danger' : 'badge-success'}`}>{p.stock}</span></td>
                  <td className="action-cell">
                    <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); edit(p); }}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); remove(p._id); }}>Del</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="9" className="text-center">No products</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && <UploadModal endpoint="products" label="Products" onClose={() => setShowUpload(false)} onSuccess={load} />}

      {catModal && (
        <div className="modal-overlay" onClick={() => setCatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header"><h3>Add Category</h3><button className="btn btn-sm modal-close-x" onClick={() => setCatModal(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Category Name</label>
                <input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} placeholder="e.g. Electronics" autoFocus style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setCatModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={addCategory} disabled={catSaving || !newCatName.trim()}>{catSaving ? 'Adding...' : 'Add Category'}</button>
            </div>
          </div>
        </div>
      )}

      {detailsId && (() => {
        const p = items.find(x => x._id === detailsId);
        if (!p) return null;
        const movements = movMap[p._id] || [];
        return (
          <EntryDetailsModal
            title={p.name}
            subtitle={`SKU: ${p.sku} | Category: ${p.category?.name || '-'} | Supplier: ${p.supplier?.name || '-'}`}
            meta={[
              { label: 'Stock', value: String(p.stock) },
              { label: 'Cost Price', value: formatNPR(p.costPrice) },
              { label: 'Selling Price', value: formatNPR(p.sellingPrice) },
              { label: 'Min Stock', value: String(p.minStock) },
              { label: 'VAT', value: p.vatEnabled ? `${p.taxRate}% ${p.priceIncludesTax ? 'Incl' : 'Excl'}` : 'Disabled' },
            ]}
            columns={[
              { key: 'createdAt', label: 'Date', render: (d) => new Date(d).toLocaleString('en-IN') },
              { key: 'type', label: 'Type', render: (v) => v === 'in' ? 'In' : 'Out' },
              { key: 'quantity', label: 'Qty', align: 'right' },
              { key: 'reference', label: 'Reference' },
              { key: 'note', label: 'Note' },
              { key: 'createdBy', label: 'By', render: (v) => v?.name || '-' },
            ]}
            rows={movements}
            footer={[
              { label: 'Total In', value: String(movements.filter(m => m.type === 'in').reduce((s, m) => s + m.quantity, 0)) },
              { label: 'Total Out', value: String(movements.filter(m => m.type !== 'in').reduce((s, m) => s + m.quantity, 0)) },
            ]}
            onPrint={() => printEntry({ title: p.name, subtitle: `SKU: ${p.sku}`, meta: [
              { label: 'Stock', value: String(p.stock) },
              { label: 'Cost Price', value: formatNPR(p.costPrice) },
              { label: 'Selling Price', value: formatNPR(p.sellingPrice) },
              { label: 'VAT', value: p.vatEnabled ? `${p.taxRate}% ${p.priceIncludesTax ? 'Incl' : 'Excl'}` : 'Disabled' },
            ], columns: [
              { key: 'createdAt', label: 'Date', render: (d) => new Date(d).toLocaleString('en-IN') },
              { key: 'type', label: 'Type', render: (v) => v === 'in' ? 'In' : 'Out' },
              { key: 'quantity', label: 'Qty', align: 'right' },
              { key: 'reference', label: 'Reference' },
              { key: 'note', label: 'Note' },
              { key: 'createdBy', label: 'By', render: (v) => v?.name || '-' },
            ], rows: movements, footer: [
              { label: 'Total In', value: String(movements.filter(m => m.type === 'in').reduce((s, m) => s + m.quantity, 0)) },
              { label: 'Total Out', value: String(movements.filter(m => m.type !== 'in').reduce((s, m) => s + m.quantity, 0)) },
            ] })}
            onClose={() => setDetailsId(null)}
          />
        );
      })()}
      <ConfirmModal open={!!confirmDelete} title="Confirm Delete" message={confirmDelete?.message} onConfirm={async () => { if (confirmDelete) { await api.delete(`/products/${confirmDelete.id}`); load(); } setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
