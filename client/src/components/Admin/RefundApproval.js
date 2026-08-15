import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import ConfirmModal from '../UI/ConfirmModal';
import EntryDetailsModal from '../UI/EntryDetailsModal';

export default function RefundApproval() {
  const addToast = useToast();
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('pending');
  const [confirmAction, setConfirmAction] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => { load(); }, [tab]);

  const load = () => {
    api.get('/refund-requests', { params: { status: tab === 'all' ? undefined : tab } }).then(r => setRequests(r.data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))));
  };

  const handleApprove = async (remark) => {
    try {
      await api.put(`/refund-requests/${confirmAction._id}/approve`, { adminRemark: remark });
      addToast('Refund approved', 'success');
      setConfirmAction(null);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to approve', 'error');
    }
  };

  const handleReject = async (remark) => {
    try {
      await api.put(`/refund-requests/${confirmAction._id}/reject`, { adminRemark: remark });
      addToast('Refund rejected', 'warning');
      setConfirmAction(null);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to reject', 'error');
    }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <h1>Refund Requests</h1>
      </div>
      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>Pending</button>
        <button className={`tab ${tab === 'approved' ? 'active' : ''}`} onClick={() => setTab('approved')}>Approved</button>
        <button className={`tab ${tab === 'rejected' ? 'active' : ''}`} onClick={() => setTab('rejected')}>Rejected</button>
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Invoice</th><th>Requested By</th><th>Reason</th><th>Amount</th><th>Date</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {requests.map(r => (
              <tr key={r._id} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}>
                <td><strong>{r.invoiceNumber}</strong></td>
                <td>{r.requestedBy?.name || '-'}</td>
                <td>{r.reason}</td>
                <td>{formatNPR(r.sale?.grandTotal || 0)}</td>
                <td>{new Date(r.createdAt).toLocaleDateString('en-IN')}</td>
                <td>
                  <span className={`badge ${r.status === 'pending' ? 'badge-warning' : r.status === 'approved' ? 'badge-success' : 'badge-danger'}`}>{r.status}</span>
                  {r.adminRemark && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{r.adminRemark}</div>}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  {r.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-sm btn-success" onClick={() => setConfirmAction({ ...r, action: 'approve' })}>Approve</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmAction({ ...r, action: 'reject' })}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan="7" className="text-center">No refund requests</td></tr>}
          </tbody>
        </table>
      </div>
      <ConfirmModal open={confirmAction?.action === 'approve'} title="Approve Refund"
        message={`Approve refund for ${confirmAction?.invoiceNumber} (${formatNPR(confirmAction?.sale?.grandTotal || 0)})?`}
        remarkRequired onConfirm={(remark) => handleApprove(remark)} onCancel={() => setConfirmAction(null)} />
      <ConfirmModal open={confirmAction?.action === 'reject'} title="Reject Refund"
        message={`Reject refund for ${confirmAction?.invoiceNumber}?`}
        remarkRequired onConfirm={(remark) => handleReject(remark)} onCancel={() => setConfirmAction(null)} />
      {detail && (
        <EntryDetailsModal
          title={`Refund Request - ${detail.invoiceNumber}`}
          subtitle="Click row to view refund request details"
          meta={[
            { label: 'Requested By', value: detail.requestedBy?.name || '-' },
            { label: 'Date', value: new Date(detail.createdAt).toLocaleString('en-IN') },
            { label: 'Status', value: detail.status },
            { label: 'Payment Method', value: detail.sale?.paymentMethod || '-' },
            { label: 'Amount', value: formatNPR(detail.sale?.grandTotal || 0) },
            { label: 'Processed At', value: detail.approvedAt ? new Date(detail.approvedAt).toLocaleString('en-IN') : '-' },
          ]}
          columns={[
            { label: 'Particular', key: 'label' },
            { label: 'Detail', key: 'value' },
          ]}
          rows={[
            { label: 'Reason', value: detail.reason || '-' },
            { label: 'Admin Remark', value: detail.adminRemark || 'Not processed' },
            { label: 'Approved By', value: detail.approvedBy?.name || '-' },
          ]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
