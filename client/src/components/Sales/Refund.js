import React, { useState } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import ConfirmModal from '../UI/ConfirmModal';

export default function Refund() {
  const addToast = useToast();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const search = async () => {
    if (!invoiceNumber.trim()) return;
    setSale(null);
    try {
      const res = await api.get(`/sales/search/${invoiceNumber.trim()}`);
      setSale(res.data);
    } catch (err) {
      addToast(err.response?.data?.message || 'Sale not found', 'error');
    }
  };

  const processRefund = async (remark) => {
    setLoading(true);
    try {
      await api.post('/sales/refund-by-invoice', { invoiceNumber: sale.invoiceNumber, remark });
      setSale({ ...sale, status: 'refunded' });
      addToast('Refund processed successfully', 'success');
      setConfirm(null);
    } catch (err) {
      addToast(err.response?.data?.message || 'Refund failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <h1>Process Refund</h1>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label>Search by Invoice Number</label>
            <input
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="e.g. INV-26-12345"
            />
          </div>
          <button className="btn btn-primary" onClick={search}>Search</button>
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
          <table className="table" style={{ marginTop: '1rem' }}>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
            <tbody>
              {sale.items?.map((item, i) => (
                <tr key={i}>
                  <td>{item.product?.name || 'Unknown'}</td>
                  <td>{item.quantity}</td>
                   <td>{formatNPR(item.quantity > 0 ? (Number(item.subtotal) / Number(item.quantity)) : item.price)}</td>
                   <td>{formatNPR(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sale.status === 'completed' && (
            <button className="btn btn-danger" onClick={() => setConfirm(sale)} disabled={loading} style={{ marginTop: '1rem' }}>
              {loading ? 'Processing...' : 'Refund This Sale'}
            </button>
          )}
          {sale.status === 'refunded' && (
            <div className="alert alert-warning" style={{ marginTop: '1rem' }}>This sale has already been refunded.</div>
          )}
        </div>
      )}
      <ConfirmModal open={!!confirm} title="Refund Sale" message={`Refund sale ${confirm?.invoiceNumber} for Rs. ${confirm?.grandTotal?.toLocaleString('en-IN')}?`}
        remarkRequired onConfirm={processRefund} onCancel={() => setConfirm(null)} />
    </div>
  );
}
