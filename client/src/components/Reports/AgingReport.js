import React, { useState, useEffect } from 'react';
import api from '../../api';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import { useToast } from '../UI/Toast';

export default function AgingReport() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('receivable');
  const [detail, setDetail] = useState(null);
  const [detailType, setDetailType] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ date: adToBsStr(new Date()), amount: '', method: 'cash', bank: '', remarks: '' });
  const [banks, setBanks] = useState([]);
  const [paying, setPaying] = useState(false);
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  const hasAccountsAccess = isAdmin || (user.groups || []).includes('accounts');

  useEffect(() => {
    api.get('/accounts/aging').then(r => setData(r.data)).catch(() => {});
    api.get('/accounts/banks').then(r => setBanks(r.data || [])).catch(() => {});
  }, []);

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const bucketColors = { '0-30 days': 'badge-success', '31-60 days': 'badge-warning', '61-90 days': 'badge-warning', '90+ days': 'badge-danger' };

  const bucketTotals = (list) => {
    const totals = {};
    list?.forEach(i => { totals[i.bucket] = (totals[i.bucket] || 0) + i.amount; });
    return totals;
  };

  const totalReceivable = (data?.receivable || []).reduce((s, r) => s + (r.amount || 0), 0);
  const totalPayable = (data?.payable || []).reduce((s, p) => s + (p.amount || 0), 0);

  const handleReceivableClick = async (r) => {
    if (r.type === 'EMI') {
      try { const { data: emi } = await api.get(`/emis/${r._id}`); setDetail(emi); setDetailType('emi'); } catch {}
    } else {
      try { const { data: sale } = await api.get(`/sales/${r._id}`); setDetail(sale); setDetailType('sale'); } catch {}
    }
  };

  const handlePayableClick = async (p) => {
    try {
      const { data: purchase } = await api.get(`/purchases/${p._id}`);
      setDetail(purchase);
      setDetailType('purchase');
    } catch {}
  };

  const openPayModal = (purchase) => {
    setPayForm({ date: adToBsStr(new Date()), amount: String(purchase.dueAmount || ''), method: 'cash', bank: '', remarks: '' });
    setShowPayModal(true);
  };

  const handlePay = async () => {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) return addToast('Enter valid amount', 'error');
    if (parseFloat(payForm.amount) > (detail.dueAmount || 0)) return addToast(`Amount exceeds due (${formatNPR(detail.dueAmount)})`, 'error');
    setPaying(true);
    try {
      await api.post('/payment-out', {
        date: bsToADStr(payForm.date),
        supplier: detail.supplier?._id || detail.supplier,
        amount: parseFloat(payForm.amount),
        method: payForm.method,
        bank: payForm.method === 'cash' ? undefined : (payForm.bank || undefined),
        chequeNumber: '',
        remarks: payForm.remarks || `Payment from Aging Report`,
      });
      addToast('Payment recorded successfully', 'success');
      setShowPayModal(false);
      setDetail(null);
      api.get('/accounts/aging').then(r => setData(r.data)).catch(() => {});
    } catch (err) {
      addToast(err.response?.data?.message || 'Payment failed', 'error');
    }
    setPaying(false);
  };

  return (
    <div>
      <div className="page-header"><h1>Aging Report</h1></div>

      <div className="tabs">
        <button className={`tab ${tab === 'receivable' ? 'active' : ''}`} onClick={() => setTab('receivable')}>Accounts Receivable - {data?.receivable?.length || 0} items</button>
        <button className={`tab ${tab === 'payable' ? 'active' : ''}`} onClick={() => setTab('payable')}>Accounts Payable - {data?.payable?.length || 0} items</button>
      </div>

      <div className="card">
        {tab === 'receivable' && (
          <div>
            <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1rem' }}>
              <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
                <div className="card-label">Total Receivable</div>
                <div className="card-value" style={{ fontSize: '1.2rem' }}>{formatNPR(totalReceivable)}</div>
              </div>
              {Object.entries(bucketTotals(data?.receivable)).map(([bucket, total]) => (
                <div key={bucket} className="card" style={{ borderLeft: `4px solid ${bucket === '90+ days' ? '#dc2626' : bucket === '0-30 days' ? '#059669' : '#d97706'}` }}>
                  <div className="card-label">{bucket}</div>
                  <div className="card-value" style={{ fontSize: '1.1rem' }}>{formatNPR(total)}</div>
                </div>
              ))}
            </div>
            <table className="table">
              <thead><tr><th>Customer</th><th>Phone</th><th>Invoice</th><th>Bank</th><th>Date</th><th>Amount</th><th>Aging</th></tr></thead>
              <tbody>
                {data?.receivable?.map((r, i) => (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => handleReceivableClick(r)}>
                    <td>{r.customer}</td><td>{r.phone}</td>
                    <td>{r.invoice}{r.type === 'EMI' && <span className="badge badge-info" style={{ marginLeft: '0.35rem' }}>EMI</span>}</td>
                    <td>{r.bank || '-'}</td><td>{new Date(r.date).toLocaleDateString('en-IN')}</td>
                    <td>{formatNPR(r.amount)}</td>
                    <td><span className={`badge ${bucketColors[r.bucket] || 'badge-warning'}`}>{r.bucket}</span></td>
                  </tr>
                ))}
                {data?.receivable?.length === 0 && <tr><td colSpan="7" className="text-center">No receivables</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'payable' && (
          <div>
            <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1rem' }}>
              <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
                <div className="card-label">Total Payable</div>
                <div className="card-value" style={{ fontSize: '1.2rem' }}>{formatNPR(totalPayable)}</div>
              </div>
              {Object.entries(bucketTotals(data?.payable)).map(([bucket, total]) => (
                <div key={bucket} className="card" style={{ borderLeft: `4px solid ${bucket === '90+ days' ? '#dc2626' : bucket === '0-30 days' ? '#059669' : '#d97706'}` }}>
                  <div className="card-label">{bucket}</div>
                  <div className="card-value" style={{ fontSize: '1.1rem' }}>{formatNPR(total)}</div>
                </div>
              ))}
            </div>
            <table className="table">
              <thead><tr><th>Supplier</th><th>Purchase#</th><th>Date</th><th>Due Amount</th><th>Aging</th></tr></thead>
              <tbody>
                {data?.payable?.map((p, i) => (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => handlePayableClick(p)}>
                    <td>{p.supplier}</td><td>{p.purchaseNumber}</td>
                    <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                    <td className="text-danger">{formatNPR(p.amount)}</td>
                    <td><span className={`badge ${bucketColors[p.bucket] || 'badge-warning'}`}>{p.bucket}</span></td>
                  </tr>
                ))}
                {data?.payable?.length === 0 && <tr><td colSpan="5" className="text-center">No payables</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && detailType === 'sale' && (
        <EntryDetailsModal
          title={`Sale ${detail.invoiceNumber}`}
          subtitle={`${new Date(detail.createdAt).toLocaleString('en-IN')} | ${detail.customer?.name || 'Walk-in'}`}
          meta={[
            { label: 'Customer', value: detail.customer?.name || 'Walk-in' },
            { label: 'Payment', value: detail.paymentMethod },
            { label: 'Status', value: detail.status },
            { label: 'Grand Total', value: formatNPR(detail.grandTotal) },
            { label: 'Paid', value: formatNPR(detail.amountPaid) },
            { label: 'Due', value: formatNPR((detail.grandTotal || 0) - (detail.amountPaid || 0)) },
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
          ]}
          onClose={() => setDetail(null)}
        />
      )}
      {detail && detailType === 'purchase' && (
        <EntryDetailsModal
          title={`Purchase ${detail.purchaseNumber}`}
          subtitle={`${new Date(detail.date).toLocaleDateString('en-IN')} | ${detail.supplier?.name || '-'}`}
          meta={[
            { label: 'Supplier', value: detail.supplier?.name || '-' },
            { label: 'Status', value: detail.status },
            { label: 'Grand Total', value: formatNPR(detail.grandTotal) },
            { label: 'Paid', value: formatNPR(detail.paidAmount) },
            { label: 'Due', value: formatNPR(detail.dueAmount) },
          ]}
          columns={[
            { key: 'product', label: 'Product', render: (v) => v?.name || v || 'Unknown' },
            { key: 'quantity', label: 'Qty', align: 'right' },
            { key: 'costPrice', label: 'Rate', align: 'right', render: (v) => formatNPR(v) },
            { key: 'subtotal', label: 'Amount', align: 'right', render: (v) => formatNPR(v) },
          ]}
          rows={detail.items || []}
          footer={[
            { label: 'Subtotal', value: formatNPR(detail.subtotal) },
            ...(detail.tax > 0 ? [{ label: 'VAT', value: formatNPR(detail.tax) }] : []),
            { label: 'Grand Total', value: formatNPR(detail.grandTotal) },
            { label: 'Paid', value: formatNPR(detail.paidAmount) },
            { label: 'Due', value: formatNPR(detail.dueAmount) },
          ]}
          actions={hasAccountsAccess && detail.dueAmount > 0 ? (
            <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); openPayModal(detail); }}>Pay {formatNPR(detail.dueAmount)}</button>
          ) : undefined}
          onClose={() => setDetail(null)}
        />
      )}
      {detail && detailType === 'emi' && (
        <EntryDetailsModal
          title={`EMI ${detail.emiNumber}`}
          subtitle={`${new Date(detail.createdAt).toLocaleString('en-IN')} | ${detail.customer?.name || '-'}`}
          meta={[
            { label: 'Customer', value: detail.customer?.name || '-' },
            { label: 'Product', value: detail.product?.name || '-' },
            { label: 'Net Amount', value: formatNPR(detail.netAmount) },
            { label: 'Down Payment', value: formatNPR(detail.downPayment) },
            { label: 'Remaining', value: formatNPR(detail.remainingAmount) },
            { label: 'Status', value: detail.paidStatus || 'pending' },
          ]}
          columns={[]}
          rows={[]}
          footer={[]}
          onClose={() => setDetail(null)}
        />
      )}

      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Pay Supplier - {detail?.supplier?.name || ''}</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setShowPayModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                Outstanding Due: <strong>{formatNPR(detail?.dueAmount || 0)}</strong>
                <div style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: '0.25rem' }}>Purchase: {detail?.purchaseNumber} | Supplier: {detail?.supplier?.name || '-'}</div>
              </div>
              <div className="form-group"><label>Date</label><NepaliDatePicker value={payForm.date} onChange={v => setPayForm(f => ({ ...f, date: v }))} /></div>
              <div className="form-group"><label>Amount (Rs.)</label><input type="number" step="0.01" min="1" max={detail?.dueAmount || 0} value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} required /></div>
              <div className="form-group"><label>Pay From</label>
                <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value, bank: '' }))}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              {payForm.method === 'bank' && (
                <div className="form-group"><label>Bank Account</label>
                  <select value={payForm.bank} onChange={e => setPayForm(f => ({ ...f, bank: e.target.value }))}>
                    <option value="">Select bank...</option>
                    {banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group"><label>Remarks</label><input value={payForm.remarks} onChange={e => setPayForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowPayModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handlePay} disabled={paying || !payForm.amount}>{paying ? 'Processing...' : 'Confirm Payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
