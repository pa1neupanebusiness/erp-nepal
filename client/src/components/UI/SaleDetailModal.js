import React, { useState, useEffect } from 'react';
import api from '../../api';
import EntryDetailsModal from './EntryDetailsModal';

const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => { const t = new Date(d); return isNaN(t.getTime()) ? '-' : t.toLocaleDateString('en-IN'); };

export default function SaleDetailModal({ saleId, onClose, onPrint }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!saleId) return;
    setLoading(true);
    api.get(`/sales/${saleId}`).then(r => setDetail(r.data)).catch(() => setDetail(null)).finally(() => setLoading(false));
  }, [saleId]);

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading...</div>
      </div>
    </div>
  );

  if (!detail) return null;

  const hasSplits = detail.paymentMethod === 'split' && (detail.paymentSplits || []).length > 0;
  const paymentDisplay = hasSplits
    ? detail.paymentSplits.map(s => `${s.method}: ${fmt(s.amount)}`).join(' + ')
    : detail.paymentMethod || '-';

  return (
    <EntryDetailsModal
      title={`Sale ${detail.invoiceNumber || ''}`}
      subtitle={`${fmtDate(detail.createdAt)} | ${detail.customer?.name || 'Walk-in'} | ${detail.paymentMethod || ''}`}
      meta={[
        { label: 'Customer', value: detail.customer?.name || 'Walk-in' },
        { label: 'Payment', value: paymentDisplay },
        { label: 'Status', value: detail.status || '-' },
        ...(detail.invoiceDate ? [{ label: 'Invoice Date', value: fmtDate(detail.invoiceDate) }] : []),
        { label: 'Grand Total', value: fmt(detail.grandTotal) },
        { label: 'Paid', value: fmt(detail.amountPaid) },
        { label: 'Due', value: fmt(detail.dueAmount) },
        { label: 'Change', value: fmt(detail.change) },
        ...(detail.extraCharge?.amount > 0 ? [{ label: detail.extraCharge.remarks ? `Extra Charge (${detail.extraCharge.remarks})` : 'Extra Charge', value: `+ ${fmt(detail.extraCharge.amount)}` }] : []),
        ...(detail.creditNoteNumber ? [{ label: 'Credit Note', value: detail.creditNoteNumber }] : []),
        ...(detail.debitNoteNumber ? [{ label: 'Debit Note', value: detail.debitNoteNumber }] : []),
        ...(detail.notes ? [{ label: 'Notes', value: detail.notes }] : []),
      ]}
      columns={[
        { key: 'product', label: 'Item', wide: true, render: (v) => v?.name || v || 'Unknown' },
        { key: 'price', label: 'Rate', align: 'right', render: (v, r) => fmt(r.quantity > 0 ? (Number(r.subtotal) / Number(r.quantity)) : v) },
        { key: 'quantity', label: 'Qty', align: 'right' },
        { key: 'subtotal', label: 'Amount', align: 'right', render: (v) => fmt(v) },
      ]}
      rows={detail.items || []}
      footer={[
        { label: 'Subtotal', value: fmt((detail.subtotal || 0) + (detail.extraCharge?.amount || 0)) },
        ...(detail.discount > 0 ? [{ label: 'Discount', value: `(-${fmt(detail.discount)})` }] : []),
        ...(detail.taxTotal > 0 ? [{ label: 'Taxable Amount', value: fmt((detail.subtotal || 0) + (detail.extraCharge?.amount || 0) - (detail.discount || 0)) }, { label: 'VAT', value: fmt(detail.taxTotal) }] : []),
        { label: 'Grand Total', value: fmt(detail.grandTotal) },
        { label: 'Paid', value: fmt(detail.amountPaid) },
        { label: 'Change', value: fmt(detail.change) },
      ]}
      onPrint={() => onPrint && onPrint(detail)}
      onClose={onClose}
    />
  );
}
