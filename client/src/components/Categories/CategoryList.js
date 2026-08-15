import React, { useState, useEffect, useMemo } from 'react';
import ConfirmModal from '../UI/ConfirmModal';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { printEntry } from '../UI/printEntry';

const fmtNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CategoryList() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragType, setDragType] = useState(null);
  const [dropZone, setDropZone] = useState(null);
  const [productDropCat, setProductDropCat] = useState(null);
  const [makeSubModal, setMakeSubModal] = useState(null);
  const [makeSubParent, setMakeSubParent] = useState('');
  const addToast = useToast();

  const load = async () => {
    try {
      const [catRes, prodRes] = await Promise.all([api.get('/categories'), api.get('/products')]);
      setCategories(catRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load categories', 'error');
    }
  };
  useEffect(() => { load(); }, []);

  const byId = useMemo(() => new Map(categories.map(c => [String(c._id), c])), [categories]);

  const childMap = useMemo(() => {
    const map = {};
    categories.forEach(c => {
      const key = c.parent && byId.has(String(c.parent)) ? String(c.parent) : 'root';
      (map[key] = map[key] || []).push(c);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name || '').localeCompare(String(b.name || ''))));
    return map;
  }, [categories, byId]);

  const ordered = useMemo(() => {
    const out = [];
    const walk = (cats, depth) => {
      cats.forEach(c => {
        out.push({ cat: c, depth });
        walk(childMap[String(c._id)] || [], depth + 1);
      });
    };
    walk(childMap.root || [], 0);
    return out;
  }, [childMap]);

  const productsByCat = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const key = p.category ? String(p.category._id || p.category) : 'none';
      (map[key] = map[key] || []).push(p);
    });
    return map;
  }, [products]);

  const unassignedProducts = useMemo(() => products.filter(p => !p.category), [products]);

  const isDescendantOf = (nodeId, ofId) => {
    const walk = (id) => (childMap[id] || []).some(ch => String(ch._id) === nodeId || walk(String(ch._id)));
    return walk(ofId);
  };

  const descendantIds = (id) => {
    const out = [];
    const walk = (cid) => {
      (childMap[cid] || []).forEach(ch => { out.push(String(ch._id)); walk(String(ch._id)); });
    };
    walk(id);
    return out;
  };

  const toggle = (cat) => {
    setExpanded(prev => ({ ...prev, [String(cat._id)]: !prev[String(cat._id)] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim() };
      if (parent) payload.parent = parent;
      if (editing) {
        await api.put(`/categories/${editing._id}`, payload);
      } else {
        await api.post('/categories', payload);
      }
      setName('');
      setParent('');
      setEditing(null);
      await load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save category', 'error');
    }
    setSaving(false);
  };

  const edit = (item) => {
    setName(item.name);
    setParent(item.parent ? String(item.parent) : '');
    setEditing(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addSub = (item) => {
    setName('');
    setParent(String(item._id));
    setEditing(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = (item) => {
    setConfirmDelete({ id: item._id, name: item.name, message: `Delete category "${item.name}"? Products in this category will become uncategorized.` });
  };

  const makeMain = async (cat) => {
    try {
      await api.put(`/categories/${cat._id}`, { parent: null });
      addToast(`"${cat.name}" is now a top-level (main) category`, 'success');
      await load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update category', 'error');
    }
  };

  const makeSub = async () => {
    if (!makeSubModal || !makeSubParent) return;
    if (makeSubParent === String(makeSubModal._id)) { addToast('Cannot be its own parent', 'error'); return; }
    if (isDescendantOf(makeSubParent, String(makeSubModal._id))) { addToast('Cannot assign to a descendant', 'error'); return; }
    try {
      await api.put(`/categories/${makeSubModal._id}`, { parent: makeSubParent });
      addToast(`"${makeSubModal.name}" is now a sub-category of "${byId.get(makeSubParent)?.name}"`, 'success');
      setMakeSubModal(null);
      setMakeSubParent('');
      await load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update category', 'error');
    }
  };

  const moveProductToCategory = async (productId, categoryId) => {
    try {
      await api.put(`/products/${productId}`, { category: categoryId || null });
      const catName = categoryId ? byId.get(categoryId)?.name : 'Uncategorized';
      addToast(`Product moved to "${catName}"`, 'success');
      await load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to move product', 'error');
    }
  };

  const blockedParentIds = (() => {
    if (!editing) return new Set();
    return new Set(descendantIds(String(editing._id)).concat([String(editing._id)]));
  })();

  // ─── Category Drag & drop ───
  const buildSibLists = () => {
    const sibs = {};
    categories.forEach(c => {
      const key = c.parent && byId.has(String(c.parent)) ? String(c.parent) : 'root';
      (sibs[key] = sibs[key] || []).push(String(c._id));
    });
    Object.values(sibs).forEach(arr => arr.sort((a, b) => (byId.get(a).order || 0) - (byId.get(b).order || 0) || String(byId.get(a).name || '').localeCompare(String(byId.get(b).name || ''))));
    return sibs;
  };

  const persistOrder = async (flat) => {
    try {
      await api.put('/categories/sort', { items: flat.map(f => ({ id: f.id, parent: f.parent })) });
      await load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to reorder categories', 'error');
      await load();
    }
  };

  const applyDrop = (targetId, zone) => {
    const id = dragId;
    setDropZone(null);
    if (!id || !byId.has(id)) { setDragId(null); setDragType(null); return; }
    const sibs = buildSibLists();
    let removed = false;
    Object.keys(sibs).forEach(k => {
      const i = sibs[k].indexOf(id);
      if (i !== -1) { sibs[k].splice(i, 1); removed = true; }
    });
    if (!removed) { setDragId(null); setDragType(null); return; }
    let newParentKey;
    let insertAt;
    if (!targetId) {
      newParentKey = 'root';
      insertAt = (sibs.root || (sibs.root = [])).length;
    } else if (zone === 'inside') {
      if (targetId === id || isDescendantOf(targetId, id)) { setDragId(null); setDragType(null); return; }
      newParentKey = targetId;
      insertAt = (sibs[targetId] || (sibs[targetId] = [])).length;
    } else {
      if (targetId === id || isDescendantOf(targetId, id)) { setDragId(null); setDragType(null); return; }
      const targetCat = byId.get(targetId);
      newParentKey = targetCat && targetCat.parent && byId.has(String(targetCat.parent)) ? String(targetCat.parent) : 'root';
      const list = sibs[newParentKey] || (sibs[newParentKey] = []);
      const ti = list.indexOf(targetId);
      if (ti === -1) { setDragId(null); setDragType(null); return; }
      insertAt = zone === 'before' ? ti : ti + 1;
    }
    const list = sibs[newParentKey] || (sibs[newParentKey] = []);
    list.splice(insertAt, 0, id);
    const flat = [];
    const walk = (key) => (sibs[key] || []).forEach(cid => {
      flat.push({ id: cid, parent: key === 'root' ? null : key });
      walk(cid);
    });
    walk('root');
    setDragId(null);
    setDragType(null);
    persistOrder(flat);
  };

  const handleCatDragStart = (e, cat) => {
    if (e.target.closest('button, input, select, textarea')) return;
    setDragId(String(cat._id));
    setDragType('category');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(cat._id)); } catch (err) {}
    }
  };

  const handleCatDragOver = (e, cat) => {
    if (dragType !== 'category' || !dragId) return;
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY;
    let zone;
    if (y < r.top + r.height * 0.3) zone = 'before';
    else if (y > r.bottom - r.height * 0.3) zone = 'after';
    else zone = 'inside';
    const id = String(cat._id);
    if (zone === 'inside' && (id === dragId || isDescendantOf(id, dragId))) return;
    if (zone !== 'inside' && (id === dragId || isDescendantOf(id, dragId))) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setDropZone({ id, zone });
  };

  const handleCatDragLeave = (e, cat) => {
    if (!e.currentTarget.contains(e.relatedTarget) && dropZone && dropZone.id === String(cat._id)) setDropZone(null);
  };

  const handleCatDrop = (e, cat) => {
    if (dragType === 'product') {
      e.preventDefault();
      e.stopPropagation();
      moveProductToCategory(dragId, String(cat._id));
      setDragId(null);
      setDragType(null);
      setProductDropCat(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    applyDrop(String(cat._id), dropZone ? dropZone.zone : 'inside');
  };

  const handleRootDragOver = (e) => {
    if (!dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setDropZone(null);
    setProductDropCat(null);
  };

  const handleRootDrop = (e) => {
    if (dragType === 'product') {
      e.preventDefault();
      moveProductToCategory(dragId, null);
      setDragId(null);
      setDragType(null);
      setProductDropCat(null);
      return;
    }
    e.preventDefault();
    applyDrop(null, 'inside');
  };

  // ─── Product Drag & Drop ───
  const handleProductDragStart = (e, product) => {
    if (e.target.closest('button')) return;
    setDragId(String(product._id));
    setDragType('product');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(product._id)); } catch (err) {}
    }
  };

  const handleProductDragOver = (e, catId) => {
    if (dragType !== 'product') return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setProductDropCat(catId);
  };

  const handleProductDragLeave = (e) => {
    if (dragType !== 'product') return;
    if (!e.currentTarget.contains(e.relatedTarget)) setProductDropCat(null);
  };

  const handleCatRowDragOver = (e, cat) => {
    if (dragType === 'product') {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      setProductDropCat(String(cat._id));
    } else if (dragType === 'category') {
      handleCatDragOver(e, cat);
    }
  };

  const renderProducts = (cat) => {
    const list = productsByCat[String(cat._id)] || [];
    if (list.length === 0) {
      return <div style={{ padding: '0.5rem 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>No products in this category.</div>;
    }
    return (
      <div style={{ borderLeft: '3px solid #7c3aed', margin: '0 0 0.4rem', background: '#faf9ff' }}>
        <table className="table" style={{ margin: 0, fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th>Product</th><th>SKU</th><th className="text-right">Stock</th><th className="text-right">Sell Price</th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => (
              <tr key={p._id} draggable onDragStart={e => handleProductDragStart(e, p)} onDragEnd={() => { setDragId(null); setDragType(null); setProductDropCat(null); }} style={{ cursor: 'grab' }}>
                <td style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }} title="Drag to another category">⠿</td>
                <td>{p.name}</td>
                <td>{p.sku}</td>
                <td className="text-right">{Number(p.stock || 0).toLocaleString('en-IN')} {p.unit}</td>
                <td className="text-right">{fmtNPR(p.sellingPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderNode = (cat, depth) => {
    const id = String(cat._id);
    const children = childMap[id] || [];
    const directProducts = productsByCat[id] || [];
    const isOpen = !!expanded[id];
    const hasChildren = children.length > 0;
    const isDragging = dragType === 'category' && dragId === id;
    const isTarget = dropZone && dropZone.id === id;
    const isProductTarget = productDropCat === id;
    const zone = isTarget ? dropZone.zone : null;

    const rowStyle = {
      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem',
      paddingLeft: depth * 28 + 12, cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
      background: isOpen ? '#f8fafc' : 'transparent',
      opacity: isDragging ? 0.4 : 1,
      transition: 'background 0.15s, box-shadow 0.15s',
    };
    if (isProductTarget) {
      rowStyle.outline = '2px dashed #7c3aed';
      rowStyle.outlineOffset = '-2px';
      rowStyle.background = '#f5f3ff';
    } else if (zone === 'inside') {
      rowStyle.outline = '2px solid #7c3aed';
      rowStyle.outlineOffset = '-2px';
      rowStyle.background = '#f5f3ff';
    } else if (zone === 'before') {
      rowStyle.boxShadow = 'inset 0 2px 0 #7c3aed';
    } else if (zone === 'after') {
      rowStyle.boxShadow = 'inset 0 -2px 0 #7c3aed';
    }

    return (
      <div key={id}>
        <div
          style={rowStyle}
          draggable={dragType !== 'product'}
          onDragStart={e => handleCatDragStart(e, cat)}
          onDragOver={e => handleCatRowDragOver(e, cat)}
          onDragLeave={e => {
            if (dragType === 'product') {
              if (!e.currentTarget.contains(e.relatedTarget)) setProductDropCat(null);
            } else {
              handleCatDragLeave(e, cat);
            }
          }}
          onDrop={e => handleCatDrop(e, cat)}
          onDragEnd={() => { setDragId(null); setDragType(null); setDropZone(null); setProductDropCat(null); }}
          onClick={() => toggle(cat)}
        >
          <span style={{ width: 18, textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', flexShrink: 0, cursor: 'grab' }} title="Drag to reorder or change parent">⠿</span>
          <span style={{ width: 16, textAlign: 'center', color: '#64748b', fontSize: '0.85rem', flexShrink: 0 }}>
            {hasChildren ? (isOpen ? '▾' : '▸') : '•'}
          </span>
          <span style={{ fontWeight: depth === 0 ? 700 : 600, flex: 1 }}>
            {cat.name}
            {depth === 0 && <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: 6, fontWeight: 400 }}>MAIN</span>}
            {depth > 0 && <span style={{ fontSize: '0.65rem', color: '#a78bfa', marginLeft: 6, fontWeight: 400 }}>SUB</span>}
          </span>
          <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>{directProducts.length} item{directProducts.length === 1 ? '' : 's'}</span>
          <span className="action-cell" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '0.25rem' }}>
            {depth > 0 && (
              <button className="btn btn-sm" title="Promote to top-level (main) category" onClick={() => makeMain(cat)}>⇱ Main</button>
            )}
            {depth === 0 && (
              <button className="btn btn-sm" title="Convert to sub-category" onClick={() => { setMakeSubModal(cat); setMakeSubParent(''); }}>⇲ Sub</button>
            )}
            <button className="btn btn-sm" onClick={() => addSub(cat)} title="Add sub-category">+ Sub</button>
            <button className="btn btn-sm" onClick={() => edit(cat)}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => remove(cat)}>Delete</button>
          </span>
        </div>
        {isOpen && (
          <div>
            {hasChildren && children.map(ch => renderNode(ch, depth + 1))}
            {directProducts.length > 0 && hasChildren && (
              <div style={{ paddingLeft: depth * 28 + 12 }}>
                <div style={{ padding: '0.35rem 0 0.2rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>Direct Products</div>
                {renderProducts(cat)}
              </div>
            )}
            {!hasChildren && renderProducts(cat)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1>Categories</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <p style={{ margin: 0, flex: 1 }}>Drag categories to reorder. Drag products into any category or sub-category. Use ⇲ Sub / ⇱ Main to convert between levels.</p>
          <button className="btn btn-secondary" onClick={() => {
            const rows = ordered.map(({ cat, depth }) => ({
              Category: '\u00A0'.repeat(depth * 4) + (depth > 0 ? '↳ ' : '') + cat.name,
              Type: depth === 0 ? 'Main' : 'Sub',
              Products: String((productsByCat[String(cat._id)] || []).length),
            }));
            if (rows.length === 0) return;
            printEntry({ title: 'Categories List', columns: Object.keys(rows[0]).map(k => ({ key: k, label: k })), rows, footer: [{ label: 'Total Categories', value: String(rows.length) }] });
          }}>Print</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card form-card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input className="search-input" placeholder="Category name" value={name} onChange={e => setName(e.target.value)} required style={{ flex: 1, minWidth: 180 }} />
          <select value={parent} onChange={e => setParent(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
            <option value="">No parent (Top-level)</option>
            {ordered.map(({ cat, depth }) =>
              blockedParentIds.has(String(cat._id)) ? null : (
                <option key={cat._id} value={String(cat._id)}>{'\u00A0'.repeat(depth * 4)}{depth > 0 ? '↳ ' : ''}{cat.name}</option>
              )
            )}
          </select>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Add'}</button>
          {editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setName(''); setParent(''); }}>Cancel</button>}
        </div>
      </form>

      {/* Unassigned products — draggable */}
      {unassignedProducts.length > 0 && (
        <div className="card" style={{ marginTop: '1rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ padding: '0.6rem 0.75rem', background: '#fffbeb', borderBottom: '1px solid #fde68a', fontWeight: 700, fontSize: '0.88rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📦</span> Uncategorized Products ({unassignedProducts.length})
            <span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#b45309' }}>— drag into a category below</span>
          </div>
          <div style={{ padding: '0.4rem 0.75rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {unassignedProducts.map(p => (
                <div
                  key={p._id}
                  draggable
                  onDragStart={e => handleProductDragStart(e, p)}
                  onDragEnd={() => { setDragId(null); setDragType(null); setProductDropCat(null); }}
                  style={{
                    padding: '0.35rem 0.65rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6,
                    fontSize: '0.8rem', cursor: 'grab', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(124,58,237,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>⠿</span>
                  <span>{p.name}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{p.sku}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '1rem' }}>
        {categories.length === 0 ? (
          <div className="text-center" style={{ padding: '2rem', color: '#94a3b8' }}>No categories yet. Add one above.</div>
        ) : (
          ordered.map(({ cat, depth }) => (depth === 0 ? renderNode(cat, depth) : null))
        )}
        {dragId && dragType === 'category' && categories.length > 0 && (
          <div
            onDragOver={handleRootDragOver}
            onDrop={handleRootDrop}
            onDragLeave={() => { setDropZone(null); setProductDropCat(null); }}
            style={{
              margin: '0.75rem 1rem', padding: '0.6rem', textAlign: 'center', borderRadius: 8,
              border: '2px dashed #cbd5e1', color: '#64748b', fontSize: '0.85rem',
              background: '#f8fafc',
            }}
          >
            Drop here to make it a Top-level (Main) category
          </div>
        )}
        {dragId && dragType === 'product' && (
          <div
            onDragOver={handleRootDragOver}
            onDrop={handleRootDrop}
            onDragLeave={() => setProductDropCat(null)}
            style={{
              margin: '0.75rem 1rem', padding: '0.6rem', textAlign: 'center', borderRadius: 8,
              border: '2px dashed #7c3aed', color: '#7c3aed', fontSize: '0.85rem',
              background: '#faf5ff',
            }}
          >
            Drop here to remove product from category (uncategorize)
          </div>
        )}
      </div>

      {/* Make Sub Modal */}
      {makeSubModal && (
        <div className="modal-overlay" onClick={() => setMakeSubModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Convert "{makeSubModal.name}" to Sub-category</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setMakeSubModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Select parent (main) category</label>
                <select value={makeSubParent} onChange={e => setMakeSubParent(e.target.value)} style={{ width: '100%' }}>
                  <option value="">-- Choose parent --</option>
                  {categories.filter(c => String(c._id) !== String(makeSubModal._id) && !isDescendantOf(String(c._id), String(makeSubModal._id))).map(c => (
                    <option key={c._id} value={String(c._id)}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setMakeSubModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!makeSubParent} onClick={makeSub}>Convert to Sub</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Confirm Delete"
        message={confirmDelete?.message}
        onConfirm={async () => {
          if (confirmDelete) {
            try {
              await api.delete(`/categories/${confirmDelete.id}`);
              addToast('Category deleted', 'success');
              await load();
            } catch (err) {
              addToast(err.response?.data?.message || 'Failed to delete category', 'error');
            }
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
