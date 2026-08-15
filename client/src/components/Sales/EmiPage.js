import React, { useState, useEffect } from 'react';
import { useToast } from '../UI/Toast';
import SearchableSelect from '../UI/SearchableSelect';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import { printEmiRecord } from '../UI/printEmi';
import api from '../../api';

function formatNPR(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN');
}

export default function EmiPage() {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banks, setBanks] = useState([]);
  const [financeBanks, setFinanceBanks] = useState([]);
  const [bankModal, setBankModal] = useState(false);
  const [bankModalTarget, setBankModalTarget] = useState('finance');
  const [newBank, setNewBank] = useState({ name: '', accountNumber: '', branch: '' });
  const [savingBank, setSavingBank] = useState(false);
  const [detail, setDetail] = useState(null);
  const [disburseModal, setDisburseModal] = useState(false);
  const [disburseForm, setDisburseForm] = useState({ amount: '', bankCharge: 0, disbursingBank: '' });
  const [savingDisburse, setSavingDisburse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [customerModal, setCustomerModal] = useState(false);
  const [exchangeModal, setExchangeModal] = useState(false);
  const [exchangeRows, setExchangeRows] = useState([{ product: '', quantity: 1, price: 0, serialNumber: '' }]);
  const [productTarget, setProductTarget] = useState('main');
  const [newProduct, setNewProduct] = useState({ name: '', sku: '', category: '', costPrice: '', sellingPrice: '', stock: '', minStock: 5, unit: 'pcs', taxRate: 13, vatEnabled: false, priceIncludesTax: false, itemCondition: 'new' });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '', pan: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [form, setForm] = useState({
    product: '', productTotal: '', exchangeEnabled: false, exchangeItems: [],
    exchangeCustomerName: '', exchangePaidAmount: '',
    customer: '', downPayment: '', downPaymentPercent: '', downPaymentMethod: 'cash', bank: '', downPaymentBank: '',
    invoiceNumber: '', applyVat: false, inclusiveVat: false,
    tenure: '', monthlyEMI: '', interestRate: '', remarks: '',
  });
  const addToast = useToast();

  useEffect(() => {
    load();
    api.get('/products/emi-products').then(r => setProducts(r.data));
    api.get('/customers').then(r => setCustomers(r.data));
    api.get('/categories').then(r => setCategories(r.data));
    api.get('/banks').then(r => setBanks(r.data));
    api.get('/banks?role=finance').then(r => setFinanceBanks(r.data)).catch(() => setFinanceBanks([]));
  }, []);

  const load = () => api.get('/emis').then(r => setItems(r.data.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))));

  const selectedProduct = products.find(p => p._id === form.product);
  const selectedCustomer = customers.find(c => c._id === form.customer);
  const selectedBank = financeBanks.find(b => b._id === form.bank) || banks.find(b => b._id === form.bank);

  const total = parseFloat(form.productTotal) || 0;
  const exch = (form.exchangeItems || []).reduce((s, it) => s + (parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 0), 0);
  const productTaxRate = (form.applyVat || form.inclusiveVat) ? ((selectedProduct?.vatEnabled && selectedProduct?.taxRate) || 13) : 0;
  const inclusiveVat = selectedProduct?.priceIncludesTax || form.inclusiveVat;
  const baseAmount = inclusiveVat && productTaxRate > 0 ? Math.round((total * 100) / (100 + productTaxRate) * 100) / 100 : total;
  const vatAmount = productTaxRate > 0 ? Math.round((inclusiveVat ? (total - baseAmount) : (baseAmount * productTaxRate / 100)) * 100) / 100 : 0;
  const net = Math.max(0, total - exch);
  const down = parseFloat(form.downPayment) || 0;
  const remaining = Math.max(0, net - down);
  const downPct = parseFloat(form.downPaymentPercent) || 0;
  const downPctAmount = downPct > 0 ? Math.round((total * downPct / 100) * 100) / 100 : 0;

  const resetForm = () => setForm({
    product: '', productTotal: '', exchangeEnabled: false, exchangeItems: [],
    exchangeCustomerName: '', exchangePaidAmount: '',
    customer: '', downPayment: '', downPaymentPercent: '', downPaymentMethod: 'cash', bank: '', downPaymentBank: '',
    invoiceNumber: '', applyVat: false, inclusiveVat: false,
    tenure: '', monthlyEMI: '', interestRate: '', remarks: '',
  });

  const saveBankInline = async (e) => {
    e.preventDefault();
    if (!newBank.name.trim()) { addToast('Bank name is required', 'error'); return; }
    setSavingBank(true);
    const isFinance = bankModalTarget === 'finance';
    try {
      const { data } = await api.post('/banks', {
        name: newBank.name.trim(),
        accountNumber: newBank.accountNumber.trim(),
        branch: newBank.branch.trim(),
        isFinanceBank: isFinance,
      });
      if (isFinance) {
        setFinanceBanks(prev => prev.some(b => b._id === data._id) ? prev : [...prev, data]);
        setForm(f => ({ ...f, bank: data._id }));
      } else {
        setBanks(prev => prev.some(b => b._id === data._id) ? prev : [...prev, data]);
        if (bankModalTarget === 'receive') setForm(f => ({ ...f, downPaymentBank: data._id }));
        if (bankModalTarget === 'disburse') setDisburseForm(f => ({ ...f, disbursingBank: data._id }));
      }
      setBankModal(false);
      setNewBank({ name: '', accountNumber: '', branch: '' });
      addToast('Bank added', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to add bank', 'error');
    }
    setSavingBank(false);
  };

  const handleProductChange = (value) => {
    const p = products.find(pr => pr._id === value);
    setForm({ ...form, product: value, productTotal: p ? String(p.sellingPrice || 0) : '' });
  };

  const toggleExchange = () => {
    const on = !form.exchangeEnabled;
    const newExch = on ? form.exchangeItems.reduce((s, it) => s + (parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 0), 0) : 0;
    let newDown = form.downPayment;
    if (downPct > 0) {
      const pctAmt = Math.round((total * downPct / 100) * 100) / 100;
      newDown = String(on && newExch > 0 ? Math.max(0, pctAmt - newExch) : pctAmt);
    }
    setForm({ ...form, exchangeEnabled: on, exchangeItems: on ? form.exchangeItems : [], downPayment: newDown });
    if (on) {
      setExchangeRows(form.exchangeItems.length > 0
        ? form.exchangeItems.map(it => ({ product: it.product, quantity: it.quantity, price: it.price }))
        : [{ product: '', quantity: 1, price: 0 }]);
      setExchangeModal(true);
    }
  };

  const addExchangeRow = () => setExchangeRows([...exchangeRows, { product: '', quantity: 1, price: 0 }]);
  const updateExchangeRow = (i, field, value) => {
    const rows = [...exchangeRows];
    if (field === 'product') {
      const p = products.find(pr => pr._id === value);
      rows[i] = { ...rows[i], product: value, price: p ? (parseFloat(p.costPrice) || 0) : rows[i].price };
    } else {
      rows[i] = { ...rows[i], [field]: value };
    }
    setExchangeRows(rows);
  };
  const removeExchangeRow = (i) => {
    if (exchangeRows.length === 1) { setExchangeRows([{ product: '', quantity: 1, price: 0 }]); return; }
    setExchangeRows(exchangeRows.filter((_, idx) => idx !== i));
  };

  const saveExchangeItems = (e) => {
    e.preventDefault();
    const exItems = exchangeRows
      .filter(r => r.product)
      .map(r => ({ product: r.product, quantity: Math.max(0, parseFloat(r.quantity) || 0), price: Math.round((parseFloat(r.price) || 0) * 100) / 100, serialNumber: r.serialNumber || '' }));
    if (exItems.some(r => r.quantity <= 0)) { addToast('Exchange quantity must be greater than zero', 'error'); return; }
    const newExch = exItems.reduce((s, it) => s + it.price * it.quantity, 0);
    let newDown = form.downPayment;
    if (downPct > 0) {
      const pctAmt = Math.round((total * downPct / 100) * 100) / 100;
      newDown = String(Math.max(0, pctAmt - newExch));
    }
    setForm(f => ({ ...f, exchangeItems: exItems, downPayment: newDown }));
    setExchangeModal(false);
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
        name: newProduct.name.trim(), sku: newProduct.sku.trim(), category: categoryId,
        costPrice: parseFloat(newProduct.costPrice) || 0, sellingPrice: parseFloat(newProduct.sellingPrice) || 0,
        stock: parseFloat(newProduct.stock) || 0, minStock: parseFloat(newProduct.minStock) || 5,
        unit: newProduct.unit || 'pcs', taxRate: newProduct.vatEnabled ? (parseFloat(newProduct.taxRate) || 13) : 0,
        vatEnabled: !!newProduct.vatEnabled, priceIncludesTax: !!newProduct.priceIncludesTax,
        itemCondition: newProduct.itemCondition || 'new',
      });
      setProducts(prev => prev.some(p => p._id === data._id) ? prev : [...prev, data]);
      if (productTarget === 'main') {
        setForm(f => ({ ...f, product: data._id, productTotal: String(data.sellingPrice || 0) }));
      } else {
        const rows = [...exchangeRows];
        rows[productTarget] = { ...rows[productTarget], product: data._id, price: parseFloat(data.costPrice) || 0 };
        setExchangeRows(rows);
      }
      setProductModal(false); setProductTarget('main');
      setNewProduct({ name: '', sku: '', category: '', costPrice: '', sellingPrice: '', stock: '', minStock: 5, unit: 'pcs', taxRate: 13, vatEnabled: false, priceIncludesTax: false, itemCondition: 'new' });
      setNewCategoryName(''); addToast('Product added', 'success');
    } catch (err) { addToast(err.response?.data?.message || 'Failed to add product', 'error'); }
    setSavingProduct(false);
  };

  const saveCustomerInline = async (e) => {
    e.preventDefault();
    if (!newCustomer.name.trim()) { addToast('Customer name is required', 'error'); return; }
    setSavingCustomer(true);
    try {
      const { data } = await api.post('/customers', { ...newCustomer, name: newCustomer.name.trim() });
      setCustomers(prev => prev.some(c => c._id === data._id) ? prev : [...prev, data]);
      setForm(f => ({ ...f, customer: data._id }));
      setCustomerModal(false);
      setNewCustomer({ name: '', phone: '', email: '', address: '', pan: '' });
      addToast('Customer added', 'success');
    } catch (err) { addToast(err.response?.data?.message || 'Failed to add customer', 'error'); }
    setSavingCustomer(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product || !form.customer) { addToast('Select a product and a customer', 'error'); return; }
    if (!form.bank) { addToast('Select a bank', 'error'); return; }
    if (total <= 0) { addToast('Product total must be greater than zero', 'error'); return; }
    if (exch > total) { addToast('Exchange amount cannot exceed the product total', 'error'); return; }
    if (down < 0 || down > net) { addToast('Down payment cannot exceed the net amount', 'error'); return; }
      setSaving(true);
      try {
        await api.post('/emis', {
        product: form.product, customer: form.customer,
        productTotal: total, exchangeEnabled: form.exchangeEnabled, exchangeAmount: exch,
        exchangeItems: form.exchangeEnabled ? form.exchangeItems : [],
        exchangeCustomerName: form.exchangeEnabled ? form.exchangeCustomerName.trim() : '',
        exchangePaidAmount: form.exchangeEnabled ? (parseFloat(form.exchangePaidAmount) || 0) : 0,
        downPayment: down, downPaymentPercent: downPct, downPaymentMethod: form.downPaymentMethod,
        downPaymentBank: form.downPaymentBank || undefined,
        bank: form.bank, bankName: selectedBank?.name || '',
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        applyVat: form.applyVat, inclusiveVat: form.inclusiveVat,
        vatRate: productTaxRate, vatAmount,
        tenure: form.tenure ? parseInt(form.tenure) : undefined,
        monthlyEMI: form.monthlyEMI ? parseFloat(form.monthlyEMI) : undefined,
        interestRate: form.interestRate ? parseFloat(form.interestRate) : undefined,
        remarks: form.remarks.trim() || undefined,
      });
      addToast('EMI recorded successfully', 'success'); resetForm(); load();
    } catch (err) { addToast(err.response?.data?.message || 'Failed to save EMI', 'error'); }
    setSaving(false);
  };

  const handleDisburse = async (e) => {
    e.preventDefault();
    if (!detail) return;
    const amt = parseFloat(disburseForm.amount) || 0;
    const chg = parseFloat(disburseForm.bankCharge) || 0;
    if (Math.abs((amt + chg) - (detail.remainingAmount || 0)) > 0.01) {
      addToast(`Amount + charge must equal ${formatNPR(detail.remainingAmount)}`, 'error'); return;
    }
    setSavingDisburse(true);
    try {
      const { data } = await api.post(`/emis/${detail._id}/disburse`, {
        amount: amt, bankCharge: chg, disbursingBank: disburseForm.disbursingBank || undefined,
      });
      setDetail(data);
      setDisburseModal(false);
      addToast('Bank disbursement recorded', 'success');
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to record disbursement', 'error');
    }
    setSavingDisburse(false);
  };

  const totalSales = items.reduce((s, i) => s + (i.netAmount || 0), 0);
  const totalRemaining = items.reduce((s, i) => s + (i.remainingAmount || 0), 0);
  const [detailFilter, setDetailFilter] = useState('');

  const statusColor = (s) => s === 'completed' ? '#16a34a' : s === 'partial' ? '#f59e0b' : s === 'defaulted' ? '#dc2626' : '#64748b';

  return (
    <div>
      <div className="page-header"><h1>EMI (Hire Purchase)</h1></div>
      <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '1rem' }}>
        <div className="card" style={{ borderLeft: '4px solid #2563eb', onClick: () => setDetailFilter('sales') }}>
          <div className="card-label">Total EMI Sales</div>
          <div className="card-value">{formatNPR(totalSales)}</div>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #dc2626', onClick: () => setDetailFilter('receivable') }}>
          <div className="card-label">Total Remaining (Receivable)</div>
          <div className="card-value">{formatNPR(totalRemaining)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>New EMI</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr', marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Customer *</label>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <SearchableSelect options={customers.map(c => ({ value: c._id, label: c.phone ? `${c.name} (${c.phone})` : c.name }))} value={form.customer} onChange={v => setForm({ ...form, customer: v })} onAdd={(q) => { setNewCustomer(prev => ({ ...prev, name: q })); setCustomerModal(true); }} required placeholder="Search customer..." />
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setCustomerModal(true)}>+ New</button>
              </div>
            </div>
            <div className="form-group">
              <label>Invoice Number</label>
              <input type="text" value={form.invoiceNumber} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="Enter invoice number" />
            </div>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr auto' }}>
            <div className="form-group">
              <label>Product Name *</label>
              <SearchableSelect options={products.map(p => ({ value: p._id, label: `${p.name}${p.sellingPrice ? ` (${formatNPR(p.sellingPrice)})` : ''}` }))} value={form.product} onChange={handleProductChange} onAdd={(q) => { setNewProduct(prev => ({ ...prev, name: q })); setProductTarget('main'); setProductModal(true); }} required placeholder="Search product..." />
            </div>
            <div className="form-group">
              <label>Product Total Amount *</label>
              <input type="number" min="0" step="any" value={form.productTotal} onChange={e => setForm({ ...form, productTotal: e.target.value })} />
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label>&nbsp;</label>
              <button type="button" className={`btn btn-sm ${form.exchangeEnabled ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleExchange}>
                {form.exchangeEnabled ? 'Exchange On' : 'Exchange'}
              </button>
            </div>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '0.75rem' }}>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer', color: '#475569' }}>
                <input type="checkbox" checked={form.applyVat} onChange={e => setForm({ ...form, applyVat: e.target.checked })} style={{ width: 14, height: 14 }} />
                Add VAT (13%)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer', color: '#475569' }}>
                <input type="checkbox" checked={form.inclusiveVat} onChange={e => setForm({ ...form, inclusiveVat: e.target.checked })} style={{ width: 14, height: 14 }} />
                Inclusive VAT
              </label>
            </div>
          </div>

          {form.exchangeEnabled && (
            <div style={{ marginTop: '1rem', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '0.75rem 1rem', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong>Exchange (Trade-in)</strong>
                <button type="button" className="btn btn-sm btn-secondary" onClick={toggleExchange}>Disable Exchange</button>
              </div>
              {form.exchangeItems.length > 0 ? (
                <div className="table-responsive" style={{ marginBottom: '0.75rem' }}>
                  <table className="table">
                    <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Subtotal</th></tr></thead>
                    <tbody>
                      {form.exchangeItems.map((it, idx) => (
                        <tr key={idx}>
                          <td>{products.find(p => p._id === it.product)?.name || '-'}</td>
                          <td className="text-right">{it.quantity}</td>
                          <td className="text-right">{formatNPR(it.price)}</td>
                          <td className="text-right">{formatNPR(it.price * it.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan="3" className="text-right" style={{ fontWeight: 700 }}>Exchange Total</td><td className="text-right" style={{ fontWeight: 700 }}>{formatNPR(exch)}</td></tr></tfoot>
                  </table>
                </div>
              ) : <p style={{ color: '#64748b', margin: '0 0 0.75rem' }}>No exchange items added yet.</p>}
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { setExchangeRows(form.exchangeItems.length > 0 ? form.exchangeItems.map(it => ({ product: it.product, quantity: it.quantity, price: it.price })) : [{ product: '', quantity: 1, price: 0 }]); setExchangeModal(true); }} style={{ marginBottom: '0.75rem' }}>
                {form.exchangeItems.length > 0 ? 'Edit Exchange Items' : 'Add Exchange Items'}
              </button>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '0.75rem' }}>
                <div className="form-group" style={{ margin: 0 }}><label>Exchange Value</label><input type="text" value={formatNPR(exch)} readOnly /></div>
                <div className="form-group" style={{ margin: 0 }}><label>Net Amount (After Exchange)</label><input type="text" value={formatNPR(net)} readOnly /></div>
              </div>
            </div>
          )}

          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: '1rem' }}>
            <div className="form-group">
              <label>Down Payment % </label>
              <input type="number" min="0" max="100" step="any" value={form.downPaymentPercent} onChange={e => {
                const pct = e.target.value;
                const newPct = parseFloat(pct) || 0;
                const downPctAmt = newPct > 0 ? Math.round((total * newPct / 100) * 100) / 100 : 0;
                const required = form.exchangeEnabled && exch > 0 ? Math.max(0, downPctAmt - exch) : downPctAmt;
                setForm({ ...form, downPaymentPercent: pct, downPayment: pct ? String(required || 0) : '' });
              }} placeholder="e.g. 20" />
            </div>
            <div className="form-group">
              <label>Down Payment *</label>
              <input type="number" min="0" step="any" value={form.downPayment} onChange={e => {
                const dp = e.target.value;
                const netAfter = Math.max(0, total - exch - (parseFloat(dp) || 0));
                const months = parseInt(form.tenure) || 0;
                const autoEmi = months > 0 && netAfter > 0 ? Math.round((netAfter / months) * 100) / 100 : form.monthlyEMI;
                setForm({ ...form, downPayment: dp, downPaymentPercent: '', monthlyEMI: String(autoEmi) });
              }} placeholder="Paid by customer" />
            </div>
            <div className="form-group">
              <label>Down Payment Method *</label>
              <select value={form.downPaymentMethod} onChange={e => setForm({ ...form, downPaymentMethod: e.target.value })}>
                <option value="cash">Cash</option><option value="qr">QR</option><option value="bank">Bank</option>
              </select>
            </div>
          </div>
          {form.downPaymentMethod === 'bank' && (
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: '0.5rem' }}>
              <div className="form-group">
                <label>Receiving Bank (Our Account) *</label>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
<SearchableSelect options={banks.map(b => ({ value: b._id, label: b.accountNumber ? `${b.name} (${b.accountNumber})` : b.name }))} value={form.downPaymentBank} onChange={v => setForm({ ...form, downPaymentBank: v })} onAdd={(q) => { setNewBank(prev => ({ ...prev, name: q })); setBankModalTarget('receive'); setBankModal(true); }} required placeholder="Our bank account..." />
<button type="button" className="btn btn-sm btn-secondary" onClick={() => { setBankModalTarget('receive'); setBankModal(true); }}>+ New</button>
                </div>
              </div>
            </div>
          )}
          {downPct > 0 && (
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '-0.5rem', marginBottom: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
              {downPct}% of total {formatNPR(total)} = <strong>{formatNPR(downPctAmount)}</strong>
              {form.exchangeEnabled && exch > 0 && exch < downPctAmount && <>, exchange covers {formatNPR(exch)}, customer pays <strong>{formatNPR(downPctAmount - exch)}</strong></>}
              {form.exchangeEnabled && exch >= downPctAmount && <>, exchange covers {formatNPR(exch)} (no extra payment needed)</>}
            </div>
          )}

          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: '0.5rem' }}>
            <div className="form-group">
              <label>Bank (EMI Financed By) *</label>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
<SearchableSelect options={financeBanks.map(b => ({ value: b._id, label: b.accountNumber ? `${b.name} (${b.accountNumber})` : b.name }))} value={form.bank} onChange={v => setForm({ ...form, bank: v })} onAdd={(q) => { setNewBank(prev => ({ ...prev, name: q })); setBankModalTarget('finance'); setBankModal(true); }} required placeholder="Search finance bank..." />
<button type="button" className="btn btn-sm btn-secondary" onClick={() => { setBankModalTarget('finance'); setBankModal(true); }}>+ New</button>
              </div>
            </div>
            <div className="form-group"><label>Tenure (months)</label><input type="number" min="1" value={form.tenure} onChange={e => {
              const t = e.target.value;
              const months = parseInt(t) || 0;
              const autoEmi = months > 0 && remaining > 0 ? Math.round((remaining / months) * 100) / 100 : '';
              setForm({ ...form, tenure: t, monthlyEMI: String(autoEmi) });
            }} placeholder="e.g. 12" /></div>
            <div className="form-group"><label>Monthly EMI Amount (Auto)</label><input type="number" min="0" step="any" value={form.monthlyEMI} readOnly placeholder="Auto" /></div>
          </div>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 2fr', marginTop: '0.5rem' }}>
            <div className="form-group"><label>Interest Rate (% p.a.)</label><input type="number" min="0" step="any" value={form.interestRate} onChange={e => setForm({ ...form, interestRate: e.target.value })} placeholder="e.g. 12" /></div>
            <div className="form-group"><label>Remarks / Notes (optional)</label><input type="text" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} placeholder="Any notes about this EMI" /></div>
          </div>

          <div className="form-group" style={{ marginTop: '0.5rem' }}>
            <label>Remaining Amount (Auto)</label>
            <input type="text" value={formatNPR(remaining)} readOnly />
          </div>

          <div className="card" style={{ marginTop: '1rem', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="form-group" style={{ margin: 0 }}><label>Customer</label><div style={{ fontWeight: 600 }}>{selectedCustomer?.name || '-'}</div></div>
              <div className="form-group" style={{ margin: 0 }}><label>Product</label><div style={{ fontWeight: 600 }}>{selectedProduct?.name || '-'}</div></div>
              <div className="form-group" style={{ margin: 0 }}><label>Financed By</label><div style={{ fontWeight: 600 }}>{selectedBank?.name ? `EMI-(${selectedBank.name})` : '-'}</div></div>
            </div>
            {downPct > 0 && <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#64748b' }}>Down Payment: <strong style={{ color: '#1e293b' }}>{downPct}% of {formatNPR(total)} = {formatNPR(downPctAmount)}</strong></div>}
            {form.remarks && <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: '#64748b' }}>Remarks: <strong style={{ color: '#1e293b' }}>{form.remarks}</strong></div>}

            {form.exchangeEnabled && form.exchangeItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>Exchange Goods</div>
                <table className="table">
                  <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Subtotal</th></tr></thead>
                  <tbody>
                    {form.exchangeItems.map((it, idx) => { const p = products.find(pr => pr._id === it.product); return (<tr key={idx}><td>{p?.name || '-'}</td><td className="text-right">{it.quantity}</td><td className="text-right">{formatNPR(it.price)}</td><td className="text-right">{formatNPR(it.price * it.quantity)}</td></tr>); })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '0.75rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.75rem', fontSize: '0.95rem' }}>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr auto', rowGap: '0.35rem', columnGap: '1rem' }}>
                <div>Product Total</div><div className="text-right">{formatNPR(inclusiveVat ? baseAmount : total)}</div>
                {vatAmount > 0 && <><div style={{ fontSize: '0.85rem' }}>VAT ({productTaxRate}%)</div><div className="text-right" style={{ fontSize: '0.85rem' }}>{formatNPR(vatAmount)}</div></>}
                {vatAmount > 0 && <><div style={{ fontWeight: 700 }}>Grand Total</div><div className="text-right" style={{ fontWeight: 700 }}>{formatNPR(total)}</div></>}
                {exch > 0 && <div style={{ gridColumn: '1 / -1', fontSize: '0.8rem', fontStyle: 'italic', color: '#64748b', margin: '0.35rem 0', padding: '0.5rem', background: '#f1f5f9', borderRadius: '6px' }}>Trade-in: {(form.exchangeItems || []).map(it => { const p = products.find(pr => pr._id === it.product); return `${p?.name || 'Item'} x ${it.quantity}`; }).join(', ')} = {formatNPR(exch)}</div>}
                <div style={{ fontWeight: 700 }}>Net Amount</div><div className="text-right" style={{ fontWeight: 700 }}>{formatNPR(net)}</div>

                <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Payment Split Breakdown</div>
                {exch > 0 && <><div style={{ paddingLeft: '0.5rem' }}>Exchange Credit</div><div className="text-right" style={{ color: '#16a34a' }}>{formatNPR(exch)}</div></>}
                {down > 0 && <><div style={{ paddingLeft: '0.5rem' }}>{form.downPaymentMethod === 'bank' ? 'Bank Transfer' : form.downPaymentMethod === 'qr' ? 'QR Payment' : 'Cash Down Payment'}</div><div className="text-right">{formatNPR(down)}</div></>}
                {remaining > 0 && <><div style={{ paddingLeft: '0.5rem', fontWeight: 600 }}>Bank EMI ({selectedBank?.name || '-'})</div><div className="text-right" style={{ fontWeight: 600, color: '#2563eb' }}>{formatNPR(remaining)}</div></>}

                <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>Bank Owes Shop (EMI Receivable)</div>
                <div className="text-right" style={{ fontWeight: 700, color: '#dc2626' }}>{formatNPR(remaining)}</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save EMI'}</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>EMI No.</th><th>Product</th><th>Customer</th>
                <th className="text-right">Total</th><th className="text-right">Exchange</th>
                <th className="text-right">Down Payment</th><th className="text-right">Bank EMI</th>
                <th>Bank</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i._id} onClick={() => setDetail(i)} style={{ cursor: 'pointer' }}>
                  <td>{formatDate(i.createdAt)}</td>
                  <td>{i.emiNumber}</td>
                  <td>{i.product?.name || '-'}</td>
                  <td>{i.customer?.name || '-'}</td>
                  <td className="text-right">{formatNPR(i.productTotal)}</td>
                  <td className="text-right">{i.exchangeEnabled ? formatNPR(i.exchangeAmount) : '-'}</td>
                  <td className="text-right">{formatNPR(i.downPayment)}</td>
                  <td className="text-right" style={{ fontWeight: 700, color: '#2563eb' }}>{i.remainingAmount > 0 ? formatNPR(i.remainingAmount) : '-'}</td>
                  <td>{i.bankName ? `EMI-(${i.bankName})` : '-'}</td>
                  <td><span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor(i.paidStatus), textTransform: 'capitalize' }}>{i.paidStatus || 'pending'}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm btn-secondary" onClick={() => printEmiRecord(i)}>Print</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan="11" className="text-center">No EMI records found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {exchangeModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', borderRadius: '12px 12px 0 0' }}>
              <div><h3 style={{ margin: 0, color: '#fff' }}>Trade-in Items</h3><p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', opacity: 0.85 }}>Add products the customer is exchanging</p></div>
              <button className="btn btn-sm" onClick={() => setExchangeModal(false)} style={{ color: '#fff', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 28, height: 28, fontSize: '1rem' }}>x</button>
            </div>
            <div className="modal-body" style={{ padding: '1.25rem' }}>
              <form onSubmit={saveExchangeItems}>
                {exchangeRows.map((row, i) => (
                  <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem', marginBottom: '0.65rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Item {i + 1}</span>
                      {exchangeRows.length > 1 && <button type="button" className="btn btn-sm btn-danger" onClick={() => removeExchangeRow(i)} style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem' }}>Remove</button>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 130px', gap: '0.5rem', alignItems: 'center' }}>
                      <SearchableSelect options={products.map(p => ({ value: p._id, label: `${p.name} (Cost: ${formatNPR(p.costPrice)})` }))} value={row.product} onChange={v => updateExchangeRow(i, 'product', v)} onAdd={(q) => { setNewProduct(prev => ({ ...prev, name: q })); setProductTarget(i); setProductModal(true); }} placeholder="Search product..." />
                      <input type="number" min="0" step="any" value={row.quantity} onChange={e => updateExchangeRow(i, 'quantity', e.target.value)} placeholder="Qty" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }} />
                      <input type="number" min="0" step="any" value={row.price} onChange={e => updateExchangeRow(i, 'price', e.target.value)} placeholder="Price" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }} />
                      <input type="text" value={row.serialNumber || ''} onChange={e => updateExchangeRow(i, 'serialNumber', e.target.value)} placeholder="Serial No." style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-sm btn-secondary" onClick={addExchangeRow} style={{ marginBottom: '1rem', borderStyle: 'dashed', width: '100%' }}>+ Add Another Item</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderTop: '2px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Total Exchange Value</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a' }}>{formatNPR(exchangeRows.reduce((s, r) => s + (parseFloat(r.price) || 0) * (parseFloat(r.quantity) || 0), 0))}</span>
                </div>
                <div className="modal-footer" style={{ borderTop: 'none', padding: 0 }}>
                  <button type="button" className="btn-cancel" onClick={() => setExchangeModal(false)} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}>Save Items</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {productModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header"><h3>Add New Product</h3><button className="btn btn-sm modal-close-x" onClick={() => setProductModal(false)}>x</button></div>
            <div className="modal-body">
              <form onSubmit={saveProductInline}>
                <div className="form-group"><label>Product Name *</label><input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Product name" autoFocus /></div>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group"><label>SKU</label><input value={newProduct.sku} onChange={e => setNewProduct({ ...newProduct, sku: e.target.value })} placeholder="Auto if empty" /></div>
                  <div className="form-group"><label>Unit</label><select value={newProduct.unit} onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })}><option value="pcs">pcs</option><option value="kg">kg</option><option value="liter">liter</option></select></div>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <SearchableSelect options={[{ value: '', label: 'None' }, { value: '__new__', label: '+ Add new...' }, ...categories.map(c => ({ value: c._id, label: c.name }))]} value={newProduct.category} onChange={v => setNewProduct({ ...newProduct, category: v })} onAdd={q => { setNewProduct({ ...newProduct, category: '' }); setNewCategoryName(q); }} placeholder="Search category..." />
                  {newProduct.category === '__new__' && <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="New category name" style={{ marginTop: '0.4rem' }} />}
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group"><label>Cost Price</label><input type="number" step="0.01" value={newProduct.costPrice} onChange={e => setNewProduct({ ...newProduct, costPrice: e.target.value })} /></div>
                  <div className="form-group"><label>Selling Price</label><input type="number" step="0.01" value={newProduct.sellingPrice} onChange={e => setNewProduct({ ...newProduct, sellingPrice: e.target.value })} /></div>
                  <div className="form-group"><label>Stock</label><input type="number" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} /></div>
                  <div className="form-group"><label>Min Stock</label><input type="number" value={newProduct.minStock} onChange={e => setNewProduct({ ...newProduct, minStock: e.target.value })} /></div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}><input type="checkbox" checked={newProduct.vatEnabled} onChange={e => setNewProduct({ ...newProduct, vatEnabled: e.target.checked, taxRate: e.target.checked ? (newProduct.taxRate || 13) : 0 })} />Apply VAT (13%)</label>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setProductModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={savingProduct}>{savingProduct ? 'Saving...' : 'Add Product'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {customerModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header"><h3>Add New Customer</h3><button className="btn btn-sm modal-close-x" onClick={() => setCustomerModal(false)}>x</button></div>
            <div className="modal-body">
              <form onSubmit={saveCustomerInline}>
                <div className="form-group"><label>Name *</label><input value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Customer name" autoFocus /></div>
                <div className="form-group"><label>Phone</label><input value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} /></div>
                <div className="form-group"><label>PAN</label><input value={newCustomer.pan} onChange={e => setNewCustomer({ ...newCustomer, pan: e.target.value })} /></div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setCustomerModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={savingCustomer}>{savingCustomer ? 'Saving...' : 'Add Customer'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {bankModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header"><h3>Add New Bank</h3><button className="btn btn-sm modal-close-x" onClick={() => setBankModal(false)}>x</button></div>
            <div className="modal-body">
              <form onSubmit={saveBankInline}>
                <div className="form-group"><label>Bank Name *</label><input value={newBank.name} onChange={e => setNewBank({ ...newBank, name: e.target.value })} placeholder="e.g. Nabil Bank" autoFocus /></div>
                <div className="form-group"><label>Account Number</label><input value={newBank.accountNumber} onChange={e => setNewBank({ ...newBank, accountNumber: e.target.value })} /></div>
                <div className="form-group"><label>Branch</label><input value={newBank.branch} onChange={e => setNewBank({ ...newBank, branch: e.target.value })} /></div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setBankModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={savingBank}>{savingBank ? 'Saving...' : 'Add Bank'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <EntryDetailsModal
          title={`EMI Record - ${detail.emiNumber}`}
          subtitle={detail.remarks ? `Remarks: ${detail.remarks}` : ''}
          meta={[
            { label: 'Date', value: formatDate(detail.createdAt) },
            { label: 'Product', value: detail.product?.name || '-' },
            { label: 'Customer', value: detail.customer?.name || '-' },
            { label: 'Bank', value: detail.bankName ? `EMI-(${detail.bankName})` : '-' },
            { label: 'Status', value: detail.paidStatus || 'pending' },
            { label: 'Cashier', value: detail.createdBy?.name || '-' },
          ]}
          columns={[
            { label: 'Particular', key: 'label' },
            { label: 'Amount', key: 'value', align: 'right', render: v => <strong>{formatNPR(v)}</strong> },
          ]}
          rows={[
            { label: 'Product Total', value: detail.productTotal },
            ...(detail.exchangeEnabled ? [{ label: 'Exchange Amount', value: detail.exchangeAmount }] : []),
            ...(detail.downPaymentPercent ? [{ label: `Down Payment (${detail.downPaymentPercent}%)`, value: detail.downPayment }] : [{ label: 'Down Payment', value: detail.downPayment }]),
            { label: 'Bank EMI Receivable', value: detail.remainingAmount },
          ]}
          footer={[
            { label: 'Remaining Balance', value: detail.remainingAmount, render: v => formatNPR(v) },
          ]}
          actions={<>
            {detail && detail.disbursementStatus !== 'disbursed' && (detail.remainingAmount || 0) > 0 && (
              <button className="btn btn-sm btn-primary" onClick={() => { setDisburseForm({ amount: String(detail.remainingAmount), bankCharge: 0, disbursingBank: '' }); setDisburseModal(true); }}>Record Bank Disbursement</button>
            )}
            {detail && detail.disbursementStatus === 'disbursed' && (
              <span className="text-success" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Disbursed: {formatNPR(detail.disbursedAmount)}{detail.bankCharge ? ` (Charge ${formatNPR(detail.bankCharge)})` : ''}</span>
            )}
            <button className="btn btn-sm btn-secondary" onClick={() => printEmiRecord(detail)}>EMI Print</button>
          </>}
          onClose={() => setDetail(null)}
        />
      )}

      {disburseModal && detail && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header"><h3>Record Bank Disbursement</h3><button className="btn btn-sm modal-close-x" onClick={() => setDisburseModal(false)}>x</button></div>
            <div className="modal-body">
              <form onSubmit={handleDisburse}>
                <div className="form-group"><label>Financed Amount (EMI {detail.emiNumber})</label><input type="text" value={formatNPR(detail.remainingAmount)} readOnly /></div>
                <div className="form-group"><label>Amount Received from Bank *</label><input type="number" min="0" step="any" value={disburseForm.amount} onChange={e => setDisburseForm({ ...disburseForm, amount: e.target.value })} /></div>
                <div className="form-group"><label>Bank Charge / Fee (optional)</label><input type="number" min="0" step="any" value={disburseForm.bankCharge} onChange={e => setDisburseForm({ ...disburseForm, bankCharge: e.target.value })} /></div>
                <div className="form-group">
                  <label>Disbursing Bank (Our Account)</label>
                  <SearchableSelect options={banks.map(b => ({ value: b._id, label: b.accountNumber ? `${b.name} (${b.accountNumber})` : b.name }))} value={disburseForm.disbursingBank} onChange={v => setDisburseForm({ ...disburseForm, disbursingBank: v })} onAdd={(q) => { setNewBank(prev => ({ ...prev, name: q })); setBankModalTarget('disburse'); setBankModal(true); }} placeholder="Our bank account..." />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setDisburseModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={savingDisburse}>{savingDisburse ? 'Saving...' : 'Record Disbursement'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
