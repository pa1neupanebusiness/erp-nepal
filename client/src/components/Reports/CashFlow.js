import React, { useState, useEffect } from 'react';
import api from '../../api';
import EntryDetailsModal from '../UI/EntryDetailsModal';

export default function CashFlow() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api.get('/accounts/cash-flow').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  if (loading) return <div className="text-center">Loading...</div>;

  return (
    <div>
      <div className="page-header"><h1>Cash Flow Report</h1></div>

      <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1rem' }}>
        <div className="card" style={{ borderLeft: '4px solid #059669' }}>
          <div className="card-label">Total Inflows</div>
          <div className="card-value text-success">{formatNPR(data?.totalInflows || 0)}</div>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div className="card-label">Total Outflows</div>
          <div className="card-value text-danger">{formatNPR(data?.totalOutflows || 0)}</div>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div className="card-label">Net Cash Position</div>
          <div className="card-value">{formatNPR(data?.netCash || 0)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card" style={{ maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ color: '#059669', marginBottom: '0.5rem', flexShrink: 0 }}>Cash Inflows (Recent)</h3>
          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <table className="table">
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}><tr><th>Date</th><th>Reference</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {data?.inflows?.map((i, idx) => (
                  <tr key={idx} onClick={() => setDetail({ ...i, flow: 'Inflow' })} style={{ cursor: 'pointer' }}>
                    <td>{new Date(i.date).toLocaleDateString('en-IN')}</td>
                    <td>{i.reference || '-'}</td>
                    <td>{i.description}</td>
                    <td className="text-right text-success" style={{ fontWeight: 600 }}>{formatNPR(i.amount)}</td>
                  </tr>
                ))}
                {data?.inflows?.length === 0 && <tr><td colSpan="4" className="text-center">No inflows</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card" style={{ maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ color: '#dc2626', marginBottom: '0.5rem', flexShrink: 0 }}>Cash Outflows (Recent)</h3>
          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <table className="table">
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}><tr><th>Date</th><th>Reference</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {data?.outflows?.map((o, idx) => (
                  <tr key={idx} onClick={() => setDetail({ ...o, flow: 'Outflow' })} style={{ cursor: 'pointer' }}>
                    <td>{new Date(o.date).toLocaleDateString('en-IN')}</td>
                    <td>{o.reference || '-'}</td>
                    <td>{o.description}</td>
                    <td className="text-right text-danger" style={{ fontWeight: 600 }}>{formatNPR(o.amount)}</td>
                  </tr>
                ))}
                {data?.outflows?.length === 0 && <tr><td colSpan="4" className="text-center">No outflows</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detail && (
        <EntryDetailsModal
          title={`${detail.flow} Entry`}
          subtitle="Click row to view cash flow entry details"
          meta={[
            { label: 'Type', value: detail.flow },
            { label: 'Date', value: new Date(detail.date).toLocaleString('en-IN') },
            { label: 'Reference', value: detail.reference || '-' },
            { label: 'Amount', value: formatNPR(detail.amount) },
          ]}
          columns={[
            { label: 'Particular', key: 'label' },
            { label: 'Detail', key: 'value' },
          ]}
          rows={[{ label: 'Description', value: detail.description || '-' }]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
