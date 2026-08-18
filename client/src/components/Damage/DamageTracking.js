import React, { useState, useEffect } from 'react';
import { useToast } from '../UI/Toast';
import SearchableSelect from '../UI/SearchableSelect';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import api from '../../api';
import { printEntry } from '../UI/printEntry';

export default function DamageTracking() {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [form, setForm] = useState({ date: adToBsStr(new Date()), product: '', quantity: 1, type: 'damage', costPrice: 0, description: '' });
  const addToast = useToast();

  useEffect(() => { load(); api.get('/products').then(r => setProducts(r.data)); }, []);

  const load = () => {
    api.get('/damage').then(r => setItems(r.data.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))));
    api.get('/damage/summary').then(r => setSummary(r.data)).catch(() => {});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const selected = products.find(p => p._id === form.product);
      await api.post('/damage', { ...form, date: bsToADStr(form.date), costPrice: form.costPrice || selected?.costPrice || 0 });
      setForm({ date: adToBsStr(new Date()), product: '', quantity: 1, type: 'damage', costPrice: 0, description: '' });
      setShowForm(false);
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Error', 'error'); }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <h1>Damage & Waste Tracking</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => {
            const rows = items.map(d => ({ Date: adToBsStr(d.date), Product: d.product?.name || '-', Type: d.type, Qty: String(d.quantity), Loss: formatNPR(d.totalLoss), Description: d.description || '-' }));
            if (rows.length === 0) return;
            printEntry({ title: 'Damage & Waste Tracking', columns: Object.keys(rows[0]).map(k => ({ key: k, label: k })), rows, footer: [{ label: 'Total Items', value: String(rows.length) }, { label: 'Total Loss', value: formatNPR(items.reduce((s, d) => s + (d.totalLoss || 0), 0)) }] });
          }}>Print</button>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'Record Damage'}</button>
        </div>
      </div>

      {summary && (
        <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
            <div className="card-label">Total Items (This Month)</div>
            <div className="card-value">{summary.totalItems}</div>
          </div>
          <div className="card" style={{ borderLeft: '4px solid #f97316' }}>
            <div className="card-label">Total Loss (This Month)</div>
            <div className="card-value">{formatNPR(summary.totalLoss)}</div>
          </div>
          <div className="card" style={{ borderLeft: '4px solid #64748b' }}>
            <div className="card-label">Incidents</div>
            <div className="card-value">{summary.count}</div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Record Damage/Waste</h3>
              <button className="modal-close-x" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group"><label>Date</label><NepaliDatePicker value={form.date} onChange={v => setForm({ ...form, date: v })} /></div>
                  <div className="form-group"><label>Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="damage">Damage</option><option value="expired">Expired</option><option value="theft">Theft</option><option value="other">Other</option>
                  </select></div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Product</label><SearchableSelect
                    options={products.map(p => ({ value: p._id, label: `${p.name} (Stock: ${p.stock})` }))}
                    value={form.product}
                    onChange={v => {
                      const p = products.find(pr => pr._id === v);
                      setForm({ ...form, product: v, costPrice: p?.costPrice || 0 });
                    }}
                    required
                    placeholder="Search product..."
                  /></div>
                  <div className="form-group"><label>Quantity</label><input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })} /></div>
                  <div className="form-group"><label>Unit Cost (Rs.)</label><input type="number" step="0.01" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: parseFloat(e.target.value) || 0 })} /></div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                </div>
                <div style={{ fontWeight: 700, color: '#dc2626', marginTop: '0.5rem' }}>
                  Estimated Loss: {formatNPR(form.quantity * form.costPrice)}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Record</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Loss</th><th>Description</th></tr></thead>
          <tbody>
            {items.map(d => (
              <tr key={d._id} onClick={() => setDetailsId(d._id)} style={{ cursor: 'pointer' }}>
                <td>{adToBsStr(d.date)}</td>
                <td>{d.product?.name || '-'}</td>
                <td><span className="badge badge-danger">{d.type}</span></td>
                <td className="text-danger"><strong>{d.quantity}</strong></td>
                <td>{formatNPR(d.totalLoss)}</td>
                <td>{d.description || '-'}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="6" className="text-center">No damage records</td></tr>}
          </tbody>
        </table>
      </div>
      {detailsId && (() => {
        const d = items.find(x => x._id === detailsId);
        if (!d) return null;
        return (
          <EntryDetailsModal
            title="Damage / Waste Record"
            subtitle={d.product?.name || 'Unknown product'}
            meta={[
              { label: 'Date', value: adToBsStr(d.date) },
              { label: 'Product', value: d.product?.name || '-' },
              { label: 'Type', value: d.type },
              { label: 'Quantity', value: d.quantity },
              { label: 'Unit Cost', value: formatNPR(d.costPrice) },
              { label: 'Total Loss', value: formatNPR(d.totalLoss) },
            ]}
            columns={[{ key: 'description', label: 'Description', wide: true }]}
            rows={[{ description: d.description || 'No description' }]}
            onClose={() => setDetailsId(null)}
          />
        );
      })()}
    </div>
  );
}
