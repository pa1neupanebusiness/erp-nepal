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
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountMode, setDiscountMode] = useState('amount');
  const [applyVat, setApplyVat] = useState(false);
  const [inclusiveVat, setInclusiveVat] = useState(false);
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
      const hasInclusiveItems = (s.items || []).some(i => i.priceIncludesTax || i.product?.priceIncludesTax);
      const hasTax = (s.taxTotal || 0) > 0;
      setRows(s.items?.map(i => ({
        product: i.product?._id || i.product,
        name: i.product?.name || '',
        sku: i.product?.sku || '',
        qty: i.quantity,
        rate: i.price,
        taxRate: hasTax ? (i.taxRate || 13) : 0,
        priceIncludesTax: hasInclusiveItems,
        vatEnabled: hasTax,
      })) || [emptyRow()]);
      setDiscountValue(s.discount || 0);
      setApplyVat(hasTax);
      setInclusiveVat(hasInclusiveItems);
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
        copy[i] = {
          ...copy[i],
          product: p._id, name: p.name, sku: p.sku,
          rate: p.sellingPrice || 0,
          taxRate: (applyVat || inclusiveVat) ? (p.taxRate || 13) : 0,
          vatEnabled: (applyVat || inclusiveVat) && (p.vatEnabled !== false),
          priceIncludesTax: inclusiveVat || p.priceIncludesTax || false,
        };
        return copy;
      });
    } else {
      updateRow(i, 'product', productId);
    }
  };

  const lineAmount = (r) => (Number(r.rate) || 0) * (Number(r.qty) || 0);
  const lineRate = (r) => {
    const raw = Number(r.rate) || 0;
    if (inclusiveVat) {
      const taxRate = r.taxRate || 13;
      return Math.round((raw / (1 + taxRate / 100)) * 100) / 100;
    }
    return raw;
  };
  const lineBase = (r) => Math.round(lineRate(r) * (Number(r.qty) || 0) * 100) / 100;

  const totalBeforeDiscount = rows.reduce((s, r) => s + lineBase(r), 0);
  const vatRate = rows[0]?.taxRate || 13;
  let discount = Math.round((parseFloat(discountValue) || 0) * 100) / 100;
  const discountRatio = totalBeforeDiscount > 0 ? discount / totalBeforeDiscount : 0;
  const netAmount = Math.max(0, totalBeforeDiscount - discount);
  const vatTotal = (applyVat || inclusiveVat) ? Math.round((netAmount * vatRate / 100) * 100) / 100 : 0;
  const grandTotal = Math.round((netAmount + vatTotal) * 100) / 100;

  const handleApplyVatChange = (checked) => {
    setApplyVat(checked);
    if (checked) {
      setInclusiveVat(false);
      setRows(prev => prev.map(r => ({ ...r, taxRate: r.taxRate || 13, vatEnabled: true, priceIncludesTax: false })));
    } else {
      setRows(prev => prev.map(r => ({ ...r, taxRate: 0, vatEnabled: false, priceIncludesTax: false })));
    }
  };

  const handleInclusiveVatChange = (checked) => {
    setInclusiveVat(checked);
    if (checked) {
      setApplyVat(false);
      setRows(prev => prev.map(r => ({ ...r, taxRate: r.taxRate || 13, vatEnabled: true, priceIncludesTax: true })));
    } else {
      setRows(prev => prev.map(r => ({ ...r, priceIncludesTax: false })));
    }
  };

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
      const items = rows.filter(r => r.product).map(r => ({
        product: r.product, quantity: Number(r.qty), price: Number(r.rate),
        subtotal: Math.round(lineBase(r) * 100) / 100,
        tax: r.vatEnabled ? Math.round(lineBase(r) * (r.taxRate || 13) / 100 * 100) / 100 : 0,
        taxRate: r.taxRate || 0, priceIncludesTax: r.priceIncludesTax || inclusiveVat,
      }));
      const payload = {
        items, subtotal: Math.round(totalBeforeDiscount * 100) / 100,
        taxTotal: Math.round(vatTotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        grandTotal: Math.round(grandTotal * 100) / 100,
        amountPaid: Number(amountPaid) || 0, paymentMethod,
        customer: customer || null,
        date: bsToADStr(invoiceDate), notes,
        inclusiveVat: !!inclusiveVat,
      };
      await api.put(`/sales/${id}`, payload);
      addToast('Sale updated successfully', 'success');
      navigate('/sales');
    } catch (err) { addToast(err.response?.data?.message || 'Update failed', 'error'); }
    setSaving(false);
  };

  const formatMoney = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

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
            <SearchableSelect options={[{ value: '', label: 'Cash' }, ...customers.map(c => ({ value: c._id, label: `${c.name}${c.phone ? ' (' + c.phone + ')' : ''}` }))]} value={customer} onChange={setCustomer} placeholder="Search customer..." />
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
                <td><input type="number" step="0.01" value={inclusiveVat ? lineRate(r) : r.rate} onChange={e => updateRow(i, 'rate', inclusiveVat ? (Math.round((parseFloat(e.target.value) || 0) * (1 + (r.taxRate || 13) / 100) * 100) / 100) : e.target.value)} style={{ width: 120 }} required /></td>
                <td className="text-right">{lineBase(r).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>{rows.length > 1 && <button type="button" className="btn btn-sm btn-danger" onClick={() => removeRow(i)}>X</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-sm btn-secondary" onClick={addRow}>+ Add Item</button>

        <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Items Total:</span><strong>{formatMoney(totalBeforeDiscount)}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: 4 }}>
              <span>Discount:
                {discount > 0 && (
                  <span style={{ marginLeft: 6, fontSize: '0.72rem', fontWeight: 600, color: '#16a34a' }}>
                    {discountMode === 'percent' ? `= ${formatMoney(discount)}` : `= ${discountPercent}%`}
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 600 }}>
                <button type="button" onClick={() => setDiscountMode('percent')} style={{ padding: '0.125rem 0.5rem', background: discountMode === 'percent' ? '#fff' : 'transparent', color: discountMode === 'percent' ? '#0f172a' : '#64748b', border: 'none', borderRadius: 4, cursor: 'pointer' }}>%</button>
                <button type="button" onClick={() => setDiscountMode('amount')} style={{ padding: '0.125rem 0.5rem', background: discountMode === 'amount' ? '#fff' : 'transparent', color: discountMode === 'amount' ? '#0f172a' : '#64748b', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Rs</button>
              </div>
              <input type="number" step="0.01" min="0" value={discountMode === 'amount' ? discountValue : discountPercent} onChange={e => { const v = e.target.value; if (discountMode === 'amount') { setDiscountValue(v); setDiscountPercent(totalBeforeDiscount ? ((parseFloat(v) || 0) / totalBeforeDiscount * 100).toFixed(2) : ''); } else { setDiscountPercent(v); setDiscountValue(((parseFloat(v) || 0) / 100 * totalBeforeDiscount).toFixed(2)); } }} style={{ width: 100, padding: '0.25rem 0.5rem', textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: 4, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={applyVat} onChange={e => handleApplyVatChange(e.target.checked)} />
                Add VAT (exclusive)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={inclusiveVat} onChange={e => handleInclusiveVatChange(e.target.checked)} />
                Inclusive VAT
              </label>
            </div>
            {vatTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>VAT {inclusiveVat ? '(included)' : ''}:</span><strong>{formatMoney(vatTotal)}</strong></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #333', paddingTop: 4 }}><span style={{ fontWeight: 700 }}>Grand Total:</span><strong style={{ fontSize: '1.1rem' }}>{formatMoney(grandTotal)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span>Paid:</span><strong>{formatMoney(Number(amountPaid) || 0)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 700 }}>Due:</span><strong style={{ color: grandTotal - (Number(amountPaid) || 0) > 0 ? '#dc2626' : '#16a34a' }}>{formatMoney(Math.max(0, grandTotal - (Number(amountPaid) || 0)))}</strong></div>
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
