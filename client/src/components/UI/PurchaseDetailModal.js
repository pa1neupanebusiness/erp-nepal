import React, { useState, useEffect } from 'react';
import api from '../../api';
import EntryDetailsModal from './EntryDetailsModal';

const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => { const t = new Date(d); return isNaN(t.getTime()) ? '-' : t.toLocaleDateString('en-IN'); };

export default function PurchaseDetailModal({ purchaseId, onClose, onPrint }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!purchaseId) return;
    setLoading(true);
    api.get(`/purchases/${purchaseId}`).then(r => setDetail(r.data)).catch(() => setDetail(null)).finally(() => setLoading(false));
  }, [purchaseId]);

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading...</div>
      </div>
    </div>
  );

  if (!detail) return null;

  return (
    <EntryDetailsModal
      title={`Purchase ${detail.purchaseNumber || ''}`}
      subtitle={`${fmtDate(detail.date || detail.createdAt)} | ${detail.supplier?.name || ''} | ${detail.paymentMethod || ''}`}
      meta={[
        { label: 'Supplier', value: detail.supplier?.name || '-' },
        { label: 'Payment', value: detail.paymentMethod || '-' },
        { label: 'Status', value: detail.status || '-' },
        { label: 'Grand Total', value: fmt(detail.grandTotal) },
        { label: 'Paid', value: fmt(detail.paidAmount) },
        { label: 'Due', value: fmt(detail.dueAmount) },
        ...(detail.notes ? [{ label: 'Notes', value: detail.notes }] : []),
      ]}
      columns={[
        { key: 'product', label: 'Item', wide: true, render: (v) => v?.name || v || 'Unknown' },
        { key: 'costPrice', label: 'Rate', align: 'right', render: (v) => fmt(v) },
        { key: 'quantity', label: 'Qty', align: 'right' },
        { key: 'subtotal', label: 'Amount', align: 'right', render: (v) => fmt(v) },
      ]}
      rows={detail.items || []}
      footer={[
        { label: 'Subtotal', value: fmt(detail.subtotal || 0) },
        ...(detail.discount > 0 ? [{ label: 'Discount', value: `(-${fmt(detail.discount)})` }] : []),
        ...(detail.taxTotal > 0 ? [{ label: 'VAT', value: fmt(detail.taxTotal) }] : []),
        { label: 'Grand Total', value: fmt(detail.grandTotal) },
        { label: 'Paid', value: fmt(detail.paidAmount) },
        { label: 'Due', value: fmt(detail.dueAmount) },
      ]}
      onPrint={() => onPrint && onPrint(detail)}
      onClose={onClose}
    />
  );
}
