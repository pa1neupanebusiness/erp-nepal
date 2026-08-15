import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useToast } from '../UI/Toast';
import SearchableSelect from '../UI/SearchableSelect';
import { printInvoice } from '../POS/PrintInvoice';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

const BS_MONTHS = ['Bai', 'Jes', 'Asa', 'Shr', 'Bha', 'Ash', 'Kar', 'Man', 'Pou', 'Mag', 'Fal', 'Cha'];

const emptyRow = () => ({ product: '', name: '', sku: '', qty: 1, rate: '', taxRate: 0, priceIncludesTax: false });

const Icons = {
  back: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  search: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  plus: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  trash: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>,
  upload: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  printer: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  check: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  zap: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
};

export default function CreateSalesInvoice() {
  const navigate = useNavigate();
  const addToast = useToast();

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cashSale, setCashSale] = useState(true);
  const [customer, setCustomer] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(adToBsStr(new Date()));
  const [rows, setRows] = useState([emptyRow()]);
  const [discountValue, setDiscountValue] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountMode, setDiscountMode] = useState('amount');
  const [applyVat, setApplyVat] = useState(false);
  const [inclusiveVat, setInclusiveVat] = useState(false);
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [bank, setBank] = useState('');
  const [banks, setBanks] = useState([]);
  const [amountPaid, setAmountPaid] = useState('');
  const [splits, setSplits] = useState([{ method: 'cash', amount: 0, bank: '' }]);
  const [saving, setSaving] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [pendingCustomerName, setPendingCustomerName] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '', pan: '' });

  const [productModalRow, setProductModalRow] = useState(null);
  const [pendingProductName, setPendingProductName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProduct, setNewProduct] = useState({ name: '', category: '', costPrice: '', sellingPrice: '', stock: 0, minStock: 5, unit: 'pcs', taxRate: 13, vatEnabled: false, priceIncludesTax: false });

  useEffect(() => {
    Promise.all([
      api.get('/products').then(r => r.data),
      api.get('/customers').then(r => r.data),
      api.get('/categories').then(r => r.data),
      api.get('/company').then(r => r.data).catch(() => null),
    ]).then(([p, c, cats, comp]) => {
      setProducts(p); setCustomers(c); setCategories(cats); setCompany(comp);
    }).finally(() => setLoading(false));
    api.get('/banks').then(r => setBanks(r.data)).catch(() => {});
  }, []);

  const bsDate = useMemo(() => {
    try {
      if (!invoiceDate) return '';
      const parts = invoiceDate.split('-');
      if (parts.length !== 3) return '';
      const y = parts[0], m = parseInt(parts[1], 10) || 1, d = parts[2];
      return `${y} ${BS_MONTHS[m - 1] || ''} ${d}`;
    } catch { return ''; }
  }, [invoiceDate]);

  const adDateStr = useMemo(() => {
    try { return bsToADStr(invoiceDate); } catch { return ''; }
  }, [invoiceDate]);

  const productOptions = useMemo(() => products.map(p => ({
    value: p._id,
    label: p.name,
    subLabel: `${p.sku} | Stock ${p.stock} | ${formatMoney(p.sellingPrice)}`,
  })), [products]);

  const customerOptions = useMemo(() => customers.map(c => ({
    value: c._id,
    label: c.name,
    subLabel: c.phone || c.address || '',
  })), [customers]);

  const pickProduct = (rowIdx, productId, option) => {
    const p = (option && option.sellingPrice !== undefined) ? option : products.find(x => x._id === productId);
    setRows(prev => prev.map((r, i) => i === rowIdx ? {
      ...r,
      product: productId,
      name: p?.name || '',
      sku: p?.sku || '',
      rate: p?.sellingPrice !== undefined ? p.sellingPrice : r.rate,
      taxRate: p?.taxRate || 0,
      priceIncludesTax: p?.priceIncludesTax || false,
      vatEnabled: p?.vatEnabled !== undefined ? p.vatEnabled : (p?.taxRate || 0) > 0,
      costPrice: p?.costPrice || 0,
      unit: p?.unit || 'pcs',
    } : r));
  };

  const updateRow = (rowIdx, field, value) => {
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (rowIdx) => {
    if (rows.length === 1) return;
    setRows(prev => prev.filter((_, i) => i !== rowIdx));
  };

  const tabAddRow = (rowIdx) => (e) => {
    if (e.key !== 'Tab') return;
    if (rowIdx !== rows.length - 1) return;
    const lastRow = rows[rowIdx];
    const isEmpty = !lastRow.product && (!lastRow.rate || parseFloat(lastRow.rate) === 0) && (!lastRow.qty || parseInt(lastRow.qty) <= 1);
    if (isEmpty) {
      e.preventDefault();
      const firstInput = document.querySelector('.invoice-items tbody tr:last-child td:nth-child(2) input');
      if (firstInput) firstInput.focus();
      return;
    }
    e.preventDefault();
    addRow();
    setTimeout(() => {
      const newRow = document.querySelector('.invoice-items tbody tr:last-child');
      const input = newRow && newRow.querySelector('td:nth-child(2) input');
      if (input) input.focus();
    }, 0);
  };

  const lineAmount = (r) => (parseFloat(r.rate) || 0) * (parseInt(r.qty) || 0);
  const discountedLineTax = (r, discountRatio) => {
    const discounted = Math.round((lineAmount(r) * (1 - discountRatio)) * 100) / 100;
    let rate = 0;
    if ((applyVat || inclusiveVat)) rate = r.taxRate || 13;
    if (!rate) return 0;
    const isInclusive = r.priceIncludesTax || inclusiveVat;
    const tax = isInclusive ? (discounted * rate) / (100 + rate) : (discounted * rate) / 100;
    return Math.round(tax * 100) / 100;
  };
  const discountedLineBase = (r, discountRatio) => {
    const discounted = Math.round((lineAmount(r) * (1 - discountRatio)) * 100) / 100;
    let rate = 0;
    if ((applyVat || inclusiveVat)) rate = r.taxRate || 13;
    const isInclusive = r.priceIncludesTax || inclusiveVat;
    return isInclusive ? Math.round((discounted - discountedLineTax(r, discountRatio)) * 100) / 100 : discounted;
  };

  const totalBeforeDiscountRaw = rows.reduce((s, r) => s + lineAmount(r), 0);
  const vatRate = (rows[0]?.taxRate || 13);
  const totalBeforeDiscount = inclusiveVat && vatRate > 0
    ? Math.round(totalBeforeDiscountRaw / (1 + vatRate / 100) * 100) / 100
    : totalBeforeDiscountRaw;
  let discount = Math.round((parseFloat(discountValue) || 0) * 100) / 100;
  const discountRatio = totalBeforeDiscount > 0 ? discount / totalBeforeDiscount : 0;
  const netAmount = Math.max(0, totalBeforeDiscount - discount);
  const subtotal = rows.reduce((s, r) => s + discountedLineBase(r, discountRatio), 0);
  const taxTotal = rows.reduce((s, r) => s + discountedLineTax(r, discountRatio), 0);
  const grandTotal = inclusiveVat ? Math.round((netAmount + taxTotal) * 100) / 100 : Math.max(0, netAmount + taxTotal);
  const paid = parseFloat(amountPaid) || grandTotal;
  const change = Math.max(0, paid - grandTotal);

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    addImages(files);
  };

  const addImages = (files) => {
    const readers = files.map(f => new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.readAsDataURL(f);
    }));
    Promise.all(readers).then(urls => setImages(prev => [...prev, ...urls]));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addImages(Array.from(e.dataTransfer?.files || []));
  };

  const openCustomerModal = (name) => {
    setPendingCustomerName(name);
    setNewCustomer({ name, phone: '', email: '', address: '', pan: '' });
    setShowCustomerModal(true);
  };

  const saveCustomer = async () => {
    if (!newCustomer.name.trim()) return;
    try {
      const { data } = await api.post('/customers', newCustomer);
      const updated = [...customers, data];
      setCustomers(updated);
      setCustomer(data._id);
      setShowCustomerModal(false);
      addToast('Customer added', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to add customer', 'error');
    }
  };

  const openProductModal = (rowIdx, name) => {
    setProductModalRow(rowIdx);
    setPendingProductName(name);
    setNewProduct({ name, category: '', costPrice: '', sellingPrice: '', stock: 0, minStock: 5, unit: 'pcs', taxRate: 13, vatEnabled: false, priceIncludesTax: false });
    setNewCategoryName('');
    setShowCustomerModal(false);
  };

  const saveProduct = async () => {
    if (!newProduct.name.trim()) return;
    let category = newProduct.category;
    try {
      if (newCategoryName.trim() && !category) {
        const { data } = await api.post('/categories', { name: newCategoryName.trim() });
        category = data._id;
        setCategories(prev => [...prev, data]);
      }
      const payload = {
        ...newProduct,
        category: category || null,
        costPrice: parseFloat(newProduct.costPrice) || 0,
        sellingPrice: parseFloat(newProduct.sellingPrice) || 0,
        stock: parseFloat(newProduct.stock) || 0,
        minStock: parseFloat(newProduct.minStock) || 5,
      };
      const { data } = await api.post('/products', payload);
      setProducts(prev => [...prev, data]);
      pickProduct(productModalRow, data._id, data);
      setProductModalRow(null);
      addToast('Product added', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to add product', 'error');
    }
  };

  const handleSave = async (andPrint = false) => {
    const validRows = rows.filter(r => r.product && (parseFloat(r.rate) > 0 || lineAmount(r) > 0));
    if (validRows.length === 0) {
      addToast('Add at least one billing item', 'error');
      return;
    }
    if ((paymentMethod === 'qr' || paymentMethod === 'bank') && !bank) {
      addToast('Please choose a bank for this payment', 'error');
      return;
    }
    if (paymentMethod === 'split') {
      const totalSplit = splits.reduce((s, sp) => s + (sp.amount || 0), 0);
      if (Math.abs(totalSplit - grandTotal) > 0.01) {
        addToast(`Split total (${formatMoney(totalSplit)}) must equal grand total (${formatMoney(grandTotal)})`, 'error');
        return;
      }
      const hasBank = splits.find(sp => (sp.method === 'qr' || sp.method === 'bank') && !sp.bank);
      if (hasBank) {
        addToast('Please choose a bank for QR/Bank split payments', 'error');
        return;
      }
    }
    const totalPaid = paymentMethod === 'split'
      ? splits.reduce((s, sp) => s + (sp.amount || 0), 0)
      : Math.round(paid * 100) / 100;
    const dueAmount = Math.max(0, grandTotal - totalPaid);
    if (!customer && dueAmount > 0) {
      addToast('A customer name is required when there is a due amount.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        items: validRows.map(r => ({
          product: r.product,
          quantity: parseInt(r.qty) || 1,
          price: parseFloat(r.rate) || 0,
          costPrice: r.costPrice || 0,
          tax: discountedLineTax(r, discountRatio),
          subtotal: Math.round((lineAmount(r)) * 100) / 100,
        })),
        subtotal: Math.round(subtotal * 100) / 100,
        taxTotal: Math.round(taxTotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        grandTotal: Math.round(grandTotal * 100) / 100,
        amountPaid: totalPaid,
        change: Math.max(0, totalPaid - grandTotal),
        paymentMethod,
        paymentSplits: paymentMethod === 'split' ? splits.filter(sp => sp.amount > 0) : undefined,
        bank: (paymentMethod === 'qr' || paymentMethod === 'bank') ? bank : null,
        customer: customer || null,
        invoiceNumber: invoiceNo.trim() || undefined,
        date: bsToADStr(invoiceDate),
        notes,
        images,
        source: 'invoice',
        inclusiveVat: inclusiveVat && applyVat,
      };
      const { data } = await api.post('/sales', payload);
      setLastSale(data);
      setRows([emptyRow()]);
      setImages([]);
      setNotes('');
      setInvoiceNo('');
      setDiscountValue(0);
      setApplyVat(false);
      setInclusiveVat(false);
      setAmountPaid('');
      setBank('');
      setPaymentMethod('cash');
      setSplits([{ method: 'cash', amount: 0, bank: '' }]);
      if (andPrint) {
        printInvoice(data, company);
        addToast(`Invoice ${data.invoiceNumber} created`, 'success');
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => navigate('/sales')} style={{ padding: '0.375rem', color: '#64748b', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex' }}>{Icons.back}</button>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Create Sales Invoice</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => navigate('/sales')} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => handleSave(false)} disabled={saving} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#334155', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Draft'}</button>
          <button onClick={() => handleSave(true)} disabled={saving} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{Icons.printer}<span>{saving ? 'Saving...' : 'Save & Print'}</span></button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Invoice Details */}
        <section style={{ background: '#fff', padding: '1.5rem', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>Invoice Details</h2>
            <button onClick={() => { setCustomer(''); setCashSale(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer' }}>{Icons.zap}<span>Cash Sale (Walk-in)</span></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Party / Customer</label>
              <div style={{ position: 'relative' }}>
                <SearchableSelect options={customerOptions} value={customer} onChange={v => { setCustomer(v || ''); setCashSale(!v); }} onAdd={openCustomerModal} placeholder="Type party name to search, or type new to add..." style={{ width: '100%' }} inputStyle={{ padding: '0.5rem 0.75rem 0.5rem 2.5rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', width: '100%' }} />
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>{Icons.search}</span>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice No.</label>
              <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Auto-generated" disabled style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, color: '#94a3b8', cursor: 'not-allowed' }} />
            </div>
            <div style={{ gridColumn: 'span 3' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice Date (AD)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <NepaliDatePicker value={invoiceDate} onChange={setInvoiceDate} style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem' }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, whiteSpace: 'nowrap' }}>{bsDate} BS</span>
              </div>
            </div>
          </div>
        </section>

        {/* Billing Items */}
        <section style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafbfc' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>Billing Items</h2>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Press <kbd style={{ padding: '0.125rem 0.375rem', background: '#e2e8f0', color: '#475569', borderRadius: 4, fontSize: '0.625rem' }}>Tab</kbd> to jump between fields</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="invoice-items" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafbfc', fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '0.75rem 1rem', width: 48, textAlign: 'center' }}>S.N.</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Item Details</th>
                  <th style={{ padding: '0.75rem 1rem', width: 112, textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '0.75rem 1rem', width: 144, textAlign: 'right' }}>Rate (Rs.)</th>
                  <th style={{ padding: '0.75rem 1rem', width: 144, textAlign: 'right' }}>Amount (Rs.)</th>
                  <th style={{ padding: '0.75rem 1rem', width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#94a3b8', fontWeight: 500 }}>{idx + 1}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <SearchableSelect options={productOptions} value={r.product} onChange={v => pickProduct(idx, v)} onAdd={(name) => openProductModal(idx, name)} placeholder="Search item name or scan barcode..." style={{ minWidth: 200 }} inputStyle={{ padding: '0.375rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', width: '100%' }} />
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <input type="number" min="1" value={r.qty} onChange={e => updateRow(idx, 'qty', e.target.value)} style={{ width: '100%', padding: '0.375rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', textAlign: 'center' }} />
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <input type="number" min="0" step="0.01" value={r.rate} onChange={e => updateRow(idx, 'rate', e.target.value)} onKeyDown={tabAddRow(idx)} style={{ width: '100%', padding: '0.375rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{formatMoney(lineAmount(r))}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <button onClick={() => removeRow(idx)} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4 }} onMouseEnter={e => e.target.style.color = '#ef4444'} onMouseLeave={e => e.target.style.color = '#94a3b8'}>{Icons.trash}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>
            <button onClick={addRow} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem 0.75rem', borderRadius: 8 }}>{Icons.plus}<span>Add Line Item</span></button>
          </div>
        </section>

        {/* Bottom Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left: Notes & Attachments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: '#fff', padding: '1.25rem', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes / Remarks</label>
              <textarea rows="3" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter notes or terms visible to customer..." style={{ width: '100%', padding: '0.75rem', fontSize: '0.875rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, resize: 'none' }} />
            </div>
            <div style={{ background: '#fff', padding: '1.25rem', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Attach Documents</label>
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} onClick={() => document.getElementById('invoice-attachments')?.click()} style={{ border: `2px dashed ${dragOver ? '#2563eb' : '#cbd5e1'}`, borderRadius: 8, padding: '1.5rem', textAlign: 'center', background: '#fafbfc', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                <div style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>{Icons.upload}</div>
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: '#475569' }}>Click to upload or drag & drop</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>PNG, JPG, or PDF up to 10MB</p>
              </div>
              <input id="invoice-attachments" type="file" multiple accept="image/*,.pdf" onChange={handleImageChange} style={{ display: 'none' }} />
              {images.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                  {images.map((img, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={img} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      <button onClick={() => setImages(prev => prev.filter((_, x) => x !== i))} style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Summary & Payment */}
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>Summary & Payment</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Subtotal</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatMoney(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Discount</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', width: 160 }}>
                  <input type="number" min="0" value={discountMode === 'amount' ? discountValue : discountPercent} onChange={e => { const v = e.target.value; if (discountMode === 'amount') { setDiscountValue(v); setDiscountPercent(totalBeforeDiscount ? ((parseFloat(v) || 0) / totalBeforeDiscount * 100).toFixed(2) : ''); } else { setDiscountPercent(v); setDiscountValue(((parseFloat(v) || 0) / 100 * totalBeforeDiscount).toFixed(2)); } }} style={{ flex: 1, padding: '0.25rem 0.5rem', textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }} />
                  <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 600 }}>
                    <button onClick={() => setDiscountMode('percent')} style={{ padding: '0.125rem 0.5rem', background: discountMode === 'percent' ? '#fff' : 'transparent', color: discountMode === 'percent' ? '#0f172a' : '#64748b', border: 'none', borderRadius: 4, cursor: 'pointer' }}>%</button>
                    <button onClick={() => setDiscountMode('amount')} style={{ padding: '0.125rem 0.5rem', background: discountMode === 'amount' ? '#fff' : 'transparent', color: discountMode === 'amount' ? '#0f172a' : '#64748b', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Rs</button>
                  </div>
                </div>
              </div>
              <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={applyVat} onChange={e => { setApplyVat(e.target.checked); if (!e.target.checked) setInclusiveVat(false); }} style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#334155' }}>Add VAT (13%)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                  <input type="checkbox" checked={inclusiveVat} onChange={e => setInclusiveVat(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Inclusive VAT (prices include 13%)</span>
                </label>
              </div>
              <div style={{ paddingTop: '1rem', borderTop: '2px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Net Amount</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb' }}>{formatMoney(grandTotal)}</span>
              </div>
              <div style={{ paddingTop: '1rem', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Payment Mode</label>
                  <select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); if (e.target.value !== 'qr' && e.target.value !== 'bank') setBank(''); if (e.target.value === 'split') setSplits([{ method: 'cash', amount: 0, bank: '' }]); }} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                    <option value="cash">Cash</option>
                    <option value="qr">QR / Mobile Banking</option>
                    <option value="bank">Bank Transfer / Fonepay</option>
                    <option value="credit">Credit / Cheque</option>
                    <option value="split">Split Payment</option>
                  </select>
                </div>
                {paymentMethod === 'split' && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem', background: '#f8fafc' }}>
                    {splits.map((sp, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <select value={sp.method} onChange={e => { const next = [...splits]; next[idx] = { ...next[idx], method: e.target.value, bank: '' }; setSplits(next); }} style={{ flex: 1, padding: '0.375rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}>
                          <option value="cash">Cash</option><option value="qr">QR</option><option value="bank">Bank</option><option value="credit">Credit</option>
                        </select>
                        <input type="number" value={sp.amount || ''} onChange={e => { const next = [...splits]; next[idx] = { ...next[idx], amount: parseFloat(e.target.value) || 0 }; setSplits(next); }} placeholder="Amount" style={{ flex: 1, padding: '0.375rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', textAlign: 'right' }} />
                        {(sp.method === 'qr' || sp.method === 'bank') && (
                          <select value={sp.bank} onChange={e => { const next = [...splits]; next[idx] = { ...next[idx], bank: e.target.value }; setSplits(next); }} style={{ flex: 1, padding: '0.375rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}>
                            <option value="">-- Bank --</option>{banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                          </select>
                        )}
                        {splits.length > 1 && <button onClick={() => setSplits(splits.filter((_, i) => i !== idx))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}>×</button>}
                      </div>
                    ))}
                    <button onClick={() => setSplits([...splits, { method: 'cash', amount: 0, bank: '' }])} style={{ fontSize: '0.8rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add Split</button>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 600, color: Math.abs(splits.reduce((s, sp) => s + (sp.amount || 0), 0) - grandTotal) < 0.01 ? '#16a34a' : '#dc2626' }}>
                      Split Total: {formatMoney(splits.reduce((s, sp) => s + (sp.amount || 0), 0))} / {formatMoney(grandTotal)}
                    </div>
                  </div>
                )}
                {(paymentMethod === 'qr' || paymentMethod === 'bank') && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Choose Bank</label>
                    <select value={bank} onChange={e => setBank(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                      <option value="">-- Select Bank --</option>
                      {banks.map(b => <option key={b._id} value={b._id}>{b.name}{b.accountNumber ? ` (${b.accountNumber})` : ''}</option>)}
                    </select>
                  </div>
                )}
                {paymentMethod !== 'split' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Amount Paid</label>
                    <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder={formatMoney(grandTotal)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky Footer */}
      <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e2e8f0', boxShadow: '0 -2px 8px rgba(0,0,0,0.06)', padding: '0.75rem 1.5rem', zIndex: 20 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Status: <span style={{ fontWeight: 500, color: '#d97706', background: '#fffbeb', padding: '0.125rem 0.5rem', borderRadius: 4, border: '1px solid #fde68a' }}>Draft</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => handleSave(false)} disabled={saving} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Draft'}</button>
            <button onClick={() => handleSave(true)} disabled={saving} style={{ padding: '0.5rem 1.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{Icons.check}<span>{saving ? 'Saving...' : 'Save & Print Invoice'}</span></button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {showCustomerModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header"><h3>Add New Customer</h3><button className="btn btn-sm modal-close-x" onClick={() => setShowCustomerModal(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Name *</label><input type="text" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group"><label>Phone</label><input type="text" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group"><label>Email</label><input type="email" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group"><label>Address</label><input type="text" value={newCustomer.address} onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group"><label>PAN</label><input type="text" value={newCustomer.pan} onChange={e => setNewCustomer({ ...newCustomer, pan: e.target.value })} style={{ width: '100%' }} /></div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCustomerModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveCustomer}>Add Customer</button></div>
          </div>
        </div>
      )}

      {productModalRow !== null && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header"><h3>Add New Product</h3><button className="btn btn-sm modal-close-x" onClick={() => setProductModalRow(null)}>×</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Name *</label><input type="text" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group">
                <label>Category</label>
                <SearchableSelect options={categories.map(c => ({ value: c._id, label: c.name }))} value={newProduct.category} onChange={v => { setNewProduct({ ...newProduct, category: v }); setNewCategoryName(''); }} onAdd={q => { setNewProduct({ ...newProduct, category: '' }); setNewCategoryName(q); }} placeholder="Select or type new..." style={{ width: '100%' }} inputStyle={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem', width: '100%' }} />
                <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Or type a new category name" style={{ width: '100%', marginTop: '0.375rem' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group"><label>Cost Price</label><input type="number" value={newProduct.costPrice} onChange={e => setNewProduct({ ...newProduct, costPrice: e.target.value })} style={{ width: '100%' }} /></div>
                <div className="form-group"><label>Selling Price *</label><input type="number" value={newProduct.sellingPrice} onChange={e => setNewProduct({ ...newProduct, sellingPrice: e.target.value })} style={{ width: '100%' }} /></div>
                <div className="form-group"><label>Opening Stock</label><input type="number" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} style={{ width: '100%' }} /></div>
                <div className="form-group"><label>Unit</label><input type="text" value={newProduct.unit} onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })} style={{ width: '100%' }} /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginTop: '0.375rem' }}>
                <input type="checkbox" checked={newProduct.vatEnabled} onChange={e => setNewProduct({ ...newProduct, vatEnabled: e.target.checked, taxRate: e.target.checked ? (newProduct.taxRate || 13) : 0 })} />
                Apply VAT (13%) to this product
              </label>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setProductModalRow(null)}>Cancel</button><button className="btn btn-primary" onClick={saveProduct}>Add Product</button></div>
          </div>
        </div>
      )}

      {lastSale && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div className="modal-header"><h3>Success</h3><button className="btn btn-sm modal-close-x" onClick={() => setLastSale(null)}>×</button></div>
            <div className="modal-body">
              <div style={{ fontSize: '2rem', color: '#16a34a' }}>✓</div>
              <h3>Invoice {lastSale.invoiceNumber} created!</h3>
              <p className="text-muted">Total: {formatMoney(lastSale.grandTotal)}</p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => { setLastSale(null); navigate('/sales'); }}>View Sales</button>
              <button className="btn btn-primary" onClick={() => printInvoice(lastSale, company)}>Print Invoice</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function formatMoney(n) {
    return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  }
}
