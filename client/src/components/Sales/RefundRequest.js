import React, { useState, useEffect, useRef } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';

export default function RefundRequest() {
  const addToast = useToast();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [sale, setSale] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef();

  useEffect(() => {
    const handleClick = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (invoiceNumber.length < 2) { setSuggestions([]); setShowDropdown(false); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/sales/search', { params: { q: invoiceNumber } });
        setSuggestions(data);
        setShowDropdown(data.length > 0);
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [invoiceNumber]);

  const selectSale = (s) => {
    setInvoiceNumber(s.invoiceNumber);
    setSale(s);
    setShowDropdown(false);
    setSuggestions([]);
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/refund-requests', { saleId: sale._id, reason });
      addToast('Refund request submitted for admin approval', 'success');
      setSale(null);
      setReason('');
      setInvoiceNumber('');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to submit request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <h1>Request Refund</h1>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, position: 'relative' }} ref={wrapperRef}>
            <label>Search by Invoice Number</label>
            <input value={invoiceNumber} onChange={e => { setInvoiceNumber(e.target.value); setSale(null); }}
              placeholder="Type invoice number..." autoComplete="off" />
            {showDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 250, overflow: 'auto' }}>
                {suggestions.map(s => (
                  <div key={s._id} onClick={() => selectSale(s)}
                    style={{ padding: '0.6rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.target.style.background = '#f8fafc'} onMouseLeave={e => e.target.style.background = '#fff'}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.invoiceNumber}</span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                      <span>{formatNPR(s.grandTotal)}</span>
                      <span>{new Date(s.createdAt).toLocaleDateString('en-IN')}</span>
                      <span className={`badge ${s.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{s.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {sale && (
        <div className="card">
          <h3>{sale.invoiceNumber}</h3>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div>Date: {new Date(sale.createdAt).toLocaleDateString('en-IN')}</div>
            <div>Customer: {sale.customer?.name || 'Walk-in'}</div>
            <div>Payment: {sale.paymentMethod}</div>
            <div>Items: {sale.items?.length}</div>
            <div><strong>Total: {formatNPR(sale.grandTotal)}</strong></div>
            <div>Status: <span className={`badge ${sale.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{sale.status}</span></div>
          </div>
          {sale.status === 'completed' && (
            <form onSubmit={submitRequest} style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label>Reason for Refund *</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} required
                  placeholder="Explain why this sale needs to be refunded..." style={{ width: '100%', padding: '0.5rem', borderRadius: 4, border: '1px solid #cbd5e1', resize: 'vertical' }} />
              </div>
              <button className="btn btn-warning" type="submit" disabled={submitting || !reason.trim()}>
                {submitting ? 'Submitting...' : 'Submit Refund Request'}
              </button>
            </form>
          )}
          {sale.status === 'refunded' && (
            <div className="alert alert-warning" style={{ marginTop: '1rem' }}>This sale has already been refunded.</div>
          )}
        </div>
      )}
    </div>
  );
}
