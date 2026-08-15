import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api';
import { useToast } from '../UI/Toast';
import SearchableSelect from '../UI/SearchableSelect';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

const emptyRow = () => ({ product: '', name: '', sku: '', qty: 1, rate: '', taxRate: 0, priceIncludesTax: false, vatEnabled: false });

export default function SalesEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const addToast = useToast();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customer, setCustomer] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [rows, setRows] = useState([emptyRow()]);
  const [discountValue, setDiscountValue] = useState(0);
  const [applyVat, setApplyVat] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/sales/${id}`),
      api.get('/products'),
      api.get('/customers'),
    ]).then(([saleRes, prodRes, custRes]) => {
      const s = saleRes.data;
      setSale(s);
      setCustomer(s.customer?._id || '');
      setInvoiceDate(s.invoiceDate ? adToBsStr(s.invoiceDate) : adToBsStr(new Date(s.createdAt)));
      setRows(s.items?.map(i => ({
        product: i.product?._id || i.product,
        name: i.product?.name || '',
        sku: i.product?.sku || '',
        qty: i.quantity,
        rate: i.price,
        taxRate: i.tax > 0 ? 13 : 0,
        priceIncludesTax: false,
        vatEnabled: i.tax > 0,
      })) || [emptyRow()]);
      setDiscountValue(s.discount || 0);
      setApplyVat((s.taxTotal || 0) > 0);
      setPaymentMethod(s.paymentMethod || 'cash');
      setAmountPaid(String(s.amountPaid || ''));
      setNotes(s.notes || '');
      setProducts(prodRes.data || []);
      setCustomers(custRes.data || []);
      setLoading(false);
    }).catch(() => { addToast('Failed to load sale', 'error'); navigate('/sales'); });
  }, [id]);

  const updateRow = (i, field, val) => {
    setRows(prev => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [field]: val };
      return copy;
    });
  };

  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const selectProduct = (i, productId) => {
    const p = products.find(pr => pr._id === productId);
    if (p) {
      setRows(prev => {
        const copy = [...prev];
        copy[i] = { ...copy[i], product: p._id, name: p.name, sku: p.sku, rate: p.sellingPrice || 0, taxRate: p.taxRate || 0, vatEnabled: p.vatEnabled || false, priceIncludesTax: p.priceIncludesTax || false };
        return copy;
      });
    } else {
      updateRow(i, 'product', productId);
    }
  };

  const subtotal = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);
  const vatTotal = applyVat ? rows.reduce((s, r) => {
    if (r.vatEnabled) { const base = r.priceIncludesTax ? (Number(r.qty) * Number(r.rate)) / (1 + r.taxRate / 100) : Number(r.qty) * Number(r.rate); return s + base * (r.taxRate / 100); }
    return s;
  }, 0) : 0;
  const grandTotal = subtotal - (Number(discountValue) || 0) + vatTotal;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rows.length === 0 || rows.every(r => !r.product)) return addToast('Add at least one product', 'error');
    const totalPaid = Number(amountPaid) || 0;
    const dueAmt = Math.max(0, grandTotal - totalPaid);
    if (!customer && dueAmt > 0) {
      addToast('A customer name is required when there is a due amount. Please select or add a customer.', 'error');
      return;
    }
    setSaving(true);
    try {
      const items = rows.filter(r => r.product).map(r => ({ product: r.product, quantity: Number(r.qty), price: Number(r.rate), subtotal: Number(r.qty) * Number(r.rate) }));
      const payload = {
        items, subtotal, taxTotal: vatTotal, discount: Number(discountValue) || 0, grandTotal,
        amountPaid: Number(amountPaid) || 0, paymentMethod, customer: customer || null,
        date: bsToADStr(invoiceDate), notes,
      };
      await api.put(`/sales/${id}`, payload);
      addToast('Sale updated successfully', 'success');
      navigate('/sales');
    } catch (err) { addToast(err.response?.data?.message || 'Update failed', 'error'); }
    setSaving(false);
  };

  if (loading) return <div className="page-container"><p>Loading sale...</p></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Edit Sale - {sale?.invoiceNumber}</h1>
      </div>
      <form onSubmit={handleSubmit} className="card form-card">
        <div className="form-grid">
          <div className="form-group">
            <label>Customer</label>
            <SearchableSelect options={[{ value: '', label: 'Walk-in' }, ...customers.map(c => ({ value: c._id, label: `${c.name}${c.phone ? ' (' + c.phone + ')' : ''}` }))]} value={customer} onChange={setCustomer} placeholder="Search customer..." />
          </div>
          <div className="form-group">
            <label>Date</label>
            <NepaliDatePicker value={invoiceDate} onChange={setInvoiceDate} />
          </div>
        </div>

        <table className="table" style={{ marginTop: '1rem' }}>
          <thead>
            <tr><th>Product</th><th>Qty</th><th>Rate</th><th className="text-right">Amount</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><SearchableSelect options={products.map(p => ({ value: p._id, label: `${p.name} (${p.sku || 'N/A'}) - Stock: ${p.stock || 0}` }))} value={r.product} onChange={v => selectProduct(i, v)} placeholder="Search product..." /></td>
                <td><input type="number" min="1" value={r.qty} onChange={e => updateRow(i, 'qty', e.target.value)} style={{ width: 80 }} required /></td>
                <td><input type="number" step="0.01" value={r.rate} onChange={e => updateRow(i, 'rate', e.target.value)} style={{ width: 120 }} required /></td>
                <td className="text-right">{((Number(r.qty) || 0) * (Number(r.rate) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>{rows.length > 1 && <button type="button" className="btn btn-sm btn-danger" onClick={() => removeRow(i)}>X</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-sm btn-secondary" onClick={addRow}>+ Add Item</button>

        <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Subtotal:</span><strong>Rs. {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span>Discount:</span><input type="number" step="0.01" min="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={{ width: 100 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <label><input type="checkbox" checked={applyVat} onChange={e => setApplyVat(e.target.checked)} /> VAT 13%</label>
            </div>
            {applyVat && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>VAT:</span><strong>Rs. {vatTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #333', paddingTop: 4 }}><span style={{ fontWeight: 700 }}>Grand Total:</span><strong>Rs. {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <div className="form-group">
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="qr">QR/Bank</option>
              <option value="credit">Credit</option>
              <option value="split">Split</option>
            </select>
          </div>
          <div className="form-group">
            <label>Amount Paid</label>
            <input type="number" step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Update Sale'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/sales')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
