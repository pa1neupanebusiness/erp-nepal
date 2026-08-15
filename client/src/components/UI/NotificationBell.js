import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const typeIcons = { sale: '🧾', purchase: '📦', payment_in: '💰', payment_out: '💸' };
const typeRoutes = { sale: '/sales', purchase: '/purchases', payment_in: '/sales/payment-in', payment_out: '/purchases/payment-out' };

export default function NotificationBell({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const groups = user?.groups || [];
  const isAccountUser = isAdmin || groups.includes('accounts');
  if (!isAccountUser) return null;

  const load = useCallback(() => {
    api.get('/notifications').then(r => {
      setNotifications(r.data.notifications || []);
      setUnreadCount(r.data.unreadCount || 0);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && unreadCount > 0) {
      api.put('/notifications/read-all').then(() => setUnreadCount(0)).catch(() => {});
    }
  }, [open, unreadCount]);

  const clearAll = async () => {
    await api.delete('/notifications/clear');
    setNotifications([]);
    setUnreadCount(0);
    setShowAll(false);
  };

  const handleNotificationClick = (n) => {
    const route = typeRoutes[n.type] || '/sales';
    navigate(route);
    setOpen(false);
  };

  const displayed = showAll ? notifications : notifications.slice(0, 3);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: '4px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, background: '#ef4444', color: '#fff',
            fontSize: '0.6rem', fontWeight: 700, borderRadius: '50%', width: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 9999, marginTop: 6,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 6px 24px rgba(0,0,0,0.15)', width: 340, maxHeight: 420, overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Notifications</span>
            {notifications.length > 0 && (
              <button onClick={clearAll} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Clear All</button>
            )}
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 340 }}>
            {displayed.length === 0 && (
              <div style={{ padding: '24px 14px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>No notifications</div>
            )}
            {displayed.map(n => (
              <div key={n._id} onClick={() => handleNotificationClick(n)} style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: 2 }}>{typeIcons[n.type] || '📋'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1e293b' }}>{n.title}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</div>
                  {n.amount > 0 && <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#059669', marginTop: 2 }}>Rs. {n.amount.toLocaleString('en-IN')}</div>}
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>{new Date(n.createdAt).toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))}
          </div>
          {notifications.length > 3 && !showAll && (
            <div style={{ padding: '8px 14px', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setShowAll(true)} style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                Show More ({notifications.length - 3} more)
              </button>
            </div>
          )}
          {showAll && notifications.length > 3 && (
            <div style={{ padding: '8px 14px', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setShowAll(false)} style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>Show Less</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
