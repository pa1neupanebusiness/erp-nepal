import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import { useNavigate } from 'react-router-dom';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import { formatDate as fmtDate } from '../UI/printEntry';
import { printCreditNote } from '../UI/printCreditNote';
import { printDebitNote } from '../UI/printDebitNote';

const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export default function SalesReturn() {
  const addToast = useToast();
  const navigate = useNavigate();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [sale, setSale] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnItems, setReturnItems] = useState({});
  const [processing, setProcessing] = useState(false);
  const [detail, setDetail] = useState(null);
  const [jeDetail, setJeDetail] = useState(null);
  const [tab, setTab] = useState('search');
  const [company, setCompany] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/sales').then(r => setReturns(r.data.filter(s => s.status === 'refunded').sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)))).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); api.get('/company').then(r => setCompany(r.data)).catch(() => {}); }, []);

  const search = async () => {
    if (!invoiceNumber.trim()) return;
    setSale(null);
    setSearching(true);
    try {
      const res = await api.get(`/sales/search/${encodeURIComponent(invoiceNumber.trim())}`);
      setSale(res.data);
      const items = {};
      res.data.items?.forEach(it => { items[it.product?._id || it.product] = { max: it.quantity, qty: it.quantity }; });
      setReturnItems(items);
    } catch (err) {
      addToast(err.response?.data?.message || 'Sale not found', 'error');
    } finally {
      setSearching(false);
    }
  };

  const toggleItem = (pid, checked) => {
    setReturnItems(prev => ({ ...prev, [pid]: { ...prev[pid], qty: checked ? prev[pid].max : 0 } }));
  };

  const setItemQty = (pid, qty) => {
    setReturnItems(prev => ({ ...prev, [pid]: { ...prev[pid], qty: Math.min(prev[pid].max, Math.max(0, qty)) } }));
  };

  const returnCount = Object.values(returnItems).filter(v => v.qty > 0).length;
  const returnTotal = sale ? sale.items.reduce((s, it) => {
    const pid = it.product?._id || it.product;
    const qty = returnItems[pid]?.qty || 0;
    return s + qty * it.price;
  }, 0) : 0;

  const processReturn = async () => {
    if (!returnReason.trim()) { addToast('Please provide a reason for return', 'error'); return; }
    if (returnCount === 0) { addToast('Select at least one item to return', 'error'); return; }
    setProcessing(true);
    try {
      await api.post('/sales/refund-by-invoice', { invoiceNumber: sale.invoiceNumber, remark: returnReason });
      addToast('Sale returned successfully. Stock restored & journal entries posted.', 'success');
      setSale({ ...sale, status: 'refunded', refundRemark: returnReason });
      setShowReturnForm(false);
      setReturnReason('');
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Return failed', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const openSaleDetail = async (row) => {
    setDetail(row);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Sales Returns</h1>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className={`btn ${tab === 'search' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('search')}>Search & Return</button>
        <button className={`btn ${tab === 'history' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('history')}>Return History ({returns.length})</button>
      </div>

      {tab === 'search' && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">Search Invoice</div>
            <div className="card-body">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569', marginBottom: '0.25rem', display: 'block' }}>Invoice Number</label>
                  <input
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && search()}
                    placeholder="e.g. INV-26-12345"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                  />
                </div>
                <button className="btn btn-primary" onClick={search} disabled={searching} style={{ height: '2.4rem' }}>
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
            </div>
          </div>

          {sale && !showReturnForm && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Invoice: {sale.invoiceNumber}</span>
                <span className={`badge ${sale.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{sale.status}</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Date</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{new Date(sale.date || sale.createdAt).toLocaleDateString('en-IN')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Customer</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{sale.customer?.name || 'Walk-in'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Payment</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{sale.paymentMethod}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Subtotal</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{fmt(sale.subtotal)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Discount</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{fmt(sale.discount)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>VAT</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{fmt(sale.taxTotal)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', gridColumn: 'span 2' }}>Grand Total</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{fmt(sale.grandTotal)}</div>
                  </div>
                </div>

                <table className="table" style={{ marginTop: '0.5rem' }}>
                  <thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                  <tbody>
                    {sale.items?.map((item, i) => (
                      <tr key={i}>
                        <td>{item.product?.name || 'Unknown'}</td>
                        <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(item.price)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {sale.status === 'completed' && (
                  <button className="btn btn-danger" onClick={() => setShowReturnForm(true)} style={{ marginTop: '0.75rem' }}>
                    Process Return
                  </button>
                )}
                {sale.status === 'refunded' && (
                  <div className="alert alert-warning" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                    <strong>Already Returned.</strong> Reason: {sale.refundRemark || 'N/A'}
                  </div>
                )}
              </div>
            </div>
          )}

          {sale && showReturnForm && (
            <div className="card">
              <div className="card-header">Return Items — {sale.invoiceNumber}</div>
              <div className="card-body">
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#991b1b' }}>
                  Returning items will restore stock and reverse the journal entries for selected items.
                </div>
                <table className="table">
                  <thead><tr><th style={{ width: 40 }}>Select</th><th>Product</th><th style={{ textAlign: 'right' }}>Purchased</th><th style={{ textAlign: 'right' }}>Return Qty</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {sale.items?.map((it, i) => {
                      const pid = it.product?._id || it.product;
                      const ri = returnItems[pid] || { max: 0, qty: 0 };
                      return (
                        <tr key={i}>
                          <td>
                            <input type="checkbox" checked={ri.qty > 0} onChange={e => toggleItem(pid, e.target.checked)} />
                          </td>
                          <td style={{ fontWeight: 500 }}>{it.product?.name || 'Unknown'}</td>
                          <td style={{ textAlign: 'right' }}>{ri.max}</td>
                          <td style={{ textAlign: 'right' }}>
                            <input type="number" min="0" max={ri.max} value={ri.qty || ''} disabled={ri.qty === 0}
                              onChange={e => setItemQty(pid, parseInt(e.target.value) || 0)}
                              style={{ width: 64, maxWidth: 64, padding: '0.25rem 0.4rem', borderRadius: 4, border: '1px solid #e2e8f0', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(ri.qty * it.price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                  <span>Return Total</span><span>{fmt(returnTotal)}</span>
                </div>

                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569', marginBottom: '0.25rem', display: 'block' }}>Reason for Return *</label>
                  <textarea
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    rows={3}
                    placeholder="Provide a reason for this return (required)"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.85rem', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button className="btn btn-secondary" onClick={() => setShowReturnForm(false)}>Cancel</button>
                  <button className="btn btn-danger" onClick={processReturn} disabled={processing || returnCount === 0 || !returnReason.trim()}>
                    {processing ? 'Processing...' : `Return ${returnCount} Item(s) for ${fmt(returnTotal)}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>Invoice</th><th>CN No</th><th>DN No</th><th>Date</th><th>Customer</th><th>Payment</th><th style={{ textAlign: 'right' }}>Total</th><th>Reason</th></tr></thead>
              <tbody>
                {returns.map(r => (
                  <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => openSaleDetail(r)}>
                    <td style={{ fontWeight: 600 }}>{r.invoiceNumber}</td>
                    <td>{r.creditNoteNumber || '-'}</td>
                    <td>{r.debitNoteNumber || '-'}</td>
                    <td>{new Date(r.date || r.createdAt).toLocaleDateString('en-IN')}</td>
                    <td>{r.customer?.name || 'Walk-in'}</td>
                    <td><span className="badge badge-secondary">{r.paymentMethod}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.grandTotal)}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.refundRemark || '-'}</td>
                  </tr>
                ))}
                {!loading && returns.length === 0 && <tr><td colSpan="8" className="text-center" style={{ padding: '2rem' }}>No returns recorded yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <EntryDetailsModal
          title={`Return — ${detail.invoiceNumber}`}
          subtitle={`${new Date(detail.date || detail.createdAt).toLocaleDateString('en-IN')} | ${detail.customer?.name || 'Walk-in'}`}
          meta={[
            { label: 'Invoice', value: detail.invoiceNumber },
            ...(detail.debitNoteNumber ? [{ label: 'Debit Note', value: detail.debitNoteNumber }] : []),
            ...(detail.creditNoteNumber ? [{ label: 'Credit Note', value: detail.creditNoteNumber }] : []),
            { label: 'Status', value: detail.status },
            { label: 'Payment', value: detail.paymentMethod },
            { label: 'Grand Total', value: fmt(detail.grandTotal) },
            { label: 'Reason', value: detail.refundRemark || '-' },
          ]}
          columns={[
            { key: 'product', label: 'Product', render: (v) => v?.name || v || 'Unknown' },
            { key: 'quantity', label: 'Qty', align: 'right' },
            { key: 'price', label: 'Price', align: 'right', render: (v) => fmt(v) },
            { key: 'subtotal', label: 'Amount', align: 'right', render: (v) => fmt(v) },
          ]}
          rows={detail.items || []}
          footer={[
            { label: 'Subtotal', value: fmt(detail.subtotal) },
            ...(detail.discount > 0 ? [{ label: 'Discount', value: `(${fmt(detail.discount)})` }] : []),
            ...(detail.taxTotal > 0 ? [{ label: 'VAT', value: fmt(detail.taxTotal) }] : []),
            { label: 'Grand Total', value: fmt(detail.grandTotal) },
          ]}
          actions={
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {detail.creditNoteNumber && <button className="btn btn-sm btn-secondary" onClick={() => printCreditNote(detail, company)}>Print Credit Note</button>}
              {detail.debitNoteNumber && <button className="btn btn-sm btn-secondary" onClick={() => printDebitNote(detail, company)}>Print Debit Note</button>}
            </div>
          }
          onRowClick={async (row) => {
            if (!row?._id) return;
            try {
              const { data } = await api.get(`/journal-entries/${row._id}`);
              setJeDetail(data);
            } catch {}
          }}
          onClose={() => setDetail(null)}
        />
      )}

      {jeDetail && (
        <EntryDetailsModal
          title="Journal Entry"
          subtitle={jeDetail.description}
          meta={[
            { label: 'Date', value: new Date(jeDetail.date).toLocaleDateString('en-IN') },
            { label: 'Reference', value: jeDetail.reference || '-' },
          ]}
          columns={[
            { key: 'account', label: 'Account', render: (v) => v ? `${v.code} - ${v.name}` : 'Deleted' },
            { key: 'debit', label: 'Debit', align: 'right', render: (v) => v > 0 ? fmt(v) : '-' },
            { key: 'credit', label: 'Credit', align: 'right', render: (v) => v > 0 ? fmt(v) : '-' },
          ]}
          rows={jeDetail.lines || []}
          footer={[
            { label: 'Total Debit', value: fmt((jeDetail.lines || []).reduce((s, l) => s + l.debit, 0)) },
            { label: 'Total Credit', value: fmt((jeDetail.lines || []).reduce((s, l) => s + l.credit, 0)) },
          ]}
          onClose={() => setJeDetail(null)}
        />
      )}
    </div>
  );
}
