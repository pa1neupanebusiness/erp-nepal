import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useToast } from '../UI/Toast';
import SearchableSelect from '../UI/SearchableSelect';
import { printInvoice } from '../POS/PrintInvoice';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

const BS_MONTHS = ['Bai', 'Jes', 'Asa', 'Shr', 'Bha', 'Ash', 'Kar', 'Man', 'Pou', 'Mag', 'Fal', 'Cha'];

const emptyRow = () => ({ product: '', name: '', sku: '', qty: 1, rate: '', taxRate: 0, priceIncludesTax: false });

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
    const p = (option && option.sellingPrice !== undefined)
      ? option
      : products.find(x => x._id === productId);
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

  const lineAmount = (r) => {
    return (parseFloat(r.rate) || 0) * (parseInt(r.qty) || 0);
  };
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

  const totalBeforeDiscount = rows.reduce((s, r) => s + lineAmount(r), 0);
  let discount = Math.round((parseFloat(discountValue) || 0) * 100) / 100;
  const discountRatio = totalBeforeDiscount > 0 ? discount / totalBeforeDiscount : 0;
  const netAmount = Math.max(0, totalBeforeDiscount - discount);
  const subtotal = rows.reduce((s, r) => s + discountedLineBase(r, discountRatio), 0);
  const taxTotal = rows.reduce((s, r) => s + discountedLineTax(r, discountRatio), 0);
  const grandTotal = inclusiveVat ? netAmount : Math.max(0, netAmount + taxTotal);
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
    setSaving(true);
    try {
      const totalPaid = paymentMethod === 'split'
        ? splits.reduce((s, sp) => s + (sp.amount || 0), 0)
        : Math.round(paid * 100) / 100;
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

  const input = { padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem', width: '100%' };
  const fieldLabel = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
  const card = { background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '1.25rem' };

  const backIcon = (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>);
  const plusIcon = (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>);
  const trashIcon = (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>);
  const paperclipIcon = (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>);
  const printIcon = (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>);
  const saveIcon = (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>);
  const buildingIcon = (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" /></svg>);
  const calendarIcon = (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>);

  if (loading) return <div className="text-muted" style={{ padding: '2rem' }}>Loading...</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* ── Sticky Top Bar ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => navigate('/sales')} title="Back to Sales" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer' }}>{backIcon}</button>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Create Sales Invoice</h1>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Fill in the details and save the invoice</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/sales')}>Cancel</button>
            <button className="btn btn-primary" onClick={() => handleSave(false)} disabled={saving}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>{saveIcon}{saving ? 'Saving...' : 'Save Draft'}</span>
            </button>
            <button className="btn btn-primary" style={{ background: '#0f172a', borderColor: '#0f172a' }} onClick={() => handleSave(true)} disabled={saving}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>{printIcon}{saving ? 'Saving...' : 'Save & Print'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.25rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '1.25rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
          {/* Invoice Details */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ color: '#0f172a', display: 'inline-flex' }}>{buildingIcon}</span>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Invoice Details</h3>
              <div style={{ flex: 1 }} />
              <button
                className={`btn btn-sm ${!customer ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCustomer('')}
              >Cash Sale (Walk-in)</button>
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label style={fieldLabel}>Party</label>
                <SearchableSelect
                  options={customerOptions}
                  value={customer}
                  onChange={v => setCustomer(v || '')}
                  onAdd={openCustomerModal}
                  placeholder="Type party name to search, or type a new name to add..."
                  style={{ minWidth: 180 }}
                  inputStyle={input}
                />
                {!customer && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>Leave empty for walk-in cash sale.</div>}
              </div>
              <div className="form-group">
                <label style={fieldLabel}>Invoice No</label>
                <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Auto" style={input} />
              </div>
              <div className="form-group">
                <label style={fieldLabel}>Invoice Date (BS)</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', display: 'inline-flex' }}>{calendarIcon}</span>
                  <NepaliDatePicker value={invoiceDate} onChange={setInvoiceDate} style={{ ...input, width: '100%' }} />
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ ...input, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{bsDate}</span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>BS (Nepali){adDateStr ? ` · ${adDateStr} AD` : ''}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Billing Items */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Billing Items</h3>
              <button className="btn btn-sm btn-secondary" onClick={addRow}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>{plusIcon}Add Billing Item</span>
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="invoice-items" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', width: 42 }}>S.N.</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Item Details</th>
                    <th style={{ width: 90, padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Qty</th>
                    <th style={{ width: 120, padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Rate</th>
                    <th style={{ width: 120, padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
                    <th style={{ width: 42, borderBottom: '1px solid #e2e8f0' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '0.4rem', color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                      <td style={{ padding: '0.4rem', minWidth: 200 }}>
                        <SearchableSelect
                          options={productOptions}
                          value={r.product}
                          onChange={v => pickProduct(idx, v)}
                          onAdd={(name) => openProductModal(idx, name)}
                          placeholder="Type item name or add new..."
                          style={{ minWidth: 180 }}
                          inputStyle={input}
                        />
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <input type="number" min="1" value={r.qty} onChange={e => updateRow(idx, 'qty', e.target.value)} style={{ ...input, textAlign: 'center' }} />
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <input type="number" min="0" step="0.01" value={r.rate} onChange={e => updateRow(idx, 'rate', e.target.value)} onKeyDown={tabAddRow(idx)} style={{ ...input, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{formatMoney(lineAmount(r))}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                        <button
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                          onClick={() => removeRow(idx)}
                          title="Remove item"
                        >{trashIcon}</button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan="6" style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>No billing items. Click "Add Billing Item" to begin.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes + Attach Documents */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div style={card}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Notes or Remarks</h3>
              <textarea rows="4" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter note or description..." style={{ ...input, resize: 'vertical' }} />
            </div>
            <div style={card}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Attach Documents</h3>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                style={{
                  border: '2px dashed ' + (dragOver ? '#0f172a' : '#cbd5e1'),
                  borderRadius: 10,
                  padding: '1.25rem',
                  textAlign: 'center',
                  background: dragOver ? '#f8fafc' : '#fafbfc',
                  color: '#64748b',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onClick={() => document.getElementById('invoice-attachments')?.click()}
              >
                <div style={{ display: 'inline-flex', color: '#94a3b8', marginBottom: '0.4rem' }}>{paperclipIcon}</div>
                <div>Drag & drop images here, or <strong style={{ color: '#0f172a' }}>browse</strong></div>
                <div style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>PNG, JPG up to 5MB each</div>
              </div>
              <input id="invoice-attachments" type="file" multiple accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                {images.map((img, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={img} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <button
                      style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 11, cursor: 'pointer', lineHeight: 1 }}
                      onClick={() => setImages(prev => prev.filter((_, x) => x !== i))}
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Summary & Payment ── */}
        <div style={{ position: 'sticky', top: '4.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ ...card, background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#fff', border: 'none' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.7, marginBottom: '0.35rem' }}>Net Amount</div>
            <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>{formatMoney(grandTotal)}</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 4 }}>{bsDate} BS{adDateStr ? ` · ${adDateStr} AD` : ''}</div>
            <div style={{ marginTop: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.8 }}>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ opacity: 0.8 }}>Discount</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.25)' }}>
                    <button
                      onClick={() => setDiscountMode('amount')}
                      style={{ background: discountMode === 'amount' ? 'rgba(255,255,255,0.2)' : 'transparent', color: '#fff', border: 'none', padding: '0.2rem 0.45rem', fontSize: '0.7rem', cursor: 'pointer' }}
                    >Rs</button>
                    <button
                      onClick={() => setDiscountMode('percent')}
                      style={{ background: discountMode === 'percent' ? 'rgba(255,255,255,0.2)' : 'transparent', color: '#fff', border: 'none', padding: '0.2rem 0.45rem', fontSize: '0.7rem', cursor: 'pointer' }}
                    >%</button>
                  </div>
                  {discountMode === 'amount' ? (
                    <input type="number" min="0" placeholder="Rs" value={discountValue} onChange={e => { const v = parseFloat(e.target.value) || 0; setDiscountValue(e.target.value); setDiscountPercent(totalBeforeDiscount ? ((v / totalBeforeDiscount) * 100).toFixed(2) : ''); }} style={{ width: 70, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '0.15rem 0.3rem', fontSize: '0.8rem', textAlign: 'right' }} />
                  ) : (
                    <input type="number" min="0" placeholder="%" value={discountPercent} onChange={e => { const p = parseFloat(e.target.value) || 0; setDiscountPercent(e.target.value); setDiscountValue(((p / 100) * totalBeforeDiscount).toFixed(2)); }} style={{ width: 56, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '0.15rem 0.3rem', fontSize: '0.8rem', textAlign: 'right' }} />
                  )}
                </div>
              </div>
              {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.8 }}>After Discount</span><span>{formatMoney(netAmount)}</span></div>}
              {taxTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.8 }}>VAT</span><span>{formatMoney(taxTotal)}</span></div>}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: '0.25rem', paddingTop: '0.65rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', color: '#e2e8f0' }}>
                  <input type="checkbox" checked={applyVat} onChange={e => { setApplyVat(e.target.checked); if (!e.target.checked) setInclusiveVat(false); }} style={{ width: 15, height: 15 }} />
                  Add VAT (13%)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', color: '#e2e8f0', marginTop: '0.4rem' }}>
                  <input type="checkbox" checked={inclusiveVat} onChange={e => setInclusiveVat(e.target.checked)} style={{ width: 15, height: 15 }} />
                  Inclusive VAT (price includes 13%)
                </label>
              </div>
            </div>
          </div>

          <div style={card}>
            <div className="form-group">
              <label style={fieldLabel}>Payment Mode</label>
              <select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); if (e.target.value !== 'qr' && e.target.value !== 'bank') setBank(''); if (e.target.value === 'split') setSplits([{ method: 'cash', amount: 0, bank: '' }]); }} style={input}>
                <option value="cash">Cash</option>
                <option value="qr">QR / Mobile Banking</option>
                <option value="bank">Bank</option>
                <option value="credit">Credit</option>
                <option value="split">Split Payment</option>
              </select>
            </div>
            {paymentMethod === 'split' && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem', background: '#f8fafc' }}>
                {splits.map((sp, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <select value={sp.method} onChange={e => { const next = [...splits]; next[idx] = { ...next[idx], method: e.target.value, bank: '' }; setSplits(next); }} style={{ ...input, flex: 1, width: 'auto' }}>
                      <option value="cash">Cash</option>
                      <option value="qr">QR</option>
                      <option value="bank">Bank</option>
                      <option value="credit">Credit</option>
                    </select>
                    <input type="number" value={sp.amount || ''} onChange={e => { const next = [...splits]; next[idx] = { ...next[idx], amount: parseFloat(e.target.value) || 0 }; setSplits(next); }} placeholder="Amount" style={{ ...input, flex: 1, width: 'auto', textAlign: 'right' }} />
                    {(sp.method === 'qr' || sp.method === 'bank') && (
                      <select value={sp.bank} onChange={e => { const next = [...splits]; next[idx] = { ...next[idx], bank: e.target.value }; setSplits(next); }} style={{ ...input, flex: 1, width: 'auto' }}>
                        <option value="">-- Bank --</option>
                        {banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                      </select>
                    )}
                    {splits.length > 1 && <button className="btn btn-sm btn-danger" onClick={() => setSplits(splits.filter((_, i) => i !== idx))}>&times;</button>}
                  </div>
                ))}
                <button className="btn btn-sm btn-secondary" onClick={() => setSplits([...splits, { method: 'cash', amount: 0, bank: '' }])}>+ Add Split</button>
                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', fontWeight: 600, color: Math.abs(splits.reduce((s, sp) => s + (sp.amount || 0), 0) - grandTotal) < 0.01 ? '#16a34a' : '#dc2626' }}>
                  Split Total: {formatMoney(splits.reduce((s, sp) => s + (sp.amount || 0), 0))} / {formatMoney(grandTotal)}
                </div>
              </div>
            )}
            {(paymentMethod === 'qr' || paymentMethod === 'bank') && (
              <div className="form-group">
                <label style={fieldLabel}>Choose Bank</label>
                <select value={bank} onChange={e => setBank(e.target.value)} style={input}>
                  <option value="">-- Select Bank --</option>
                  {banks.map(b => (
                    <option key={b._id} value={b._id}>{b.name}{b.accountNumber ? ` (${b.accountNumber})` : ''} - Rs. {Number(b.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</option>
                  ))}
                </select>
              </div>
            )}
            {paymentMethod !== 'split' && (
              <>
                <div className="form-group">
                  <label style={fieldLabel}>Amount Paid</label>
                  <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder={formatMoney(grandTotal)} style={input} />
                </div>
                {paid > grandTotal && (
                  <div className="form-group">
                    <label style={fieldLabel}>Change</label>
                    <div style={{ ...input, background: '#f0fdf4', color: '#15803d', fontWeight: 700 }}>{formatMoney(change)}</div>
                  </div>
                )}
              </>
            )}
            {customer && (
              <div className="form-group">
                <label style={fieldLabel}>Customer</label>
                <div style={{ ...input, background: '#f1f5f9' }}>{customers.find(c => c._id === customer)?.name}</div>
              </div>
            )}
            <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '0.5rem', background: '#0f172a', borderColor: '#0f172a' }} onClick={() => handleSave(false)} disabled={saving}>
              {saving ? 'Saving...' : `Save Invoice`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Sticky Bottom Bar ── */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 40, background: '#fff', borderTop: '1px solid #e2e8f0', boxShadow: '0 -1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Draft</span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>· {formatMoney(grandTotal)} · {bsDate} BS</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Saving...' : 'Save Draft'}</button>
            <button className="btn btn-primary" style={{ background: '#0f172a', borderColor: '#0f172a' }} onClick={() => handleSave(true)} disabled={saving}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>{printIcon}{saving ? 'Saving...' : 'Save & Print'}</span>
            </button>
          </div>
        </div>
      </div>

      {showCustomerModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Add New Customer</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setShowCustomerModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group"><label>Name *</label><input type="text" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group"><label>Phone</label><input type="text" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group"><label>Email</label><input type="email" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group"><label>Address</label><input type="text" value={newCustomer.address} onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group"><label>PAN</label><input type="text" value={newCustomer.pan} onChange={e => setNewCustomer({ ...newCustomer, pan: e.target.value })} style={{ width: '100%' }} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCustomerModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveCustomer}>Add Customer</button>
            </div>
          </div>
        </div>
      )}

      {productModalRow !== null && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Add New Product</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setProductModalRow(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group"><label>Name *</label><input type="text" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} style={{ width: '100%' }} /></div>
              <div className="form-group">
                <label>Category</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <SearchableSelect
                    options={categories.map(c => ({ value: c._id, label: c.name }))}
                    value={newProduct.category}
                    onChange={v => { setNewProduct({ ...newProduct, category: v }); setNewCategoryName(''); }}
                    onAdd={q => { setNewProduct({ ...newProduct, category: '' }); setNewCategoryName(q); }}
                    placeholder="Select or type new..."
                    style={{ flex: 1 }}
                    inputStyle={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem', width: '100%' }}
                  />
                </div>
                <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Or type a new category name" style={{ width: '100%', marginTop: '0.35rem' }} />
              </div>
              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group"><label>Cost Price</label><input type="number" value={newProduct.costPrice} onChange={e => setNewProduct({ ...newProduct, costPrice: e.target.value })} style={{ width: '100%' }} /></div>
                <div className="form-group"><label>Selling Price *</label><input type="number" value={newProduct.sellingPrice} onChange={e => setNewProduct({ ...newProduct, sellingPrice: e.target.value })} style={{ width: '100%' }} /></div>
                <div className="form-group"><label>Opening Stock</label><input type="number" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} style={{ width: '100%' }} /></div>
                <div className="form-group"><label>Unit</label><input type="text" value={newProduct.unit} onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })} style={{ width: '100%' }} /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginTop: '0.35rem' }}>
                <input type="checkbox" checked={newProduct.vatEnabled} onChange={e => setNewProduct({ ...newProduct, vatEnabled: e.target.checked, taxRate: e.target.checked ? (newProduct.taxRate || 13) : 0 })} />
                Apply VAT (13%) to this product
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setProductModalRow(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveProduct}>Add Product</button>
            </div>
          </div>
        </div>
      )}

      {lastSale && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div className="modal-header">
              <h3>Success</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setLastSale(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '2rem' }}>✓</div>
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
