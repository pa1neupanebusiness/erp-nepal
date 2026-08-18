import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useToast } from '../UI/Toast';
import SearchableSelect from '../UI/SearchableSelect';
import { formatNPR as printNPR } from '../UI/printEntry';
import { printPurchaseVoucher } from '../UI/printPurchase';
import api from '../../api';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import { sortByDate } from '../../utils/timeService';

export default function Purchases() {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ date: adToBsStr(new Date()), type: 'direct', supplier: '', items: [{ product: '', quantity: 1, costPrice: 0, sellingPrice: 0, batch: '', subtotal: 0 }], discount: 0, vatPercent: 0, applyVat: false, inclusiveVat: false, applyTds: false, paidAmount: 0, paymentMethod: 'cash', bank: '', chequeNumber: '', paymentRemarks: '', note: '' });
  const [detail, setDetail] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [returnModal, setReturnModal] = useState(null);
  const [returnForm, setReturnForm] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', bank: '', chequeNumber: '', remarks: '' });
  const [supplierPay, setSupplierPay] = useState({ supplier: '', outstanding: null, loading: false });
  const [supplierPayForm, setSupplierPayForm] = useState({ amount: '', method: 'cash', bank: '', chequeNumber: '', remarks: '', splits: [] });
  const [paying, setPaying] = useState(false);
  const [supplierFyTotal, setSupplierFyTotal] = useState(0);
  const [banks, setBanks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [supplierModal, setSupplierModal] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [productModalRow, setProductModalRow] = useState(null);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', email: '', address: '', pan: '' });
  const [newProduct, setNewProduct] = useState({ name: '', sku: '', category: '', costPrice: '', sellingPrice: '', stock: '', minStock: 5, unit: 'pcs', taxRate: 13, vatEnabled: false, priceIncludesTax: false });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addExtraCharge, setAddExtraCharge] = useState(false);
  const [extraChargeRemarks, setExtraChargeRemarks] = useState('');
  const [extraChargeAmount, setExtraChargeAmount] = useState('');

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = user.role === 'super_admin';
  const addToast = useToast();
  const location = useLocation();
  const [supplierDue, setSupplierDue] = useState(null);

  const loadSupplierFyTotal = (supplierId) => {
    if (!supplierId) { setSupplierFyTotal(0); return; }
    api.get(`/suppliers/${supplierId}/fy-total`).then(r => setSupplierFyTotal(r.data?.total || 0)).catch(() => setSupplierFyTotal(0));
  };

  const loadSupplierDue = async (supplierId) => {
    if (!supplierId) { setSupplierDue(null); return; }
    try {
      const { data } = await api.get(`/suppliers/${supplierId}/outstanding`);
      setSupplierDue(data.totalDue || 0);
    } catch { setSupplierDue(null); }
  };

  useEffect(() => {
    load(); api.get('/products').then(r => setProducts(r.data.filter(p => p.isActive))); api.get('/suppliers').then(r => setSuppliers(r.data)); api.get('/categories').then(r => setCategories(r.data)); api.get('/banks').then(r => setBanks(r.data)).catch(() => {});
    const params = new URLSearchParams(location.search);
    if (params.get('new') === '1') { resetForm(); setShowForm(true); }
  }, [location.search]);

  const load = () => api.get('/purchases').then(r => setItems(sortByDate(r.data)));

  const resetForm = () => {
    setForm({ date: adToBsStr(new Date()), type: 'direct', supplier: '', items: [{ product: '', quantity: 1, costPrice: 0, sellingPrice: 0, batch: '', subtotal: 0 }], discount: 0, vatPercent: 0, applyVat: false, inclusiveVat: false, applyTds: false, paidAmount: 0, paymentMethod: 'cash', bank: '', chequeNumber: '', paymentRemarks: '', supplierInvoiceNo: '', note: '' });
    setSupplierFyTotal(0);
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (purchase) => {
    setEditing(purchase);
    setForm({
      date: adToBsStr(new Date(purchase.date)),
      type: purchase.type,
      supplier: purchase.supplier?._id || '',
      items: purchase.items.map(i => ({
        product: i.product?._id || '',
        quantity: i.quantity,
        costPrice: i.costPrice,
        sellingPrice: i.sellingPrice || 0,
        batch: i.batch || '',
        subtotal: i.subtotal,
      })),
      discount: purchase.discount || 0,
      vatPercent: purchase.vatPercent || 0,
      inclusiveVat: purchase.inclusiveVat || false,
      applyVat: !purchase.inclusiveVat && (purchase.vatPercent || 0) > 0,
      applyTds: (purchase.tds || 0) > 0,
      paidAmount: purchase.paidAmount || 0,
      paymentMethod: purchase.paymentMethod || 'cash',
      bank: purchase.bank?._id || purchase.bank || '',
      chequeNumber: purchase.chequeNumber || '',
      paymentRemarks: purchase.paymentRemarks || '',
      paymentSplits: purchase.paymentSplits || [],
      splits: purchase.paymentSplits || [],
      supplierInvoiceNo: purchase.supplierInvoiceNo || '',
      note: purchase.note || '',
    });
    setShowForm(true);
    loadSupplierFyTotal(purchase.supplier?._id || '');
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { product: '', quantity: 1, costPrice: 0, sellingPrice: 0, batch: '', subtotal: 0 }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const updateItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx][field] = field === 'product' ? value : parseFloat(value) || 0;
    if (field === 'product') {
      const p = products.find(pr => pr._id === value);
      if (p) { items[idx].costPrice = p.costPrice; items[idx].sellingPrice = p.sellingPrice; }
    }
    items[idx].subtotal = items[idx].quantity * items[idx].costPrice;
    setForm({ ...form, items });
  };

  const saveSupplierInline = async (e) => {
    e.preventDefault();
    if (!newSupplier.name.trim()) { addToast('Supplier name is required', 'error'); return; }
    setSavingSupplier(true);
    try {
      const { data } = await api.post('/suppliers', { ...newSupplier, name: newSupplier.name.trim() });
      setSuppliers(prev => [...prev, data]);
      setForm(f => ({ ...f, supplier: data._id }));
      loadSupplierFyTotal(data._id);
      setSupplierModal(false);
      setNewSupplier({ name: '', phone: '', email: '', address: '', pan: '' });
      addToast('Supplier added', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to add supplier', 'error');
    }
    setSavingSupplier(false);
  };

  const addNewProductToRow = (rowIdx, data) => {
    const items = [...form.items];
    items[rowIdx].product = data._id;
    items[rowIdx].costPrice = data.costPrice || 0;
    items[rowIdx].sellingPrice = data.sellingPrice || 0;
    items[rowIdx].subtotal = (items[rowIdx].quantity || 1) * (data.costPrice || 0);
    setForm({ ...form, items });
    setProducts(prev => prev.some(p => p._id === data._id) ? prev : [...prev, data]);
  };

  const saveProductInline = async (e) => {
    e.preventDefault();
    if (!newProduct.name.trim()) { addToast('Product name is required', 'error'); return; }
    if (newProduct.category === '__new__' && !newCategoryName.trim()) { addToast('Enter a category name or choose an existing one', 'error'); return; }
    setSavingProduct(true);
    try {
      let categoryId = newProduct.category && newProduct.category !== '__new__' ? newProduct.category : undefined;
      if (newProduct.category === '__new__') {
        const { data: cat } = await api.post('/categories', { name: newCategoryName.trim() });
        setCategories(prev => prev.some(c => c._id === cat._id) ? prev : [...prev, cat]);
        categoryId = cat._id;
      }
      const { data } = await api.post('/products', {
        name: newProduct.name.trim(),
        sku: newProduct.sku.trim(),
        category: categoryId,
        costPrice: parseFloat(newProduct.costPrice) || 0,
        sellingPrice: parseFloat(newProduct.sellingPrice) || 0,
        stock: parseFloat(newProduct.stock) || 0,
        minStock: parseFloat(newProduct.minStock) || 5,
        unit: newProduct.unit || 'pcs',
        taxRate: newProduct.vatEnabled ? (parseFloat(newProduct.taxRate) || 13) : 0,
        vatEnabled: !!newProduct.vatEnabled,
        priceIncludesTax: !!newProduct.priceIncludesTax,
      });
      if (productModalRow !== null) addNewProductToRow(productModalRow, data);
      setProductModal(false);
      setNewProduct({ name: '', sku: '', category: '', costPrice: '', sellingPrice: '', stock: '', minStock: 5, unit: 'pcs', taxRate: 13, vatEnabled: false, priceIncludesTax: false });
      setNewCategoryName('');
      addToast('Product added', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to add product', 'error');
    }
    setSavingProduct(false);
  };

  const subtotal = form.items.reduce((s, i) => s + i.subtotal, 0);
  const discountedSubtotal = Math.max(0, subtotal - (form.discount || 0));
  const vatPct = form.vatPercent || 0;
  const vatEnabled = form.applyVat || form.inclusiveVat;
  const vatAmount = vatPct > 0 && vatEnabled
    ? (form.inclusiveVat ? Math.round((discountedSubtotal * vatPct / (100 + vatPct)) * 100) / 100 : Math.round((discountedSubtotal * vatPct / 100) * 100) / 100)
    : 0;
  const grandTotal = form.inclusiveVat ? discountedSubtotal : Math.max(0, discountedSubtotal + vatAmount);
  const tdsApplies = !!form.applyTds;
  const tds = tdsApplies ? Math.round((discountedSubtotal * 1.5 / 100) * 100) / 100 : 0;
  const netPayable = grandTotal - tds;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const tax = vatAmount;
    const tdsAmt = tds;
    const tdsRate = tdsApplies ? 1.5 : 0;
    try {
      if (editing) {
        await api.put(`/purchases/${editing._id}`, { ...form, date: bsToADStr(form.date), vatPercent: vatPct, inclusiveVat: form.inclusiveVat, subtotal, tax, tds: tdsAmt, tdsRate, applyTds: form.applyTds, grandTotal, paidAmount: parseFloat(form.paidAmount) || 0 });
      } else {
        await api.post('/purchases', { ...form, date: bsToADStr(form.date), vatPercent: vatPct, inclusiveVat: form.inclusiveVat, subtotal, tax, tds: tdsAmt, tdsRate, applyTds: form.applyTds, grandTotal, paidAmount: parseFloat(form.paidAmount) || 0 });
      }
      resetForm();
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save purchase', 'error');
    }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <h1>Purchase Management (Khareed)</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`btn ${showForm === false ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setShowForm(false); }}>Purchases</button>
          <button className={`btn ${showForm === true ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { resetForm(); setShowForm(true); }}>New Purchase</button>
          <button className={`btn ${showForm === 'supplierPay' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowForm('supplierPay')}>Supplier Payment</button>
        </div>
      </div>

      {showForm === 'supplierPay' && (
        <div className="card">
          <h3>Supplier Payment</h3>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group"><label>Supplier *</label>
              <SearchableSelect
                options={suppliers.map(s => ({ value: s._id, label: s.name }))}
                value={supplierPay.supplier}
                onChange={async (val) => {
                  setSupplierPay({ supplier: val, outstanding: null, loading: !!val });
                  if (val) {
                    try {
                      const res = await api.get(`/suppliers/${val}/outstanding`);
                      setSupplierPay({ supplier: val, outstanding: res.data, loading: false });
                      setSupplierPayForm({ ...supplierPayForm, amount: res.data.totalDue });
                    } catch { setSupplierPay({ supplier: val, outstanding: null, loading: false }); }
                  }
                }}
                onAdd={(q) => { setNewSupplier({ name: '', phone: '', email: '', address: '', pan: '' }); setNewSupplier(prev => ({ ...prev, name: q })); setSupplierModal(true); }}
                placeholder="Search supplier or type to add..."
              />
            </div>
            <div className="form-group">
              <label>Total Due</label>
              <div style={{ padding: '0.5rem 0', fontWeight: 700, fontSize: '1.2rem', color: supplierPay.outstanding?.totalDue > 0 ? '#dc2626' : '#16a34a' }}>
                {supplierPay.loading ? 'Loading...' : supplierPay.outstanding ? formatNPR(supplierPay.outstanding.totalDue) : '-'}
              </div>
            </div>
          </div>

          {supplierPay.outstanding?.purchases?.length > 0 && (
            <>
              <table className="table">
                <thead><tr><th>PO#</th><th>Date</th><th>Total</th><th>Paid</th><th>Due</th></tr></thead>
                <tbody>
                  {supplierPay.outstanding.purchases.map(p => (
                    <tr key={p._id}>
                      <td>{p.purchaseNumber}</td>
                      <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                      <td>{formatNPR(p.grandTotal)}</td>
                      <td>{formatNPR(p.paidAmount)}</td>
                      <td style={{ color: '#dc2626', fontWeight: 600 }}>{formatNPR(p.dueAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: '1rem' }}>
                <div className="form-group"><label>Payment Amount *</label>
                  <input type="number" value={supplierPayForm.amount} onChange={e => setSupplierPayForm({ ...supplierPayForm, amount: e.target.value })}
                    max={supplierPay.outstanding.totalDue} placeholder="Enter amount" />
                </div>
                <div className="form-group"><label>Method</label>
                  <select value={supplierPayForm.method} onChange={e => setSupplierPayForm({ ...supplierPayForm, method: e.target.value, bank: e.target.value === 'cash' ? '' : supplierPayForm.bank, splits: e.target.value === 'split' ? [{ method: 'cash', amount: 0, bank: '' }] : undefined })}>
                    <option value="cash">Cash (Nagad)</option>
                    <option value="bank">Bank (Cheque)</option>
                    <option value="split">Split (Cash + Bank)</option>
                  </select>
                </div>
                {supplierPayForm.method === 'cash' && <div className="form-group"><label>Remarks</label>
                  <input value={supplierPayForm.remarks} onChange={e => setSupplierPayForm({ ...supplierPayForm, remarks: e.target.value })} placeholder="Payment remarks" />
                </div>}
                {supplierPayForm.method === 'bank' && <div className="form-group"><label>Bank *</label>
                  <select value={supplierPayForm.bank} onChange={e => setSupplierPayForm({ ...supplierPayForm, bank: e.target.value })} required>
                    <option value="">-- Select Bank --</option>
                    {banks.map(b => <option key={b._id} value={b._id}>{b.name}{b.accountNumber ? ` (${b.accountNumber})` : ''}</option>)}
                  </select>
                </div>}
                {supplierPayForm.method === 'bank' && <div className="form-group"><label>Cheque Number *</label>
                  <input value={supplierPayForm.chequeNumber} onChange={e => setSupplierPayForm({ ...supplierPayForm, chequeNumber: e.target.value })} required placeholder="Enter cheque number" />
                </div>}
              </div>
              {supplierPayForm.method === 'split' && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem', marginTop: '0.75rem', background: '#f8fafc' }}>
                  {(supplierPayForm.splits || []).map((sp, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <select value={sp.method} onChange={e => { const next = [...(supplierPayForm.splits || [])]; next[idx] = { ...next[idx], method: e.target.value, bank: '' }; setSupplierPayForm({ ...supplierPayForm, splits: next }); }} style={{ flex: 1, width: 'auto', padding: '0.4rem', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                        <option value="cash">Cash</option>
                        <option value="bank">Bank</option>
                      </select>
                      <input type="number" value={sp.amount || ''} onChange={e => { const next = [...(supplierPayForm.splits || [])]; next[idx] = { ...next[idx], amount: parseFloat(e.target.value) || 0 }; setSupplierPayForm({ ...supplierPayForm, splits: next }); }} placeholder="Amount" style={{ flex: 1, width: 'auto', textAlign: 'right', padding: '0.4rem', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                      {sp.method === 'bank' && (
                        <select value={sp.bank} onChange={e => { const next = [...(supplierPayForm.splits || [])]; next[idx] = { ...next[idx], bank: e.target.value }; setSupplierPayForm({ ...supplierPayForm, splits: next }); }} style={{ flex: 1, width: 'auto', padding: '0.4rem', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                          <option value="">-- Bank --</option>
                          {banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                        </select>
                      )}
                      {(supplierPayForm.splits || []).length > 1 && <button className="btn btn-sm btn-danger" onClick={() => { const next = (supplierPayForm.splits || []).filter((_, i) => i !== idx); setSupplierPayForm({ ...supplierPayForm, splits: next }); }}>&times;</button>}
                    </div>
                  ))}
                  <button className="btn btn-sm btn-secondary" onClick={() => setSupplierPayForm({ ...supplierPayForm, splits: [...(supplierPayForm.splits || []), { method: 'cash', amount: 0, bank: '' }] })}>+ Add Split</button>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', fontWeight: 600, color: Math.abs((supplierPayForm.splits || []).reduce((s, sp) => s + (sp.amount || 0), 0) - parseFloat(supplierPayForm.amount || 0)) < 0.01 ? '#16a34a' : '#dc2626' }}>
                    Split Total: {formatNPR((supplierPayForm.splits || []).reduce((s, sp) => s + (sp.amount || 0), 0))} / {formatNPR(parseFloat(supplierPayForm.amount || 0))}
                  </div>
                </div>
              )}
              <button className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={paying} onClick={async () => {
                const amt = parseFloat(supplierPayForm.amount);
                if (!amt || amt <= 0) { addToast('Enter a valid amount', 'error'); return; }
                if (amt > supplierPay.outstanding.totalDue) { addToast(`Amount exceeds total due ${formatNPR(supplierPay.outstanding.totalDue)}`, 'error'); return; }
                if (supplierPayForm.method === 'bank' && !supplierPayForm.chequeNumber) { addToast('Cheque number required', 'error'); return; }
                if (supplierPayForm.method === 'bank' && !supplierPayForm.bank) { addToast('Choose a bank', 'error'); return; }
                if (supplierPayForm.method === 'split') {
                  const totalSplit = (supplierPayForm.splits || []).reduce((s, sp) => s + (sp.amount || 0), 0);
                  if (Math.abs(totalSplit - amt) > 0.01) { addToast(`Split total (${formatNPR(totalSplit)}) must equal payment amount (${formatNPR(amt)})`, 'error'); return; }
                  const hasBank = (supplierPayForm.splits || []).find(sp => sp.method === 'bank' && !sp.bank);
                  if (hasBank) { addToast('Choose a bank for bank split payments', 'error'); return; }
                }
                setPaying(true);
                try {
                  const payload = {
                    amount: amt, method: supplierPayForm.method,
                    remarks: supplierPayForm.remarks,
                  };
                  if (supplierPayForm.method === 'split') {
                    payload.splits = (supplierPayForm.splits || []).filter(sp => sp.amount > 0).map(sp => ({ method: sp.method, amount: Math.round((sp.amount || 0) * 100) / 100, bank: (sp.method === 'bank' || sp.method === 'qr') ? (sp.bank || null) : null }));
                  } else {
                    payload.bank = supplierPayForm.method === 'bank' ? supplierPayForm.bank : null;
                    payload.chequeNumber = supplierPayForm.chequeNumber;
                  }
                  await api.post(`/suppliers/${supplierPay.supplier}/pay`, payload);
                  addToast('Payment recorded', 'success');
                  const res = await api.get(`/suppliers/${supplierPay.supplier}/outstanding`);
                  setSupplierPay({ ...supplierPay, outstanding: res.data });
                  setSupplierPayForm({ amount: '', method: 'cash', bank: '', chequeNumber: '', remarks: '', splits: [] });
                  load();
                } catch (err) { addToast(err.response?.data?.message || 'Payment failed', 'error'); }
                setPaying(false);
              }}>{paying ? 'Recording...' : 'Record Payment'}</button>
            </>
          )}
          {supplierPay.outstanding?.totalDue === 0 && !supplierPay.loading && supplierPay.supplier && (
            <p style={{ color: '#16a34a', fontWeight: 600 }}>No outstanding dues for this supplier.</p>
          )}
        </div>
      )}

      {showForm === true && (
        <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 80 }}>
          <header style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button onClick={resetForm} style={{ padding: '0.375rem', color: '#64748b', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex' }}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{editing ? 'Edit Purchase Bill' : 'Create Purchase Bill'}</h1>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={resetForm} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, cursor: 'pointer' }}>{editing ? 'Update' : 'Save'} Purchase</button>
            </div>
          </header>
          <form onSubmit={handleSubmit}>
          <main style={{ maxWidth: 1280, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <section style={{ background: '#fff', padding: '1.5rem', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>Purchase Details</h2>
                <button type="button" onClick={() => setForm({ ...form, supplier: '' })} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer' }}>Cash Purchase</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Party / Supplier</label>
                  <SearchableSelect options={suppliers.map(s => ({ value: s._id, label: s.name }))} value={form.supplier} onChange={v => { setForm({ ...form, supplier: v }); loadSupplierFyTotal(v); }} onAdd={(q) => { setNewSupplier({ name: '', phone: '', email: '', address: '', pan: '' }); setNewSupplier(prev => ({ ...prev, name: q })); setSupplierModal(true); }} placeholder="Cash" style={{ width: '100%' }} inputStyle={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', width: '100%' }} />
                  {!form.supplier && <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 500, marginTop: 2 }}>Cash Purchase (No Supplier)</div>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Supplier Invoice No.</label>
                  <input value={form.supplierInvoiceNo} onChange={e => setForm({ ...form, supplierInvoiceNo: e.target.value })} placeholder="Optional" style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                    <option value="direct">Direct Purchase</option><option value="order">Purchase Order</option><option value="receipt">GRN Receipt</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice Date (BS)</label>
                  <NepaliDatePicker value={form.date} onChange={v => setForm({ ...form, date: v })} style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem' }} />
                </div>
              </div>
            </section>

            <section style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafbfc' }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>Billing Items</h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="invoice-items" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafbfc', fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <th style={{ padding: '0.75rem 1rem', width: 48, textAlign: 'center' }}>S.N.</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Product</th>
                      <th style={{ padding: '0.75rem 1rem', width: 100, textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '0.75rem 1rem', width: 140, textAlign: 'right' }}>Cost Price</th>
                      <th style={{ padding: '0.75rem 1rem', width: 140, textAlign: 'right' }}>Sell Price</th>
                      <th style={{ padding: '0.75rem 1rem', width: 110, textAlign: 'left' }}>Batch</th>
                      <th style={{ padding: '0.75rem 1rem', width: 120, textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '0.75rem 1rem', width: 48 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#94a3b8', fontWeight: 500 }}>{i + 1}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <SearchableSelect options={products.map(p => ({ value: p._id, label: `${p.name} (${p.sku})` }))} value={item.product} onChange={v => updateItem(i, 'product', v)} onAdd={(q) => { setProductModalRow(i); setNewProduct(prev => ({ ...prev, name: q })); setProductModal(true); }} placeholder="Search product..." style={{ minWidth: 200 }} inputStyle={{ padding: '0.375rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', width: '100%' }} />
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}><input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} style={{ width: '100%', padding: '0.375rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', textAlign: 'center' }} /></td>
                        <td style={{ padding: '0.75rem 1rem' }}><input type="number" step="0.01" min="0" value={item.costPrice} onChange={e => updateItem(i, 'costPrice', e.target.value)} style={{ width: '100%', padding: '0.375rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', textAlign: 'right' }} /></td>
                        <td style={{ padding: '0.75rem 1rem' }}><input type="number" step="0.01" min="0" value={item.sellingPrice} onChange={e => updateItem(i, 'sellingPrice', e.target.value)} style={{ width: '100%', padding: '0.375rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', textAlign: 'right' }} /></td>
                        <td style={{ padding: '0.75rem 1rem' }}><input value={item.batch} onChange={e => updateItem(i, 'batch', e.target.value)} placeholder="Batch#" style={{ width: '100%', padding: '0.375rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem' }} /></td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{formatNPR(item.subtotal)}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          {form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4 }}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>
                <button type="button" onClick={addItem} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem 0.75rem', borderRadius: 8 }}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg><span>Add Billing Item</span></button>
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '1.5rem', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ background: '#fff', padding: '1.25rem', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes / Remarks</label>
                  <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Purchase notes..." style={{ width: '100%', padding: '0.75rem', fontSize: '0.875rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }} />
                </div>
              </div>

              <div style={{ background: '#fff', padding: '1.5rem', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>Summary & Payment</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Subtotal</span><span style={{ fontWeight: 600 }}>{formatNPR(subtotal)}</span></div>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}><input type="checkbox" checked={form.applyVat} onChange={e => setForm({ ...form, applyVat: e.target.checked, inclusiveVat: e.target.checked ? false : form.inclusiveVat, vatPercent: form.vatPercent || 13 })} style={{ width: 16, height: 16, accentColor: '#2563eb' }} /><span style={{ fontWeight: 500 }}>Add VAT ({form.vatPercent || 13}%)</span></label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', marginTop: '0.5rem' }}><input type="checkbox" checked={form.inclusiveVat} onChange={e => setForm({ ...form, inclusiveVat: e.target.checked, applyVat: e.target.checked ? false : form.applyVat, vatPercent: form.vatPercent || 13 })} style={{ width: 16, height: 16, accentColor: '#2563eb' }} /><span style={{ fontSize: '0.75rem', color: '#64748b' }}>Inclusive VAT</span></label>
                  </div>
                  <div><label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Discount (Rs.)</label><input type="number" min="0" value={form.discount} onChange={e => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', textAlign: 'right' }} /></div>
                  {vatEnabled && vatPct > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}><span style={{ color: '#64748b' }}>VAT ({vatPct}%)</span><span style={{ fontWeight: 600, color: '#dc2626' }}>{formatNPR(vatAmount)}</span></div>}
                  <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}><input type="checkbox" checked={!!form.applyTds} onChange={e => setForm({ ...form, applyTds: e.target.checked })} style={{ width: 16, height: 16, accentColor: '#2563eb' }} /><span style={{ fontWeight: 500 }}>Apply TDS 1.5%</span></label>
                    {tdsApplies && <div style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: 4 }}>TDS: {formatNPR(tds)}</div>}
                  </div>
                  <div style={{ paddingTop: '0.75rem', borderTop: '2px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Grand Total</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb' }}>{formatNPR(grandTotal)}</span>
                  </div>
                  {tdsApplies && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Net Payable</span><span style={{ fontWeight: 700, color: '#16a34a' }}>{formatNPR(netPayable)}</span></div>}
                  <div style={{ paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Payment Mode</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {[['cash','💵','Cash'],['bank','🏦','Bank'],['split','🔀','Split']].map(([m, icon, label]) => (
                        <button key={m} type="button" onClick={() => setForm({ ...form, paymentMethod: m, bank: m === 'split' ? '' : form.bank, splits: m === 'split' ? [{ method: 'cash', amount: parseFloat(form.paidAmount) || 0, bank: '' }] : undefined })} style={{ flex: 1, minWidth: 80, padding: '0.5rem', borderRadius: 8, border: `2px solid ${form.paymentMethod === m ? '#2563eb' : '#e2e8f0'}`, background: form.paymentMethod === m ? '#eff6ff' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: form.paymentMethod === m ? 600 : 400, color: form.paymentMethod === m ? '#2563eb' : '#475569' }}><span style={{ fontSize: '1.25rem' }}>{icon}</span>{label}</button>
                      ))}
                    </div>
                    <div style={{ marginTop: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Amount Paid</label>
                      <input type="number" value={form.paidAmount} onChange={e => setForm({ ...form, paidAmount: e.target.value })} placeholder={formatNPR(grandTotal)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }} />
                    </div>
                    {form.paymentMethod === 'bank' && <div style={{ marginTop: '0.5rem' }}><label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Bank *</label><select value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} required style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}><option value="">-- Select Bank --</option>{banks.map(b => <option key={b._id} value={b._id}>{b.name}{b.accountNumber ? ` (${b.accountNumber})` : ''}</option>)}</select></div>}
                    {form.paymentMethod === 'bank' && <div style={{ marginTop: '0.5rem' }}><label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Cheque Number *</label><input value={form.chequeNumber} onChange={e => setForm({ ...form, chequeNumber: e.target.value })} required placeholder="Cheque #" style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', border: '1px solid #cbd5e1', borderRadius: 8 }} /></div>}
                    {form.paymentMethod === 'split' && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem', background: '#f8fafc' }}>
                        {(form.splits || []).map((sp, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <select value={sp.method} onChange={e => { const next = [...(form.splits || [])]; next[idx] = { ...next[idx], method: e.target.value, bank: '' }; setForm({ ...form, splits: next }); }} style={{ flex: 1, padding: '0.375rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}><option value="cash">Cash</option><option value="bank">Bank</option></select>
                            <input type="number" value={sp.amount || ''} onChange={e => { const next = [...(form.splits || [])]; next[idx] = { ...next[idx], amount: parseFloat(e.target.value) || 0 }; setForm({ ...form, splits: next }); }} placeholder="Amount" style={{ flex: 1, padding: '0.375rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', textAlign: 'right' }} />
                            {sp.method === 'bank' && <select value={sp.bank} onChange={e => { const next = [...(form.splits || [])]; next[idx] = { ...next[idx], bank: e.target.value }; setForm({ ...form, splits: next }); }} style={{ flex: 1, padding: '0.375rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}><option value="">-- Bank --</option>{banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select>}
                            {(form.splits || []).length > 1 && <button type="button" onClick={() => setForm({ ...form, splits: (form.splits || []).filter((_, i) => i !== idx) })} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}>&times;</button>}
                          </div>
                        ))}
                        <button type="button" onClick={() => setForm({ ...form, splits: [...(form.splits || []), { method: 'cash', amount: 0, bank: '' }] })} style={{ fontSize: '0.8rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add Split</button>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 600, color: Math.abs((form.splits || []).reduce((s, sp) => s + (sp.amount || 0), 0) - parseFloat(form.paidAmount || 0)) < 0.01 ? '#16a34a' : '#dc2626' }}>Split Total: {formatNPR((form.splits || []).reduce((s, sp) => s + (sp.amount || 0), 0))} / {formatNPR(parseFloat(form.paidAmount || 0))}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </main>
          <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e2e8f0', boxShadow: '0 -2px 8px rgba(0,0,0,0.06)', padding: '0.75rem 1.5rem', zIndex: 20 }}>
            <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Status: <span style={{ fontWeight: 500, color: '#d97706', background: '#fffbeb', padding: '0.125rem 0.5rem', borderRadius: 4, border: '1px solid #fde68a' }}>Draft</span></div>
              <button type="submit" disabled={saving} style={{ padding: '0.5rem 1.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, cursor: 'pointer' }}>{saving ? 'Saving...' : editing ? 'Update Purchase' : 'Create Purchase'}</button>
            </div>
          </footer>
          </form>
        </div>
      )}

      <div className="card">
        <div style={{ padding: '0.5rem 0', marginBottom: '0.5rem' }}>
          <input type="text" placeholder="Search supplier / PO number..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '0.4rem 0.7rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', minWidth: 250 }} />
        </div>
        <table className="table">
          <thead><tr><th>PO#</th><th>Date</th><th>Type</th><th>Supplier</th><th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {items.filter(p => !search || (p.supplier?.name || '').toLowerCase().includes(search.toLowerCase()) || (p.purchaseNumber || '').toLowerCase().includes(search.toLowerCase())).map(p => (
              <tr key={p._id} onClick={() => setDetailsId(p._id)} style={{ cursor: 'pointer' }}>
                <td><strong>{p.purchaseNumber}</strong></td>
                <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                <td><span className="badge badge-info">{p.type}</span></td>
                <td>{p.supplier?.name || '-'}</td>
                <td>{p.items?.length}</td>
                <td>{formatNPR(p.grandTotal)}</td>
                <td>
                  {formatNPR(p.paidAmount)}
                  {p.paymentMethod && p.paidAmount > 0 && (
                    <div style={{ marginTop: '0.15rem' }}>
                      <span className={`badge ${p.paymentMethod === 'bank' ? 'badge-info' : 'badge-success'}`}>
                        {p.paymentMethod === 'bank' ? '🏦 Bank' : '💵 Cash'}
                      </span>
                    </div>
                  )}
                </td>
                <td className="text-danger">{p.dueAmount > 0 ? formatNPR(p.dueAmount) : '-'}</td>
                <td>
                  {p.status === 'cancelled' ? (
                    <span className="badge badge-danger">Cancelled</span>
                  ) : p.dueAmount > 0 && p.paidAmount > 0 ? (
                    <span className="badge badge-warning">Partial</span>
                  ) : p.dueAmount > 0 ? (
                    <span className="badge badge-danger">Due</span>
                  ) : (
                    <span className="badge badge-success">Paid</span>
                  )}
                </td>
                <td className="action-cell" onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm" onClick={() => setDetailsId(p._id)}>View</button>
                  {isSuperAdmin && <button className="btn btn-sm btn-secondary" style={{ marginLeft: '0.25rem' }} onClick={() => startEdit(p)}>Edit</button>}
                  {isSuperAdmin && <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.25rem' }} onClick={() => { setReturnModal(p); setReturnForm({}); setReturnReason(''); }}>Return</button>}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="10" className="text-center">No purchases</td></tr>}
          </tbody>
        </table>
      </div>
      {detailsId && !showForm && (() => {
        const detail = items.find(x => x._id === detailsId);
        if (!detail) return null;
        return (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
          <div className="modal-header">
            <h3>{detail.purchaseNumber} - Items</h3>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button className="btn btn-sm btn-secondary" onClick={() => printPurchaseVoucher(detail)}>Print</button>
              <button className="btn btn-sm btn-danger" onClick={() => printPurchaseVoucher(detail)}>PDF</button>
              <button className="btn btn-sm modal-close-x" onClick={() => setDetailsId(null)}>×</button>
            </div>
          </div>
          <div className="modal-body">
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>Subtotal: {formatNPR(detail.subtotal)}</div>
            {detail.tax > 0 && <div>VAT: {formatNPR(detail.tax)}</div>}
            {detail.tds > 0 && <div>TDS 1.5%: {formatNPR(detail.tds)}</div>}
            <div>Discount: {formatNPR(detail.discount)}</div>
            <div><strong>Grand Total: {formatNPR(detail.grandTotal)}</strong></div>
            <div>Paid: {formatNPR(detail.paidAmount)}</div>
            <div style={detail.dueAmount > 0 ? { color: '#dc2626', fontWeight: 700 } : {}}>Due: {formatNPR(detail.dueAmount)}</div>
            {detail.paymentMethod && <div>Payment: {detail.paymentMethod === 'split' ? 'Split' : detail.paymentMethod === 'bank' ? 'Bank (Cheque)' : 'Cash'} {detail.chequeNumber && `/ Chq: ${detail.chequeNumber}`}</div>}
            {detail.paymentRemarks && <div>Remarks: {detail.paymentRemarks}</div>}
            {detail.note && <div>Note: {detail.note}</div>}
            {detail.supplierInvoiceNo && <div>Supplier Invoice: {detail.supplierInvoiceNo}</div>}
          </div>
          <table className="table">
            <thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Subtotal</th><th>Batch</th></tr></thead>
            <tbody>
              {detail.items?.map((item, i) => (
                <tr key={i}><td>{item.product?.name || 'Unknown'}</td><td>{item.quantity}</td><td>{formatNPR(item.costPrice)}</td><td>{formatNPR(item.subtotal)}</td><td>{item.batch || '-'}</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            {detail.dueAmount > 0 && (
              <button className="btn btn-primary" onClick={() => setPayModal(detail)}>Pay Now</button>
            )}
            {isSuperAdmin && (
              <button className="btn btn-danger" onClick={() => { setReturnModal(detail); setReturnForm({}); setReturnReason(''); }}>Return Items</button>
            )}
          </div>
          </div>
          </div>
        </div>
      );})()}

      {payModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header"><h3>Record Payment</h3><button className="btn btn-sm modal-close-x" onClick={() => setPayModal(null)}>×</button></div>
            <div className="modal-body">
              <p>Purchase: <strong>{payModal.purchaseNumber}</strong></p>
              <p>Grand Total: <strong>{formatNPR(payModal.grandTotal)}</strong> | Due: <strong style={{ color: '#dc2626' }}>{formatNPR(payModal.dueAmount)}</strong></p>
              <div className="form-group"><label>Amount *</label><input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} placeholder="Enter amount" max={payModal.dueAmount} /></div>
              <div className="form-group"><label>Method</label><select value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value, bank: e.target.value === 'cash' ? '' : payForm.bank })}>
                <option value="cash">Cash (Nagad)</option>
                <option value="bank">Bank (Cheque)</option>
              </select></div>
              {payForm.method === 'cash' && <div className="form-group"><label>Remarks</label><input value={payForm.remarks} onChange={e => setPayForm({ ...payForm, remarks: e.target.value })} placeholder="Payment remarks" /></div>}
              {payForm.method === 'bank' && <div className="form-group"><label>Bank *</label><select value={payForm.bank} onChange={e => setPayForm({ ...payForm, bank: e.target.value })} required><option value="">-- Select Bank --</option>{banks.map(b => <option key={b._id} value={b._id}>{b.name}{b.accountNumber ? ` (${b.accountNumber})` : ''}</option>)}</select></div>}
              {payForm.method === 'bank' && <div className="form-group"><label>Cheque Number *</label><input value={payForm.chequeNumber} onChange={e => setPayForm({ ...payForm, chequeNumber: e.target.value })} required placeholder="Enter cheque number" /></div>}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setPayModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={async () => {
                if (!payForm.amount || parseFloat(payForm.amount) <= 0) { addToast('Enter a valid amount', 'error'); return; }
                if (payForm.method === 'bank' && !payForm.chequeNumber) { addToast('Cheque number required', 'error'); return; }
                if (payForm.method === 'bank' && !payForm.bank) { addToast('Choose a bank', 'error'); return; }
                try {
                  await api.post(`/purchases/${payModal._id}/pay`, {
                    amount: parseFloat(payForm.amount), method: payForm.method,
                    bank: payForm.method === 'bank' ? payForm.bank : null,
                    chequeNumber: payForm.chequeNumber, remarks: payForm.remarks,
                  });
                  addToast('Payment recorded', 'success');
                  setPayModal(null);
                  setPayForm({ amount: '', method: 'cash', bank: '', chequeNumber: '', remarks: '' });
                  load();
                } catch (err) { addToast(err.response?.data?.message || 'Payment failed', 'error'); }
              }}>Record Payment</button>
            </div>
          </div>
        </div>
      )}

      {supplierModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header"><h3>Add New Supplier</h3><button className="btn btn-sm modal-close-x" onClick={() => setSupplierModal(false)}>×</button></div>
            <div className="modal-body">
              <form onSubmit={saveSupplierInline}>
                <div className="form-group"><label>Name *</label><input value={newSupplier.name} onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })} placeholder="Supplier name" autoFocus /></div>
                <div className="form-group"><label>Phone</label><input value={newSupplier.phone} onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })} placeholder="Phone number" /></div>
                <div className="form-group"><label>Email</label><input value={newSupplier.email} onChange={e => setNewSupplier({ ...newSupplier, email: e.target.value })} placeholder="Email" /></div>
                <div className="form-group"><label>Address</label><input value={newSupplier.address} onChange={e => setNewSupplier({ ...newSupplier, address: e.target.value })} placeholder="Address" /></div>
                <div className="form-group"><label>PAN</label><input value={newSupplier.pan} onChange={e => setNewSupplier({ ...newSupplier, pan: e.target.value })} placeholder="PAN number" /></div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setSupplierModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={savingSupplier}>{savingSupplier ? 'Saving...' : 'Add Supplier'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {productModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header"><h3>Add New Product</h3><button className="btn btn-sm modal-close-x" onClick={() => setProductModal(false)}>×</button></div>
            <div className="modal-body">
              <form onSubmit={saveProductInline}>
                <div className="form-group"><label>Product Name *</label><input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Product name" autoFocus /></div>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group"><label>SKU (optional)</label><input value={newProduct.sku} onChange={e => setNewProduct({ ...newProduct, sku: e.target.value })} placeholder="Auto if empty" /></div>
                  <div className="form-group"><label>Unit</label><select value={newProduct.unit} onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })}>
                    <option value="pcs">pcs</option><option value="kg">kg</option><option value="liter">liter</option><option value="box">box</option><option value="pack">pack</option>
                  </select></div>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <SearchableSelect
                    options={[
                      { value: '', label: 'None' },
                      { value: '__new__', label: '+ Add new category...' },
                      ...categories.map(c => ({ value: c._id, label: c.name })),
                    ]}
                    value={newProduct.category}
                    onChange={v => setNewProduct({ ...newProduct, category: v })}
                    onAdd={q => { setNewProduct({ ...newProduct, category: '' }); setNewCategoryName(q); }}
                    placeholder="Search category..."
                  />
                  {newProduct.category === '__new__' && (
                    <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="New category name" style={{ marginTop: '0.4rem' }} />
                  )}
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group"><label>Cost Price</label><input type="number" step="0.01" value={newProduct.costPrice} onChange={e => setNewProduct({ ...newProduct, costPrice: e.target.value })} placeholder="0" /></div>
                  <div className="form-group"><label>Selling Price</label><input type="number" step="0.01" value={newProduct.sellingPrice} onChange={e => setNewProduct({ ...newProduct, sellingPrice: e.target.value })} placeholder="0" /></div>
                  <div className="form-group"><label>Initial Stock</label><input type="number" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} placeholder="0" /></div>
                  <div className="form-group"><label>Min Stock</label><input type="number" value={newProduct.minStock} onChange={e => setNewProduct({ ...newProduct, minStock: e.target.value })} placeholder="5" /></div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  <input type="checkbox" checked={newProduct.vatEnabled} onChange={e => setNewProduct({ ...newProduct, vatEnabled: e.target.checked, taxRate: e.target.checked ? (newProduct.taxRate || 13) : 0 })} />
                  Apply VAT (13%) to this product
                </label>
                {newProduct.vatEnabled && (
                  <>
                    <div className="form-group"><label>VAT Rate (%)</label><input type="number" value={newProduct.taxRate} onChange={e => setNewProduct({ ...newProduct, taxRate: e.target.value })} /></div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      <input type="checkbox" checked={newProduct.priceIncludesTax} onChange={e => setNewProduct({ ...newProduct, priceIncludesTax: e.target.checked })} />
                      Price includes VAT (Inclusive)
                    </label>
                  </>
                )}
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setProductModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={savingProduct}>{savingProduct ? 'Saving...' : 'Add Product'}</button>
                </div>
              </form>
            </div>
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
              <button className="btn-primary" onClick={async () => {
                const items = returnModal.items
                  .filter(it => parseFloat(returnForm[String(it.product)]) > 0)
                  .map(it => ({ product: it.product._id || it.product, quantity: parseFloat(returnForm[String(it.product)]) }));
                if (items.length === 0) { addToast('Enter quantity to return for at least one item', 'error'); return; }
                try {
                  await api.post(`/purchases/${returnModal._id}/return`, { items, reason: returnReason });
                  addToast('Purchase return recorded', 'success');
                  setReturnModal(null);
                  load();
                } catch (err) { addToast(err.response?.data?.message || 'Return failed', 'error'); }
              }}>Record Return</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}