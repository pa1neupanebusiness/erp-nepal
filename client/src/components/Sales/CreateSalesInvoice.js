import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useToast } from '../UI/Toast';
import SearchableSelect from '../UI/SearchableSelect';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

const BS_MONTHS = ['Bai', 'Jes', 'Asa', 'Shr', 'Bha', 'Ash', 'Kar', 'Man', 'Pou', 'Mag', 'Fal', 'Cha'];

const UNIT_OPTIONS = ['Pcs', 'Kg', 'Box', 'Mtr', 'Set', 'Roll', 'Ltr', 'Ft', 'Bag', 'Pair', 'Dozen'];

const emptyRow = () => ({ product: '', name: '', sku: '', qty: 1, rate: '', taxRate: 0, priceIncludesTax: false, unit: 'Pcs', lineDiscount: 0, lineDiscountMode: 'percent', taxOverride: '' });

const Icons = {
  back: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  search: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  plus: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  trash: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>,
  upload: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
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
  const [addExtraCharge, setAddExtraCharge] = useState(false);
  const [extraChargeRemarks, setExtraChargeRemarks] = useState('');
  const [extraChargeAmount, setExtraChargeAmount] = useState('');

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [pendingCustomerName, setPendingCustomerName] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '', pan: '' });

  const [productModalRow, setProductModalRow] = useState(null);
  const [pendingProductName, setPendingProductName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProduct, setNewProduct] = useState({ name: '', category: '', costPrice: '', sellingPrice: '', stock: 0, minStock: 5, unit: 'pcs', taxRate: 13, vatEnabled: false, priceIncludesTax: false });

  const [terms, setTerms] = useState('');
  const [roundOff, setRoundOff] = useState(false);
  const [customerDue, setCustomerDue] = useState(0);
  const [manualInvoiceNo, setManualInvoiceNo] = useState(false);

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

  useEffect(() => {
    if (customer) {
      api.get('/customers/' + customer + '/transactions')
        .then(r => setCustomerDue(r.data.totalDue || 0))
        .catch(() => setCustomerDue(0));
    } else {
      setCustomerDue(0);
    }
  }, [customer]);

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
      unit: p?.unit || 'Pcs',
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

  const handleSplitAmountChange = (idx, value) => {
    const amt = parseFloat(value) || 0;
    let updated = splits.map((sp, i) => i === idx ? { ...sp, amount: amt } : sp);
    updated = updated.filter(sp => sp.method !== 'credit');
    const total = updated.reduce((s, sp) => s + (sp.amount || 0), 0);
    const remaining = Math.max(0, Math.round((grandTotal - total) * 100) / 100);
    if (remaining > 0.01) {
      updated.push({ method: 'credit', amount: remaining, bank: '' });
    }
    setSplits(updated);
  };

  const handleSplitMethodChange = (idx, newMethod) => {
    let updated = splits.map((sp, i) => i === idx ? { ...sp, method: newMethod, bank: '' } : sp);
    updated = updated.filter(sp => sp.method !== 'credit');
    const total = updated.reduce((s, sp) => s + (sp.amount || 0), 0);
    const remaining = Math.max(0, Math.round((grandTotal - total) * 100) / 100);
    if (remaining > 0.01) {
      updated.push({ method: 'credit', amount: remaining, bank: '' });
    }
    setSplits(updated);
  };

  const handleInclusiveVatToggle = (checked) => {
    setInclusiveVat(checked);
    setApplyVat(false);
  };
  const handleApplyVatToggle = (checked) => {
    setApplyVat(checked);
    setInclusiveVat(false);
  };
  const lineRate = (r) => {
    const raw = parseFloat(r.rate) || 0;
    if (inclusiveVat) {
      const taxRate = r.taxRate || 13;
      return Math.round((raw / (1 + taxRate / 100)) * 100) / 100;
    }
    return raw;
  };
  const lineBase = (r) => Math.round(lineRate(r) * (parseInt(r.qty) || 0) * 100) / 100;
  const lineTax = (r, base) => {
    const taxRate = r.taxRate || 13;
    return Math.round((base * taxRate / 100) * 100) / 100;
  };

  const lineDiscountAmount = (r) => {
    const base = lineBase(r);
    const disc = parseFloat(r.lineDiscount) || 0;
    if (r.lineDiscountMode === 'percent') {
      return Math.round(base * disc / 100 * 100) / 100;
    }
    return Math.round(disc * 100) / 100;
  };

  const computeRowTax = (r) => {
    const base = lineBase(r);
    const disc = lineDiscountAmount(r);
    const net = Math.max(0, base - disc);
    if (r.taxOverride !== null && r.taxOverride !== undefined && r.taxOverride !== '') {
      if (r.taxOverride === 'exempt') return 0;
      return Math.round(net * Number(r.taxOverride) / 100 * 100) / 100;
    }
    if (applyVat || inclusiveVat) {
      return Math.round(net * (r.taxRate || 13) / 100 * 100) / 100;
    }
    return 0;
  };

  const lineAmount = (r) => {
    const base = lineBase(r);
    const disc = lineDiscountAmount(r);
    const net = Math.max(0, base - disc);
    const tax = computeRowTax(r);
    return Math.round((net + tax) * 100) / 100;
  };

  const totalBeforeDiscount = rows.reduce((s, r) => s + lineBase(r), 0);
  const totalLineDiscounts = rows.reduce((s, r) => s + lineDiscountAmount(r), 0);
  const discountBase = totalBeforeDiscount;
  let discount = Math.round((parseFloat(discountValue) || 0) * 100) / 100;
  const extraCharge = addExtraCharge ? (parseFloat(extraChargeAmount) || 0) : 0;
  const effectiveTotalDiscount = discount + totalLineDiscounts;

  const vatEnabled = applyVat || inclusiveVat;
  const hasPerRowTax = rows.some(r => r.taxOverride !== null && r.taxOverride !== undefined && r.taxOverride !== '');
  const shouldComputeTax = vatEnabled || hasPerRowTax;

  let grandTotal, taxTotal, netAfterDiscount;
  netAfterDiscount = Math.max(0, totalBeforeDiscount - effectiveTotalDiscount);

  if (shouldComputeTax) {
    taxTotal = rows.reduce((s, r) => s + computeRowTax(r), 0);
    taxTotal = Math.round(taxTotal * 100) / 100;
    grandTotal = Math.round((netAfterDiscount + taxTotal + extraCharge) * 100) / 100;
  } else {
    taxTotal = 0;
    grandTotal = Math.round((netAfterDiscount + extraCharge) * 100) / 100;
  }

  if (roundOff) {
    grandTotal = Math.round(grandTotal);
  }

  const paid = parseFloat(amountPaid) || grandTotal;
  const change = Math.max(0, paid - grandTotal);
  const dueBalance = Math.max(0, grandTotal - (paymentMethod === 'split' ? splits.reduce((s, sp) => s + (sp.amount || 0), 0) : paid));
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

  const handleSave = async () => {
    const validRows = rows.filter(r => r.product && (parseFloat(r.rate) > 0 || lineBase(r) > 0));
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
    if (invoiceNo.trim()) {
      const dup = await api.get('/sales/exists', { params: { invoiceNumber: invoiceNo.trim() } }).catch(() => null);
      if (dup?.data?.exists) {
        addToast('Invoice number already used. Please choose a different number.', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        items: validRows.map(r => ({
          product: r.product,
          quantity: parseInt(r.qty) || 1,
          price: parseFloat(r.rate) || 0,
          costPrice: r.costPrice || 0,
          tax: lineTax(r, lineBase(r)),
          subtotal: Math.round(lineBase(r) * 100) / 100,
        })),
        subtotal: Math.round(totalBeforeDiscount * 100) / 100,
        taxTotal: Math.round(taxTotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        grandTotal: Math.round(grandTotal * 100) / 100,
        amountPaid: totalPaid,
        change: Math.max(0, totalPaid - grandTotal),
        paymentMethod,
         paymentSplits: paymentMethod === 'split' ? splits.filter(sp => sp.amount > 0).map(sp => ({ method: sp.method, amount: Math.round((sp.amount || 0) * 100) / 100, bank: (sp.method === 'qr' || sp.method === 'bank') ? (sp.bank || null) : null })) : undefined,
        bank: (paymentMethod === 'qr' || paymentMethod === 'bank') ? bank : null,
        customer: customer || null,
        invoiceNumber: invoiceNo.trim() || undefined,
        date: bsToADStr(invoiceDate),
        notes,
        images,
        source: 'invoice',
        inclusiveVat,
        extraCharge: addExtraCharge ? { remarks: extraChargeRemarks, amount: extraCharge } : undefined,
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
      addToast(`Invoice ${data.invoiceNumber} created`, 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', paddingBottom: 80 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => navigate('/sales')} style={{ padding: '0.375rem', color: '#64748b', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex' }}>{Icons.back}</button>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Create Sales Invoice</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => navigate('/sales')} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => handleSave()} disabled={saving} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Invoice'}</button>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

          <section style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a' }}>Invoice Details</h2>
              <button onClick={() => { setCustomer(''); setCashSale(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer' }}>{Icons.zap}<span>Cash Sale</span></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Party / Customer</label>
                <div style={{ position: 'relative' }}>
                  <SearchableSelect options={customerOptions} value={customer} onChange={v => { setCustomer(v || ''); setCashSale(!v); }} onAdd={openCustomerModal} placeholder="Cash Sale" style={{ width: '100%' }} inputStyle={{ padding: '0.5rem 0.75rem 0.5rem 2.5rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem', width: '100%' }} />
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>{Icons.search}</span>
                </div>
                {customer && customerDue > 0 && (
                  <div style={{ marginTop: 6, fontSize: '0.75rem', fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }}></span>
                    Outstanding Due: {formatMoney(customerDue)}
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice No.</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} disabled={!manualInvoiceNo} placeholder={manualInvoiceNo ? 'Enter number' : 'Auto-generated'} style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.875rem', background: manualInvoiceNo ? '#fff' : '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, opacity: manualInvoiceNo ? 1 : 0.7 }} />
                  <button onClick={() => { setManualInvoiceNo(!manualInvoiceNo); if (manualInvoiceNo) setInvoiceNo(''); }} style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#fff', background: manualInvoiceNo ? '#16a34a' : '#64748b', border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {manualInvoiceNo ? Icons.check : Icons.zap}
                    {manualInvoiceNo ? 'Manual' : 'Auto'}
                  </button>
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice Date</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <NepaliDatePicker value={invoiceDate} onChange={setInvoiceDate} style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.875rem' }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, whiteSpace: 'nowrap' }}>{bsDate} BS</span>
              </div>
            </div>
          </section>
          <section style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a' }}>Billing Items</h2>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Press <kbd style={{ padding: '0.125rem 0.375rem', background: '#e2e8f0', color: '#475569', borderRadius: 4, fontSize: '0.625rem' }}>Tab</kbd> to jump between fields</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="invoice-items" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc', fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '0.625rem 0.5rem', width: 40, textAlign: 'center' }}>S.N.</th>
                    <th style={{ padding: '0.625rem 0.5rem', textAlign: 'left', minWidth: 200 }}>Item Details</th>
                    <th style={{ padding: '0.625rem 0.5rem', width: 96, textAlign: 'center' }}>Unit</th>
                    <th style={{ padding: '0.625rem 0.5rem', width: 80, textAlign: 'center' }}>Qty</th>
                    <th style={{ padding: '0.625rem 0.5rem', width: 120, textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '0.625rem 0.5rem', width: 130, textAlign: 'right' }}>Discount</th>
                    <th style={{ padding: '0.625rem 0.5rem', width: 100, textAlign: 'center' }}>Tax/VAT</th>
                    <th style={{ padding: '0.625rem 0.5rem', width: 120, textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '0.625rem 0.5rem', width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center', color: '#94a3b8', fontWeight: 500, fontSize: '0.75rem' }}>{idx + 1}</td>
                      <td style={{ padding: '0.625rem 0.5rem' }}>
                        <SearchableSelect options={productOptions} value={r.product} onChange={v => pickProduct(idx, v)} onAdd={(name) => openProductModal(idx, name)} placeholder="Search item name..." style={{ minWidth: 180 }} inputStyle={{ padding: '0.375rem 0.625rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem', width: '100%' }} />
                        {r.product && (
                          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {r.name && <span style={{ fontSize: '0.6875rem', color: '#475569', fontWeight: 500 }}>{r.name}{r.sku ? ` (${r.sku})` : ''}</span>}
                            {(() => { const prod = products.find(p => p._id === r.product); return prod ? (
                              <span style={{ fontSize: '0.625rem', fontWeight: 600, color: prod.stock > 0 ? '#16a34a' : '#dc2626', background: prod.stock > 0 ? '#f0fdf4' : '#fef2f2', padding: '0.125rem 0.375rem', borderRadius: 4, border: `1px solid ${prod.stock > 0 ? '#bbf7d0' : '#fecaca'}`, whiteSpace: 'nowrap' }}>In Stock: {prod.stock}</span>
                            ) : null; })()}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem' }}>
                        <select value={r.unit} onChange={e => updateRow(idx, 'unit', e.target.value)} style={{ width: '100%', padding: '0.375rem 0.25rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem', background: '#fff', textAlign: 'center' }}>
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem' }}>
                        <input type="number" min="1" value={r.qty} onChange={e => updateRow(idx, 'qty', e.target.value)} style={{ width: '100%', padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem', textAlign: 'center' }} />
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginRight: 2 }}>Rs.</span>
                          <input type="number" min="0" step="0.01" value={inclusiveVat ? lineRate(r) : r.rate} onChange={e => updateRow(idx, 'rate', inclusiveVat ? (Math.round((parseFloat(e.target.value) || 0) * (1 + (r.taxRate || 13) / 100) * 100) / 100) : e.target.value)} onKeyDown={tabAddRow(idx)} style={{ width: '100%', padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem', textAlign: 'right' }} />
                        </div>
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ display: 'flex', background: '#f1f5f9', padding: 1, borderRadius: 4, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                            <button onClick={() => updateRow(idx, 'lineDiscountMode', 'percent')} style={{ padding: '0.125rem 0.375rem', fontSize: '0.6875rem', fontWeight: 600, background: r.lineDiscountMode === 'percent' ? '#fff' : 'transparent', color: r.lineDiscountMode === 'percent' ? '#0f172a' : '#94a3b8', border: 'none', borderRadius: 3, cursor: 'pointer' }}>%</button>
                            <button onClick={() => updateRow(idx, 'lineDiscountMode', 'amount')} style={{ padding: '0.125rem 0.375rem', fontSize: '0.6875rem', fontWeight: 600, background: r.lineDiscountMode === 'amount' ? '#fff' : 'transparent', color: r.lineDiscountMode === 'amount' ? '#0f172a' : '#94a3b8', border: 'none', borderRadius: 3, cursor: 'pointer' }}>Rs</button>
                          </div>
                          <input type="number" min="0" step="0.01" value={r.lineDiscount || ''} onChange={e => updateRow(idx, 'lineDiscount', e.target.value)} placeholder="0" style={{ width: '100%', padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem', textAlign: 'right' }} />
                        </div>
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem' }}>
                        <select value={r.taxOverride} onChange={e => updateRow(idx, 'taxOverride', e.target.value)} style={{ width: '100%', padding: '0.375rem 0.25rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem', background: '#fff', textAlign: 'center' }}>
                          <option value="">Default</option>
                          <option value="0">0% (Exempt)</option>
                          <option value="13">13% VAT</option>
                        </select>
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right', fontWeight: 600, color: '#0f172a', fontSize: '0.8125rem' }}>{formatMoney(lineAmount(r))}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center' }}>
                        <button onClick={() => removeRow(idx)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>{Icons.trash}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0.75rem 0', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={addRow} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem 0.75rem', borderRadius: 8 }}>{Icons.plus}<span>Add Billing Item</span></button>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                Subtotal: <span style={{ color: '#2563eb' }}>{formatMoney(totalBeforeDiscount)}</span>
              </div>
            </div>
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid #e2e8f0' }}>
            <div style={{ padding: '1.5rem', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes / Remarks</label>
                <textarea rows="3" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter notes or remarks visible to customer..." style={{ width: '100%', padding: '0.625rem 0.75rem', fontSize: '0.8125rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, resize: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Terms & Conditions</label>
                <textarea rows="3" value={terms} onChange={e => setTerms(e.target.value)} placeholder="Enter terms and conditions..." style={{ width: '100%', padding: '0.625rem 0.75rem', fontSize: '0.8125rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, resize: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Attach Documents</label>
                <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} onClick={() => document.getElementById('invoice-attachments')?.click()} style={{ border: `2px dashed ${dragOver ? '#2563eb' : '#cbd5e1'}`, borderRadius: 8, padding: '1.25rem', textAlign: 'center', background: dragOver ? '#eff6ff' : '#fafbfc', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}>
                  <div style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>{Icons.upload}</div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 500, color: '#475569' }}>Click to upload or drag & drop</p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.6875rem', color: '#94a3b8' }}>PNG, JPG, or PDF up to 10MB</p>
                </div>
                <input id="invoice-attachments" type="file" multiple accept="image/*,.pdf" onChange={handleImageChange} style={{ display: 'none' }} />
                {images.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                    {images.map((img, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={img} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                        <button onClick={() => setImages(prev => prev.filter((_, x) => x !== i))} style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>x</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>Summary & Payment</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', fontSize: '0.8125rem' }}>
                {!inclusiveVat && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>Items Subtotal</span>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatMoney(totalBeforeDiscount)}</span>
                  </div>
                )}
                {inclusiveVat && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>Items Subtotal (incl. VAT)</span>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatMoney(totalBeforeDiscount)}</span>
                  </div>
                )}
                {totalLineDiscounts > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>Item Discounts</span>
                    <span style={{ fontWeight: 600, color: '#dc2626' }}>- {formatMoney(totalLineDiscounts)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>
                    Discount
                    {discount > 0 && (
                      <span style={{ marginLeft: 6, fontSize: '0.6875rem', fontWeight: 600, color: '#16a34a' }}>
                        {discountMode === 'percent' ? `= ${formatMoney(discount)}` : `= ${discountPercent}%`}
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 600 }}>
                      <button onClick={() => setDiscountMode('percent')} style={{ padding: '0.125rem 0.5rem', background: discountMode === 'percent' ? '#fff' : 'transparent', color: discountMode === 'percent' ? '#0f172a' : '#64748b', border: 'none', borderRadius: 4, cursor: 'pointer' }}>%</button>
                      <button onClick={() => setDiscountMode('amount')} style={{ padding: '0.125rem 0.5rem', background: discountMode === 'amount' ? '#fff' : 'transparent', color: discountMode === 'amount' ? '#0f172a' : '#64748b', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Rs</button>
                    </div>
                    <input type="number" min="0" value={discountMode === 'amount' ? discountValue : discountPercent} onChange={e => { const v = e.target.value; if (discountMode === 'amount') { setDiscountValue(v); setDiscountPercent(discountBase ? ((parseFloat(v) || 0) / discountBase * 100).toFixed(2) : ''); } else { setDiscountPercent(v); setDiscountValue(((parseFloat(v) || 0) / 100 * discountBase).toFixed(2)); } }} style={{ width: 80, padding: '0.25rem 0.5rem', textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8125rem' }} />
                  </div>
                </div>
                <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={applyVat} onChange={e => handleApplyVatToggle(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#334155' }}>Add VAT (13%)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', marginTop: '0.375rem' }}>
                    <input type="checkbox" checked={inclusiveVat} onChange={e => handleInclusiveVatToggle(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Inclusive VAT (prices include 13%)</span>
                  </label>
                </div>
                {taxTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>VAT Total</span>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatMoney(taxTotal)}</span>
                  </div>
                )}
                <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={addExtraCharge} onChange={e => setAddExtraCharge(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#334155' }}>Add Extra Charge</span>
                  </label>
                  {addExtraCharge && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input type="text" value={extraChargeRemarks} onChange={e => setExtraChargeRemarks(e.target.value)} placeholder="Charge remarks (e.g. Delivery, Packing)" style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8125rem' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Rs.</span>
                        <input type="number" min="0" value={extraChargeAmount} onChange={e => setExtraChargeAmount(e.target.value)} placeholder="0" style={{ flex: 1, padding: '0.375rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8125rem', textAlign: 'right' }} />
                      </div>
                    </div>
                  )}
                </div>
                {addExtraCharge && extraCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>Extra Charge{extraChargeRemarks ? ` (${extraChargeRemarks})` : ''}</span>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>+ {formatMoney(extraCharge)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={roundOff} onChange={e => setRoundOff(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#2563eb' }} />
                    <span style={{ fontSize: '0.8125rem', color: '#475569' }}>Round Off</span>
                  </label>
                  {roundOff && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>to nearest Rs. 1</span>}
                </div>
                <div style={{ paddingTop: '0.75rem', borderTop: '2px solid #0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Grand Total</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb' }}>{formatMoney(grandTotal)}</span>
                </div>
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Payment Mode</label>
                    <select value={paymentMethod} onChange={e => { const v = e.target.value; setPaymentMethod(v); if (v !== 'qr' && v !== 'bank') setBank(''); if (v === 'split') { setSplits([{ method: 'cash', amount: Math.round(grandTotal * 100) / 100, bank: '' }, { method: 'bank', amount: 0, bank: '' }]); } else { setSplits([{ method: 'cash', amount: 0, bank: '' }]); } }} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                      <option value="cash">Cash</option>
                      <option value="qr">QR / Mobile Banking</option>
                      <option value="bank">Bank Transfer / Fonepay</option>
                      <option value="credit">Credit / Cheque</option>
                      <option value="split">Split Payment</option>
                    </select>
                  </div>
                  {paymentMethod === 'split' && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem', background: '#f8fafc' }}>
                      {splits.map((sp, idx) => {
                        const isCredit = sp.method === 'credit';
                        return (
                          <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', padding: '0.375rem', borderRadius: 6, background: isCredit ? '#fffbeb' : 'transparent', border: isCredit ? '1px solid #fde68a' : '1px solid transparent' }}>
                            <select value={sp.method} onChange={e => handleSplitMethodChange(idx, e.target.value)} style={{ width: 100, padding: '0.375rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', background: isCredit ? '#fef3c7' : '#fff' }}>
                              <option value="cash">Cash</option><option value="qr">QR</option><option value="bank">Bank</option>
                              {isCredit && <option value="credit">Credit</option>}
                            </select>
                            <input type="number" value={sp.amount || ''} onChange={e => handleSplitAmountChange(idx, e.target.value)} placeholder="0" style={{ flex: 1, padding: '0.375rem', borderRadius: 6, border: `1px solid ${isCredit ? '#f59e0b' : '#cbd5e1'}`, fontSize: '0.8rem', textAlign: 'right', background: isCredit ? '#fffbeb' : '#fff', fontWeight: isCredit ? 600 : 400, color: isCredit ? '#b45309' : '#0f172a' }} />
                            {(sp.method === 'qr' || sp.method === 'bank') && (
                              <select value={sp.bank} onChange={e => { const next = [...splits]; next[idx] = { ...next[idx], bank: e.target.value }; setSplits(next); }} style={{ flex: 1, padding: '0.375rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}>
                                <option value="">-- Bank --</option>{banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                              </select>
                            )}
                            {isCredit && <span style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 500, whiteSpace: 'nowrap' }}>Due</span>}
                            {splits.length > 2 && <button onClick={() => setSplits(splits.filter((_, i) => i !== idx))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}>x</button>}
                          </div>
                        );
                      })}
                      <button onClick={() => setSplits([...splits, { method: 'cash', amount: 0, bank: '' }])} style={{ fontSize: '0.8rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add Split</button>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: Math.abs(splits.reduce((s, sp) => s + (sp.amount || 0), 0) - grandTotal) < 0.01 ? '#16a34a' : '#dc2626' }}>
                          Total: {formatMoney(splits.reduce((s, sp) => s + (sp.amount || 0), 0))} / {formatMoney(grandTotal)}
                        </div>
                        {splits.some(sp => sp.method === 'credit') && (
                          <span style={{ fontSize: '0.7rem', color: '#b45309', background: '#fef3c7', padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 600 }}>Partial - credit due</span>
                        )}
                      </div>
                    </div>
                  )}
                  {(paymentMethod === 'qr' || paymentMethod === 'bank') && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Choose Bank</label>
                      <select value={bank} onChange={e => setBank(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                        <option value="">-- Select Bank --</option>
                        {banks.map(b => <option key={b._id} value={b._id}>{b.name}{b.accountNumber ? ` (${b.accountNumber})` : ''}</option>)}
                      </select>
                    </div>
                  )}
                  {paymentMethod !== 'split' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Amount Paid</label>
                      <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder={formatMoney(grandTotal)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }} />
                      {dueBalance > 0 && (
                        <div style={{ marginTop: 6, fontSize: '0.75rem', fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }}></span>
                          Due Balance: {formatMoney(dueBalance)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e2e8f0', boxShadow: '0 -2px 8px rgba(0,0,0,0.06)', padding: '0.75rem 1.5rem', zIndex: 20 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Status: <span style={{ fontWeight: 500, color: '#d97706', background: '#fffbeb', padding: '0.125rem 0.5rem', borderRadius: 4, border: '1px solid #fde68a' }}>Draft</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => handleSave()} disabled={saving} style={{ padding: '0.5rem 1.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{Icons.check}<span>{saving ? 'Saving...' : 'Save Invoice'}</span></button>
          </div>
        </div>
      </footer>
      {showCustomerModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header"><h3>Add New Customer</h3><button className="btn btn-sm modal-close-x" onClick={() => setShowCustomerModal(false)}>x</button></div>
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
            <div className="modal-header"><h3>Add New Product</h3><button className="btn btn-sm modal-close-x" onClick={() => setProductModalRow(null)}>x</button></div>
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
            <div className="modal-header"><h3>Success</h3><button className="btn btn-sm modal-close-x" onClick={() => setLastSale(null)}>x</button></div>
            <div className="modal-body">
              <div style={{ fontSize: '2rem', color: '#16a34a' }}>&#10003;</div>
              <h3>Invoice {lastSale.invoiceNumber} created!</h3>
              <p className="text-muted">Total: {formatMoney(lastSale.grandTotal)}</p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => { setLastSale(null); navigate('/sales'); }}>Sales History</button>
              <button className="btn btn-primary" onClick={() => { setLastSale(null); setRows([emptyRow()]); setImages([]); setNotes(''); setTerms(''); setInvoiceNo(''); setDiscountValue(0); setApplyVat(false); setInclusiveVat(false); setAmountPaid(''); setBank(''); setPaymentMethod('cash'); setSplits([{ method: 'cash', amount: 0, bank: '' }]); }}>New Sale</button>
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
