import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import ConfirmModal from '../UI/ConfirmModal';
import SearchableSelect from '../UI/SearchableSelect';
import { printInvoice } from './PrintInvoice';
import { openPrintWindow } from '../UI/printCommon';

export default function POS() {
  const addToast = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [customer, setCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [bank, setBank] = useState('');
  const [banks, setBanks] = useState([]);
  const [amountPaid, setAmountPaid] = useState('');
  const [splits, setSplits] = useState([{ method: 'cash', amount: 0, bank: '' }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastSale, setLastSale] = useState(null);
  const [discountMode, setDiscountMode] = useState('flat');
  const [discountValue, setDiscountValue] = useState(0);
  const [heldBills, setHeldBills] = useState([]);
  const [showHeld, setShowHeld] = useState(false);
  const [returnMode, setReturnMode] = useState(false);
  const [returnSale, setReturnSale] = useState('');
  const [holdNote, setHoldNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [todaySales, setTodaySales] = useState(0);
  const [todaySummary, setTodaySummary] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    api.get('/products').then(r => setProducts(r.data));
    api.get('/categories').then(r => setCategories(r.data));
    api.get('/customers').then(r => setCustomers(r.data));
    api.get('/heldbills').then(r => setHeldBills(r.data));
    api.get('/reports/pos-summary').then(r => { setTodaySales(r.data.netSales); setTodaySummary(r.data); }).catch(() => {});
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
    api.get('/banks').then(r => setBanks(r.data)).catch(() => {});
  }, []);

  const filtered = products.filter(p => {
    if (!p.isActive) return false;
    if (selectedCat && p.category?._id !== selectedCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').includes(q);
    }
    return true;
  });

  const calcTax = (price, qty, taxRate, priceIncludesTax) => {
    if (!taxRate || taxRate === 0) return 0;
    if (priceIncludesTax) {
      return Math.round((price * qty - (price * qty) / (1 + taxRate / 100)) * 100) / 100;
    }
    return Math.round((price * qty * taxRate) / 100 * 100) / 100;
  };

  const calcSubtotal = (price, qty, taxRate, priceIncludesTax) => {
    const gross = price * qty;
    if (priceIncludesTax && taxRate) {
      return Math.round((gross - calcTax(price, qty, taxRate, true)) * 100) / 100;
    }
    return gross;
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product === product._id);
      if (existing) {
        return prev.map(i => i.product === product._id
          ? { ...i, quantity: i.quantity + 1, subtotal: calcSubtotal(i.price, i.quantity + 1, i.taxRate, i.priceIncludesTax), tax: calcTax(i.price, i.quantity + 1, i.taxRate, i.priceIncludesTax) }
          : i);
      }
      const incTax = product.priceIncludesTax || false;
      const tax = calcTax(product.sellingPrice, 1, product.taxRate, incTax);
      return [...prev, {
        product: product._id, name: product.name, sku: product.sku,
        price: product.sellingPrice, costPrice: product.costPrice,
        quantity: 1, taxRate: product.taxRate || 0, priceIncludesTax: incTax, tax, subtotal: calcSubtotal(product.sellingPrice, 1, product.taxRate, incTax),
      }];
    });
  };

  const updateQty = (productId, qty) => {
    if (qty <= 0) { setCart(prev => prev.filter(i => i.product !== productId)); return; }
    setCart(prev => prev.map(i => i.product === productId
      ? { ...i, quantity: qty, subtotal: calcSubtotal(i.price, qty, i.taxRate, i.priceIncludesTax), tax: calcTax(i.price, qty, i.taxRate, i.priceIncludesTax) } : i));
  };

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const taxTotal = cart.reduce((s, i) => s + i.tax, 0);
  let discount = discountValue;
  if (discountMode === 'percentage') discount = subtotal * (discountValue / 100);
  discount = Math.round(discount * 100) / 100;
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const effectiveTaxRate = subtotal > 0 ? taxTotal / subtotal : 0;
  const newTaxTotal = Math.round(discountedSubtotal * effectiveTaxRate * 100) / 100;
  const grandTotal = Math.max(0, discountedSubtotal + newTaxTotal);
  const change = Math.max(0, (parseFloat(amountPaid) || 0) - grandTotal);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) return;
    if ((paymentMethod === 'qr' || paymentMethod === 'bank') && !bank) {
      addToast('Please choose a bank for this payment', 'error');
      return;
    }
    if (paymentMethod === 'split') {
      const totalSplit = splits.reduce((s, sp) => s + (sp.amount || 0), 0);
      if (Math.abs(totalSplit - grandTotal) > 0.01) {
        addToast(`Split total (${formatNPR(totalSplit)}) must equal grand total (${formatNPR(grandTotal)})`, 'error');
        return;
      }
      const hasBank = splits.find(sp => (sp.method === 'qr' || sp.method === 'bank') && !sp.bank);
      if (hasBank) {
        addToast('Please choose a bank for QR/Bank split payments', 'error');
        return;
      }
    }
    setLoading(true);
    try {
      const totalPaid = paymentMethod === 'split'
        ? splits.reduce((s, sp) => s + (sp.amount || 0), 0)
        : parseFloat(amountPaid) || grandTotal;
      const payload = {
        items: cart.map(i => ({
          product: i.product, quantity: i.quantity, price: i.price,
          costPrice: i.costPrice, tax: i.tax, subtotal: i.subtotal,
        })),
        subtotal: discountedSubtotal, taxTotal: newTaxTotal, discount, grandTotal,
        amountPaid: totalPaid,
        change: Math.max(0, totalPaid - grandTotal),
        paymentMethod,
        paymentSplits: paymentMethod === 'split' ? splits.filter(sp => sp.amount > 0) : undefined,
        customer: customer || null,
        bank: (paymentMethod === 'qr' || paymentMethod === 'bank') ? bank : null,
      };
      const { data } = await api.post('/sales', payload);
      setLastSale(data);
      setCart([]);
      setAmountPaid('');
      setBank('');
      setSplits([{ method: 'cash', amount: 0, bank: '' }]);
      setPaymentMethod('cash');
      setDiscountValue(0);
      addToast(`Sale completed! Invoice: ${data.invoiceNumber}`, 'success');
      api.get('/products').then(r => setProducts(r.data));
      api.get('/reports/pos-summary').then(r => { setTodaySales(r.data.netSales); setTodaySummary(r.data); }).catch(() => {});
    } catch (err) {
      addToast(err.response?.data?.message || 'Checkout failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [cart, subtotal, taxTotal, discount, grandTotal, amountPaid, paymentMethod, paymentSplits, customer, bank, splits]);

  const holdBill = async () => {
    if (cart.length === 0) return;
    try {
      await api.post('/heldbills', {
        items: cart, subtotal, taxTotal, discount, discountMode, grandTotal,
        customer: customer || null, note: holdNote,
      });
      setCart([]);
      setDiscountValue(0);
      setHoldNote('');
      addToast('Bill held successfully', 'success');
      api.get('/heldbills').then(r => setHeldBills(r.data));
    } catch (err) {
      addToast('Failed to hold bill', 'error');
    }
  };

  const loadHeldBill = async (id) => {
    try {
      const { data } = await api.get(`/heldbills/${id}`);
      setCart(data.items);
      setDiscountValue(data.discount);
      setDiscountMode(data.discountMode);
      setCustomer(data.customer?._id || '');
      setShowHeld(false);
      addToast(`Loaded bill ${data.billNumber}`, 'success');
    } catch (err) { addToast('Failed to load bill', 'error'); }
  };

  const deleteHeldBill = async (id) => {
    setConfirmDelete({ id, message: 'Delete this held bill?' });
  };

  const processReturn = async () => {
    if (!returnSale) return;
    try {
      const { data } = await api.post('/sales/refund-by-invoice', { invoiceNumber: returnSale });
      addToast(`Sale ${data.invoiceNumber} refunded`, 'success');
      setReturnSale('');
      setReturnMode(false);
      api.get('/products').then(r => setProducts(r.data));
    } catch (err) {
      addToast(err.response?.data?.message || 'Refund failed', 'error');
    }
  };

  const openSummary = () => {
    api.get('/reports/pos-summary').then(r => { setTodaySummary(r.data); setShowSummary(!showSummary); }).catch(() => {});
  };

  const printSummary = () => {
    if (!todaySummary) return;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const company = user.company || {};
    const d = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const bodyHtml = `
      <table class="data-table">
        <tbody>
          <tr><td>Total Transactions</td><td class="text-right">${todaySummary?.transactionCount || 0}</td></tr>
          <tr><td>Cash (Nagad)</td><td class="text-right">${formatNPR(todaySummary?.totalCash || 0)}</td></tr>
          <tr><td>QR (Mobile Banking)</td><td class="text-right">${formatNPR(todaySummary?.totalQR || 0)}</td></tr>
          <tr><td>Credit (Udharo)</td><td class="text-right">${formatNPR(todaySummary?.totalCredit || 0)}</td></tr>
          ${todaySummary?.totalRefunded > 0 ? `<tr><td>Refunds (${todaySummary?.refundCount || 0})</td><td class="text-right">-${formatNPR(todaySummary?.totalRefunded || 0)}</td></tr>` : ''}
          <tr style="border-top:2px solid #000;font-weight:700;"><td>Net Total</td><td class="text-right">${formatNPR(todaySummary?.netSales || 0)}</td></tr>
        </tbody>
      </table>`;
    openPrintWindow({
      title: 'POS Daily Summary',
      company,
      subtitle: d,
      docTitle: 'POS Daily Summary',
      bodyHtml,
    });
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    return (
      <>
      <div className="pos-layout">
        <div className="pos-products">
          <div className="pos-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h2>Point of Sale</h2>
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                <button className="btn btn-sm btn-secondary" onClick={openSummary} style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                  Today: {formatNPR(todaySales)}
                </button>
                <button className={`btn btn-sm ${showHeld ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowHeld(!showHeld)}>
                  Held ({heldBills.length})
                </button>
                <button className={`btn btn-sm ${returnMode ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setReturnMode(!returnMode)}>
                  Return
                </button>
              </div>
            </div>

            {showSummary && todaySummary && (
              <div className="card" style={{ padding: '0.75rem', marginBottom: '0.5rem', background: '#f0fdf4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>Today's Summary</h4>
                  <button className="btn btn-sm btn-primary" onClick={printSummary}>Print</button>
                </div>
                <table style={{ width: '100%', fontSize: '0.8rem' }}>
                  <tbody>
                    <tr><td>Total Transactions</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{todaySummary.transactionCount}</td></tr>
                    <tr><td>Cash (Nagad)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNPR(todaySummary.totalCash)}</td></tr>
                    <tr><td>QR (Mobile Banking)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNPR(todaySummary.totalQR)}</td></tr>
                    <tr><td>Credit (Udharo)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNPR(todaySummary.totalCredit)}</td></tr>
                    {todaySummary.totalRefunded > 0 && (
                      <tr style={{ color: '#dc2626' }}><td>Refunds ({todaySummary.refundCount})</td><td style={{ textAlign: 'right', fontWeight: 600 }}>-{formatNPR(todaySummary.totalRefunded)}</td></tr>
                    )}
                    <tr style={{ borderTop: '2px solid #e2e8f0' }}><td style={{ fontWeight: 700 }}>Net Total</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{formatNPR(todaySummary.netSales)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {returnMode && (
              <div className="card" style={{ padding: '0.75rem', marginBottom: '0.5rem', background: '#fef2f2' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input className="search-input" placeholder="Enter invoice number to refund..." value={returnSale} onChange={e => setReturnSale(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-danger btn-sm" onClick={processReturn} disabled={!returnSale}>Process Return</button>
                </div>
              </div>
            )}

            {showHeld && (
              <div className="card" style={{ padding: '0.5rem', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>Held Bills</h4>
                {heldBills.map(b => (
                  <div key={b._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem' }}>
                    <span>{b.billNumber} - {formatNPR(b.grandTotal)}</span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => loadHeldBill(b._id)}>Load</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteHeldBill(b._id)}>×</button>
                    </div>
                  </div>
                ))}
                {heldBills.length === 0 && <div className="text-muted">No held bills</div>}
              </div>
            )}

            <input type="text" placeholder="Search by name, SKU or barcode..." value={search}
              onChange={e => setSearch(e.target.value)} className="search-input" autoFocus />
            {search && (
              <div className="category-tabs" style={{ marginTop: '0.5rem' }}>
                <button className={`cat-tab ${!selectedCat ? 'active' : ''}`} onClick={() => setSelectedCat('')}>All</button>
                {categories.map(c => (
                  <button key={c._id} className={`cat-tab ${selectedCat === c._id ? 'active' : ''}`}
                    onClick={() => setSelectedCat(c._id)}>{c.name}</button>
                ))}
              </div>
            )}
          </div>
          {search || selectedCat ? (
            <div className="product-list" style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
              {filtered.map(p => {
                const inCart = cart.find(i => i.product === p._id);
                return (
      <div key={p._id} className={`product-list-item ${p.stock <= 0 ? 'disabled' : ''}`}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', borderBottom: '1px solid #f1f5f9', opacity: p.stock <= 0 || inCart ? 0.5 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.name}</span>
          {p.category && <span style={{ fontSize: '0.65rem', color: '#94a3b8', background: '#f1f5f9', padding: '2px 6px', borderRadius: '3px' }}>{p.category.name}</span>}
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{p.sku}</span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>{formatNPR(p.sellingPrice)}</span>
                    {inCart && <span style={{ fontSize: '0.75rem', color: '#ca8a04', fontWeight: 600 }}>In cart: {inCart.quantity}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Stock: {p.stock}</span>
                    {p.stock <= 0 ? (
                      <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600 }}>OUT</span>
                    ) : inCart ? (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Already added</span>
                    ) : (
                      <>
                        <input type="number" min="1" max={p.stock} defaultValue="1"
                          style={{ width: '50px', padding: '0.2rem', fontSize: '0.8rem', textAlign: 'center' }}
                          onClick={e => e.stopPropagation()}
                          id={`qty-${p._id}`} />
                        <button className="btn btn-sm btn-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                          onClick={() => {
                            const qty = parseInt(document.getElementById(`qty-${p._id}`).value) || 1;
                            for (let i = 0; i < qty; i++) addToCart(p);
                          }}>Add</button>
                      </>
                    )}
                  </div>
                </div>
                );
              })}
              {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No products found</div>}
            </div>
          ) : (
            <div className="cart-items" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div className="cart-header" style={{ padding: '0.5rem 1rem' }}>
                <h3>Current Sale</h3>
                <span className="cart-count">{cart.length} items</span>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {cart.map((item, idx) => (
                  <div key={idx} className="cart-item">
                    <div className="cart-item-info">
                      <div className="cart-item-name">{item.name}</div>
                      <div className="cart-item-price">{formatNPR(item.subtotal / item.quantity)} each</div>
                    </div>
                    <div className="cart-item-qty">
                      <button onClick={() => updateQty(item.product, item.quantity - 1)}>-</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateQty(item.product, item.quantity + 1)}>+</button>
                    </div>
                    <div className="cart-item-subtotal">{formatNPR(item.subtotal)}</div>
                    <button className="cart-item-remove" onClick={() => updateQty(item.product, 0)}>×</button>
                  </div>
                ))}
                {cart.length === 0 && <div className="cart-empty" style={{ padding: '2rem', textAlign: 'center' }}>Search products above to start a sale</div>}
              </div>
              {cart.length > 0 && (
                <div style={{ borderTop: '2px solid #e2e8f0', padding: '0.75rem 1rem', background: '#f8fafc' }}>
                  <div className="summary-row"><span>Amount before VAT:</span><span>{formatNPR(subtotal)}</span></div>
                  {taxTotal > 0 && <div className="summary-row"><span>VAT:</span><span>{formatNPR(taxTotal)}</span></div>}
                  {taxTotal > 0 && <div className="summary-row"><span>Total:</span><span>{formatNPR(subtotal + taxTotal)}</span></div>}
                  <div className="summary-row total"><span>Grand Total:</span><span>{formatNPR(grandTotal)}</span></div>
                </div>
              )}
            </div>
          )}
        </div>

      <div className="pos-cart">
        <div className="cart-summary">
          <div className="summary-row"><span>Amount before VAT:</span><span>{formatNPR(subtotal)}</span></div>
          {taxTotal > 0 && <div className="summary-row"><span>VAT:</span><span>{formatNPR(taxTotal)}</span></div>}
          {taxTotal > 0 && <div className="summary-row"><span>Total:</span><span>{formatNPR(subtotal + taxTotal)}</span></div>}
          <div className="summary-row">
            <span>Discount:</span>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <select value={discountMode} onChange={e => setDiscountMode(e.target.value)} style={{ width: '80px', padding: '0.35rem 0.25rem', fontSize: '0.8rem' }}>
                <option value="flat">Rs.</option><option value="percentage">%</option>
              </select>
              <input type="number" value={discountValue} onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                style={{ width: '130px', padding: '0.4rem 0.5rem', fontSize: '0.9rem', textAlign: 'right' }} />
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{formatNPR(discount)}</span>
            </div>
          </div>
          <div className="summary-row total"><span>Grand Total:</span><span>{formatNPR(grandTotal)}</span></div>
        </div>

        <div className="cart-actions">
          <div className="form-group">
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); if (e.target.value !== 'qr' && e.target.value !== 'bank') setBank(''); if (e.target.value === 'split') setSplits([{ method: 'cash', amount: 0, bank: '' }]); }}>
              <option value="cash">Cash (Nagad)</option>
              <option value="qr">QR (Mobile Banking)</option>
              <option value="bank">Bank</option>
              <option value="credit">Credit (Udharo)</option>
              <option value="split">Split Payment</option>
            </select>
          </div>
          {paymentMethod === 'split' && (
            <div className="card" style={{ padding: '0.5rem', marginBottom: '0.5rem' }}>
              {splits.map((sp, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <select value={sp.method} onChange={e => {
                    const next = [...splits]; next[idx] = { ...next[idx], method: e.target.value, bank: '' }; setSplits(next);
                  }} style={{ flex: 1, padding: '0.35rem', fontSize: '0.8rem' }}>
                    <option value="cash">Cash</option>
                    <option value="qr">QR</option>
                    <option value="bank">Bank</option>
                    <option value="credit">Credit</option>
                  </select>
                  <input type="number" value={sp.amount || ''} onChange={e => {
                    const next = [...splits]; next[idx] = { ...next[idx], amount: parseFloat(e.target.value) || 0 }; setSplits(next);
                  }} placeholder="Amount" style={{ flex: 1, padding: '0.35rem', fontSize: '0.8rem', textAlign: 'right' }} />
                  {(sp.method === 'qr' || sp.method === 'bank') && (
                    <select value={sp.bank} onChange={e => { const next = [...splits]; next[idx] = { ...next[idx], bank: e.target.value }; setSplits(next); }} style={{ flex: 1, padding: '0.35rem', fontSize: '0.8rem' }}>
                      <option value="">Bank</option>
                      {banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                    </select>
                  )}
                  {splits.length > 1 && <button className="btn btn-sm btn-danger" onClick={() => setSplits(splits.filter((_, i) => i !== idx))} style={{ padding: '0.2rem 0.5rem' }}>×</button>}
                </div>
              ))}
              <button className="btn btn-sm btn-secondary" onClick={() => setSplits([...splits, { method: 'cash', amount: 0, bank: '' }])} style={{ fontSize: '0.75rem' }}>+ Add Split</button>
              <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', fontWeight: 600, color: Math.abs(splits.reduce((s, sp) => s + (sp.amount || 0), 0) - grandTotal) < 0.01 ? '#16a34a' : '#dc2626' }}>
                Split Total: {formatNPR(splits.reduce((s, sp) => s + (sp.amount || 0), 0))} / {formatNPR(grandTotal)}
              </div>
            </div>
          )}
          {(paymentMethod === 'qr' || paymentMethod === 'bank') && (
            <div className="form-group">
              <label>Choose Bank</label>
              <select value={bank} onChange={e => setBank(e.target.value)}>
                <option value="">-- Select Bank --</option>
                {banks.map(b => (
                  <option key={b._id} value={b._id}>{b.name}{b.accountNumber ? ` (${b.accountNumber})` : ''} - Rs. {Number(b.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Customer</label>
            <SearchableSelect
              options={[{ value: '', label: 'Walk-in Customer' }, ...customers.map(c => ({ value: c._id, label: c.name }))]}
              value={customer}
              onChange={setCustomer}
              placeholder="Search customer..."
            />
          </div>
          {paymentMethod !== 'split' && (
            <>
              <div className="form-group">
                <label>Amount Paid (Rs.)</label>
                <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="Enter amount" />
              </div>
              {amountPaid && <div className="summary-row"><span>Change:</span><span>{formatNPR(change)}</span></div>}
            </>
          )}
          {lastSale && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', padding: '0.5rem', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
              <span style={{ color: '#15803d', fontWeight: 600, fontSize: '0.85rem' }}>Invoice {lastSale.invoiceNumber} created</span>
              <button className="btn btn-sm btn-primary" onClick={() => { printInvoice(lastSale, company); setLastSale(null); }}>Print Invoice</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button className="btn btn-secondary" onClick={holdBill} disabled={cart.length === 0} style={{ flex: 1 }}>
              Hold Bill
            </button>
            <button className="btn btn-primary btn-lg" onClick={handleCheckout}
              disabled={loading || cart.length === 0} style={{ flex: 2 }}>
              {loading ? 'Processing...' : `Pay ${formatNPR(grandTotal)}`}
            </button>
          </div>
        </div>
        </div>
      </div>
      <ConfirmModal open={!!confirmDelete} title="Confirm" message={confirmDelete?.message}
        onConfirm={async () => {
          await api.delete(`/heldbills/${confirmDelete.id}`);
          api.get('/heldbills').then(r => setHeldBills(r.data));
          setConfirmDelete(null);
        }} onCancel={() => setConfirmDelete(null)} />
    </>
  );
}
