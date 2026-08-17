import React, { useState } from 'react';

const STATUS_LABELS = {
  pending: 'Pending', processing: 'Processing', shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery', delivered: 'Delivered', returned: 'Returned',
};

const STATUS_ICONS = {
  pending: '1', processing: '2', shipped: '3', out_for_delivery: '4', delivered: '5', returned: '0',
};

const ALL_STATUSES = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered'];

export default function TrackPublic() {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!trackingNumber.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/public/track/${encodeURIComponent(trackingNumber.trim())}`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || 'Tracking number not found');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentIdx = result ? ALL_STATUSES.indexOf(result.status) : -1;
  const isReturned = result?.status === 'returned';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '2.5rem', width: '100%', maxWidth: '600px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.75rem', color: '#fff' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" /></svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.5rem' }}>Track Your Order</h1>
          <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>Enter your tracking number to see delivery status</p>
        </div>

        <form onSubmit={handleSearch} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)}
              placeholder="Enter tracking number"
              style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '1rem', outline: 'none', transition: 'border 0.2s' }}
              onFocus={e => e.target.style.borderColor = '#667eea'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
            <button type="submit" disabled={loading} style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '...' : 'Track'}
            </button>
          </div>
        </form>

        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.9rem', marginBottom: '1rem' }}>{error}</div>}

        {result && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px' }}>
              <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Order</span><br /><strong>{result.orderNumber}</strong></div>
              <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Status</span><br /><strong style={{ color: isReturned ? '#dc2626' : currentIdx >= 3 ? '#16a34a' : '#2563eb' }}>{STATUS_LABELS[result.status]}</strong></div>
              <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Carrier</span><br />{result.carrier ? result.carrier.toUpperCase() : '-'}</div>
              <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Tracking #</span><br />{result.trackingNumber || '-'}</div>
              {result.driver && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Driver</span><br />{result.driver.name}</div>}
              {result.branch && <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Branch</span><br />{result.branch.name}</div>}
            </div>

            <h4 style={{ marginBottom: '1rem', color: '#1e293b' }}>Delivery Progress</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '14px', left: '5%', right: '5%', height: '4px', background: '#e2e8f0', borderRadius: '2px', zIndex: 0 }} />
              <div style={{ position: 'absolute', top: '14px', left: '5%', width: `${Math.max(0, currentIdx) / (ALL_STATUSES.length - 1) * 90}%`, height: '4px', background: isReturned ? '#dc2626' : '#667eea', borderRadius: '2px', zIndex: 0, transition: 'width 0.5s ease' }} />
              {ALL_STATUSES.map((s, i) => (
                <div key={s} style={{ textAlign: 'center', position: 'relative', zIndex: 1, flex: 1 }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: i <= currentIdx && !isReturned ? '#667eea' : i === 0 && isReturned ? '#dc2626' : '#e2e8f0', transition: 'background 0.3s' }}>
                    {STATUS_ICONS[s]}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: i <= currentIdx && !isReturned ? '#1e293b' : '#94a3b8', fontWeight: i <= currentIdx && !isReturned ? 600 : 400 }}>{STATUS_LABELS[s]}</div>
                </div>
              ))}
            </div>

            <h4 style={{ marginTop: '1.5rem', marginBottom: '0.75rem', color: '#1e293b' }}>Timeline</h4>
            <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
              {(result.events || []).slice().reverse().map((ev, i) => (
                <div key={i} style={{ marginBottom: '1rem', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-1.5rem', top: '0.25rem', width: '10px', height: '10px', borderRadius: '50%', background: i === 0 ? '#667eea' : '#cbd5e1' }} />
                  {i < (result.events || []).length - 1 && <div style={{ position: 'absolute', left: '-1.25rem', top: '0.75rem', bottom: '-0.75rem', width: '2px', background: '#e2e8f0' }} />}
                  <div style={{ fontSize: '0.85rem' }}>
                    <strong style={{ color: '#1e293b' }}>{STATUS_LABELS[ev.status] || ev.status}</strong>
                    {ev.location && <span style={{ color: '#64748b' }}> — {ev.location}</span>}
                    {ev.note && <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{ev.note}</div>}
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{new Date(ev.timestamp).toLocaleString('en-GB')}</div>
                  </div>
                </div>
              ))}
              {(!result.events || result.events.length === 0) && <p style={{ color: '#94a3b8' }}>No events recorded yet</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
