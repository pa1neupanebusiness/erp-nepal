import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import DownloadBtn, { PrintBtn } from '../DownloadBtn';
import { useToast } from '../UI/Toast';
import ConfirmModal from '../UI/ConfirmModal';
import { printInvoice } from '../POS/PrintInvoice';
import { printEmiRecord } from '../UI/printEmi';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

export default function SalesList() {
  const navigate = useNavigate();
  const addToast = useToast();
  const [items, setItems] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [confirmRefund, setConfirmRefund] = useState(null);
  const [company, setCompany] = useState(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';

  useEffect(() => { load(); api.get('/company').then(r => setCompany(r.data)).catch(() => {}); }, []);

  const load = () => {
    const params = {};
    if (startDate) params.startDate = bsToADStr(startDate);
    if (endDate) params.endDate = bsToADStr(endDate);
    Promise.all([
      api.get('/sales', { params }),
      api.get('/emis', { params }),
    ]).then(([salesRes, emiRes]) => {
      const emiRows = (emiRes.data || []).map(e => ({
        _id: e._id,
        kind: 'emi',
        invoiceNumber: e.emiNumber,
        createdAt: e.createdAt,
        customer: e.customer,
        items: e.product ? [{ product: e.product, quantity: 1, price: e.productTotal, tax: 0, subtotal: e.productTotal }] : [],
        paymentMethod: 'EMI',
        grandTotal: e.netAmount,
        amountPaid: e.downPayment,
        change: 0,
        status: 'completed',
        cashier: e.createdBy,
        emiData: e,
      }));
      setItems([...salesRes.data, ...emiRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });
  };

  const handleRefund = async (remark) => {
    try {
      await api.post(`/sales/${confirmRefund._id}/refund`, { remark });
      addToast(`Sale ${confirmRefund.invoiceNumber} refunded`, 'success');
      setConfirmRefund(null);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Refund failed', 'error');
    }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const totalSales = items.reduce((s, i) => s + i.grandTotal, 0);

  return (
    <div>
        <div className="page-header">
        <h1>Sales History</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={() => navigate('/sales/new')}>+ New Invoice</button>
          <DownloadBtn endpoint="sales" label="Excel" type="excel" filename="sales_report" />
          <DownloadBtn endpoint="sales" label="PDF" type="pdf" filename="sales_report" />
          <PrintBtn endpoint="sales" />
        </div>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>From</label>
            <NepaliDatePicker value={startDate} onChange={setStartDate} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>To</label>
            <NepaliDatePicker value={endDate} onChange={setEndDate} />
          </div>
          <button className="btn btn-primary" onClick={load}>Filter</button>
          <button className="btn btn-secondary" onClick={() => { setStartDate(''); setEndDate(''); }}>All</button>
          <input type="text" placeholder="Search customer / invoice..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '0.4rem 0.7rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', minWidth: 200 }} />
          <div style={{ marginLeft: 'auto', fontWeight: 'bold' }}>Total: {formatNPR(totalSales)}</div>
        </div>
      </div>
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Items</th><th>Subtotal</th><th>Discount</th><th>Payment</th><th>Amount</th><th>Paid</th><th>Due</th><th>Status</th><th>Cashier</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map(s => (
                <tr key={s._id} style={{ cursor: 'pointer' }} onClick={() => setDetail(s)}>
                  <td>{s.invoiceNumber}{s.emiData?.exchangeEnabled && <span className="badge badge-warning" style={{ marginLeft: '0.35rem' }}>Exchange</span>}</td>
                  <td>{new Date(s.createdAt).toLocaleDateString('en-IN')}</td>
                  <td>{s.customer?.name || 'Walk-in'}</td>
                  <td>{s.items?.length || 0}</td>
                  <td>{formatNPR(s.subtotal)}</td>
                  <td>{s.discount > 0 ? <span style={{ color: '#dc2626' }}>-{formatNPR(s.discount)}</span> : '-'}</td>
                  <td>{s.kind === 'emi' ? <span className="badge badge-info">EMI</span> : s.paymentMethod === 'split' ? (s.paymentSplits || []).map(sp => sp.method).join('+') : s.paymentMethod}</td>
                  <td>{formatNPR(s.grandTotal)}</td>
                  <td>{formatNPR(s.amountPaid)}</td>
                  <td>{(s.dueAmount || 0) > 0 ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{formatNPR(s.dueAmount)}</span> : '-'}</td>
                  <td><span className={`badge ${s.status === 'refunded' ? 'badge-warning' : s.status === 'cancelled' ? 'badge-danger' : (s.paymentStatus === 'paid' || (s.dueAmount || 0) <= 0) ? 'badge-success' : (s.paymentStatus === 'partial' || s.amountPaid > 0) ? 'badge-warning' : 'badge-info'}`}>{s.status === 'refunded' ? 'refunded' : s.status === 'cancelled' ? 'cancelled' : s.paymentStatus || ((s.dueAmount || 0) <= 0 ? 'paid' : s.amountPaid > 0 ? 'partial' : 'unpaid')}</span></td>
                  <td>{s.cashier?.name || '-'}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => setDetail(detail?._id === s._id ? null : s)}>View</button>
                    {s.kind === 'emi' && (
                      <button className="btn btn-sm btn-secondary" style={{ marginLeft: '0.25rem' }} onClick={() => printEmiRecord(s)}>Print</button>
                    )}
                    {s.kind !== 'emi' && (
                      <>
                        {isAdmin && s.status === 'completed' && (
                          <button className="btn btn-sm btn-secondary" style={{ marginLeft: '0.25rem' }} onClick={() => navigate(`/sales/edit/${s._id}`)}>Edit</button>
                        )}
                        <button className="btn btn-sm btn-secondary" style={{ marginLeft: '0.25rem' }} onClick={() => printInvoice(s, company)}>Print</button>
                        {s.status === 'completed' && (
                          <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.25rem' }} onClick={() => isAdmin ? setConfirmRefund(s) : navigate('/request-refund')}>{isAdmin ? 'Refund' : 'Request'}</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan="13" className="text-center">No sales found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {detail && detail.kind !== 'emi' && detail.items && detail.items.length > 0 && (
        <EntryDetailsModal
          onPrint={() => printInvoice(detail, company)}
          title={`Sale ${detail.invoiceNumber}`}
          subtitle={`${new Date(detail.createdAt).toLocaleString('en-IN')} | ${detail.customer?.name || 'Walk-in'} | ${detail.paymentMethod}`}
          meta={[
            { label: 'Customer', value: detail.customer?.name || 'Walk-in' },
            { label: 'Payment', value: detail.paymentMethod === 'split' ? (detail.paymentSplits || []).map(s => `${s.method}: ${formatNPR(s.amount)}`).join(' + ') : detail.paymentMethod },
            { label: 'Status', value: detail.status },
            { label: 'Grand Total', value: formatNPR(detail.grandTotal) },
            { label: 'Paid', value: formatNPR(detail.amountPaid) },
            { label: 'Change', value: formatNPR(detail.change) },
            ...(detail.notes ? [{ label: 'Notes', value: detail.notes }] : []),
          ]}
          columns={[
            { key: 'product', label: 'Item', wide: true, render: (v) => v?.name || v || 'Unknown' },
            { key: 'price', label: 'Rate', align: 'right', render: (v) => formatNPR(v) },
            { key: 'quantity', label: 'Qty', align: 'right' },
            { key: 'subtotal', label: 'Amount', align: 'right', render: (v) => formatNPR(v) },
          ]}
          rows={detail.items || []}
          footer={[
            { label: 'Subtotal', value: formatNPR(detail.subtotal) },
            ...(detail.discount > 0 ? [{ label: 'Discount', value: `(-${formatNPR(detail.discount)})` }] : []),
            ...(detail.taxTotal > 0 ? [{ label: 'VAT', value: formatNPR(detail.taxTotal) }] : []),
            { label: 'Grand Total', value: formatNPR(detail.grandTotal) },
            { label: 'Paid', value: formatNPR(detail.amountPaid) },
            { label: 'Change', value: formatNPR(detail.change) },
          ]}
          onClose={() => setDetail(null)}
        />
      )}
      {detail && detail.kind === 'emi' && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3>EMI Sale Details - {detail.invoiceNumber}</h3>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => printEmiRecord(detail, company)}>Print Invoice</button>
                <button className="btn btn-sm modal-close-x" onClick={() => setDetail(null)}>×</button>
              </div>
            </div>
            <div className="modal-body">
          <table className="table">
            <tbody>
              <tr><td><strong>Product</strong></td><td>{detail.emiData?.product?.name || '-'}</td></tr>
              <tr><td><strong>Product Total</strong></td><td>{formatNPR(detail.emiData?.productTotal)}</td></tr>
              {detail.emiData?.exchangeEnabled && (
                <>
                  <tr><td><strong>Exchange</strong></td><td>{formatNPR(detail.emiData?.exchangeAmount)}</td></tr>
                  <tr><td><strong>Exchange Customer</strong></td><td>{detail.emiData?.exchangeCustomerName || '-'}</td></tr>
                  <tr><td><strong>Exchange Paid Amount</strong></td><td>{formatNPR(detail.emiData?.exchangePaidAmount)}</td></tr>
                </>
              )}
              <tr><td><strong>Net Amount</strong></td><td>{formatNPR(detail.emiData?.netAmount)}</td></tr>
              <tr><td><strong>Down Payment</strong></td><td>{formatNPR(detail.emiData?.downPayment)}</td></tr>
              <tr><td><strong>Remaining (Receivable)</strong></td><td>{formatNPR(detail.emiData?.remainingAmount)}{detail.emiData?.bankName ? ` via EMI-(${detail.emiData.bankName})` : ''}</td></tr>
              <tr><td><strong>Bank</strong></td><td>{detail.emiData?.bankName ? `EMI-(${detail.emiData.bankName})` : '-'}</td></tr>
              <tr><td><strong>Customer</strong></td><td>{detail.customer?.name || '-'}</td></tr>
            </tbody>
          </table>
          {(detail.emiData?.exchangeItems || []).length > 0 && (
            <>
              <h4 style={{ margin: '0.5rem 0' }}>Exchange Items (Added to Stock)</h4>
              <table className="table">
                <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Subtotal</th></tr></thead>
                <tbody>
                  {detail.emiData.exchangeItems.map((it, i) => (
                    <tr key={i}>
                      <td>{it.product?.name || '-'}</td>
                      <td className="text-right">{it.quantity}</td>
                      <td className="text-right">{formatNPR(it.price)}</td>
                      <td className="text-right">{formatNPR(it.price * it.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          </div>
          </div>
        </div>
      )}
      <ConfirmModal open={!!confirmRefund} title="Refund Sale" message={`Refund sale ${confirmRefund?.invoiceNumber} for Rs. ${confirmRefund?.grandTotal?.toLocaleString('en-IN')}?`}
        remarkRequired onConfirm={handleRefund} onCancel={() => setConfirmRefund(null)} />
    </div>
  );
}
