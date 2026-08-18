import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { Icon } from '../Layout/Layout';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import { printInvoice } from '../POS/PrintInvoice';

const CARD_GLASS = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.45)',
};

const kpiConfigs = (data, formatNPR, navigate, salesPath) => [
  {
    key: 'today', label: "Today's Sales", icon: 'sales', color: '#059669',
    value: formatNPR(data?.todaySales || 0),
    badge: `+${data?.todayCount || 0} today`, badgeClass: 'positive',
    onClick: () => navigate(salesPath),
  },
  {
    key: 'month', label: 'Monthly Sales', icon: 'sales', color: '#d97706',
    value: formatNPR(data?.monthSales || 0),
    badge: 'This month', badgeClass: '',
    onClick: () => navigate(salesPath),
  },
  {
    key: 'cash', label: 'Cash in Hand', icon: 'cashflow', color: '#16a34a',
    value: formatNPR(data?.cashBalance || 0),
    badge: 'Cash', badgeClass: '',
    onClick: () => navigate('/accounts'),
  },
  {
    key: 'bank', label: 'Bank Balance', icon: 'cashflow', color: '#ca8a04',
    value: formatNPR(data?.bankBalance || 0),
    badge: 'Bank', badgeClass: '',
    onClick: () => navigate('/accounts/banks'),
  },
  {
    key: 'products', label: 'Total Products', icon: 'product', color: '#7c3aed',
    value: String(data?.totalProducts || 0),
    badge: `${data?.lowStock || 0} low stock`, badgeClass: (data?.lowStock || 0) > 0 ? 'negative' : 'positive',
    onClick: () => navigate('/products'),
  },
  {
    key: 'stock', label: 'Stock Valuation', icon: 'product', color: '#0891b2',
    value: formatNPR(data?.stockValuation || 0),
    badge: 'Inventory', badgeClass: '',
    onClick: () => navigate('/products'),
  },
];

const kpiConfigsStaff = (data, formatNPR, navigate, salesPath) => [
  {
    key: 'today', label: "Today's Sales", icon: 'sales', color: '#059669',
    value: formatNPR(data?.todaySales || 0),
    badge: `+${data?.todayCount || 0} today`, badgeClass: 'positive',
    onClick: () => navigate(salesPath),
  },
  {
    key: 'refund', label: "Today's Refunds", icon: 'refund', color: '#e11d48',
    value: formatNPR(data?.todayRefunds || 0),
    badge: 'Today', badgeClass: '',
    onClick: () => navigate(salesPath),
  },
  {
    key: 'month', label: 'Monthly Sales', icon: 'sales', color: '#d97706',
    value: formatNPR(data?.monthSales || 0),
    badge: 'This month', badgeClass: '',
    onClick: () => navigate(salesPath),
  },
  {
    key: 'refundMonth', label: 'Monthly Refunds', icon: 'refund', color: '#db2777',
    value: formatNPR(data?.monthRefunds || 0),
    badge: 'This month', badgeClass: '',
    onClick: () => navigate(salesPath),
  },
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [recentSales, setRecentSales] = useState([]);
  const [chart, setChart] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [branchStats, setBranchStats] = useState([]);
  const [timeGreeting, setTimeGreeting] = useState('');
  const [detail, setDetail] = useState(null);
  const [showBanks, setShowBanks] = useState(false);
  const [company, setCompany] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const navigate = useNavigate();
  const { selectedYear } = useFiscalYear();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = isSuperAdmin || user.role === 'admin';
  const groups = user.groups || [];
  const hasGroup = (g) => isAdmin || groups.includes(g);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setTimeGreeting('Good Morning');
    else if (hour < 17) setTimeGreeting('Good Afternoon');
    else setTimeGreeting('Good Evening');

    api.get('/dashboard/summary').then(r => setData(r.data)).catch(() => {});
    api.get('/dashboard/recent-sales').then(r => setRecentSales(r.data)).catch(() => {});
    api.get('/dashboard/sales-chart').then(r => setChart(r.data)).catch(() => {});
    api.get('/products/low-stock').then(r => setLowStock(r.data)).catch(() => {});
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
  }, [selectedYear]);

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const enabled = company?.enabledModules || [];
  const mod = (m) => isSuperAdmin || enabled.includes(m);
  const hasCourier = mod('tracking');

  useEffect(() => {
    if (hasCourier) {
      api.get('/tracking/branch-stats').then(r => setBranchStats(r.data)).catch(() => {});
    }
  }, [hasCourier]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const salesPath = hasCourier ? '/courier-sales/history' : '/sales';
  const maxChartValue = chart.length > 0 ? Math.max(...chart.map(x => x.total), 0.01) : 1;

  const moduleGroups = [
    {
      key: 'pos', title: 'POS / Billing', icon: <Icon name="pos" />, color: '#059669', desc: 'Billing, sales & customers',
      items: [
        { label: 'POS / Billing', icon: <Icon name="pos" />, path: '/pos', desc: 'New sale & checkout', color: '#059669' },
        { label: 'Sales History', icon: <Icon name="sales" />, path: salesPath, desc: 'View past sales', color: '#1e293b' },
        { label: 'Customers', icon: <Icon name="customer" />, path: '/customers', desc: 'Customer database', color: '#be185d' },
      ],
    },
    {
      key: 'inventory', title: 'Store & Inventory', icon: <Icon name="product" />, color: '#7c3aed', desc: 'Products, purchases & stock',
      items: [
        { label: 'Products', icon: <Icon name="product" />, path: '/products', desc: 'Manage inventory', color: '#7c3aed' },
        { label: 'Purchases', icon: <Icon name="purchase" />, path: '/purchases', desc: 'Purchase (Khareed)', color: '#f97316' },
        { label: 'Categories', icon: <Icon name="category" />, path: '/categories', desc: 'Product categories', color: '#0d9488' },
        { label: 'Suppliers', icon: <Icon name="supplier" />, path: '/suppliers', desc: 'Vendor management', color: '#ea580c' },
        { label: 'Stock Reports', icon: <Icon name="stock" />, path: '/stock-reports', desc: 'Stock & valuation', color: '#0891b2' },
        { label: 'Damage/Waste', icon: <Icon name="damage" />, path: '/damage', desc: 'Track losses', color: '#dc2626' },
      ],
    },
    {
      key: 'accounts', title: 'Accounting & Reports', icon: <Icon name="accounts" />, color: '#2563eb', desc: 'Vouchers, ledger & financials',
      items: [
        { label: 'Chart of Accounts', icon: <Icon name="accounts" />, path: '/accounts', desc: 'Country chart of accounts', color: '#2563eb' },
        { label: 'Vouchers', icon: <Icon name="voucher" />, path: '/vouchers', desc: 'Payment/Receipt', color: '#d97706' },
        { label: 'Journal Entries', icon: <Icon name="journal" />, path: '/accounts/journal-entries', desc: 'Record transactions', color: '#ca8a04' },
        { label: 'Ledger', icon: <Icon name="ledger" />, path: '/ledger', desc: 'Detailed khata', color: '#6366f1' },
        { label: 'Trial Balance', icon: <Icon name="trial" />, path: '/accounts/trial-balance', desc: 'Debit & credit summary', color: '#14b8a6' },
        { label: 'Profit & Loss', icon: <Icon name="income" />, path: '/accounts/income-statement', desc: 'Income statement', color: '#16a34a' },
        { label: 'Balance Sheet', icon: <Icon name="balance" />, path: '/accounts/balance-sheet', desc: 'Financial position', color: '#0d9488' },
        { label: 'Daybook', icon: <Icon name="daybook" />, path: '/accounts/daybook', desc: 'Chronological entries', color: '#47838c' },
        { label: 'Cash Flow', icon: <Icon name="cashflow" />, path: '/reports/cash-flow', desc: 'Cash movement', color: '#0891b2' },
        { label: 'Aging Report', icon: <Icon name="aging" />, path: '/reports/aging', desc: 'Receivable/Payable', color: '#ec4899' },
        { label: 'VAT Reports', icon: <Icon name="vat" />, path: '/reports/vat', desc: 'VAT & Annex 13', color: '#2563eb' },
        { label: 'TDS Report', icon: <Icon name="tds" />, path: '/reports/tds', desc: 'TDS withheld on purchases', color: '#db2777' },
        { label: 'Petty Expenses', icon: <Icon name="expense" />, path: '/expenses', desc: 'Sano kharcha', color: '#f97316' },
      ],
    },
    {
      key: 'hr', title: 'HR & Payroll', icon: <Icon name="employee" />, color: '#0891b2', desc: 'Employees, attendance, salary & leave',
      items: [
        { label: 'HR Dashboard', icon: <Icon name="dashboard" />, path: '/hr', desc: 'HR overview', color: '#0891b2' },
        { label: 'Employees', icon: <Icon name="employee" />, path: '/hr/employees', desc: 'Employee management', color: '#2563eb' },
        { label: 'Attendance', icon: <Icon name="attendance" />, path: '/hr/attendance', desc: 'Check in/out', color: '#10b981' },
        { label: 'Salary', icon: <Icon name="salary" />, path: '/hr/salary', desc: 'Payroll processing', color: '#8b5cf6' },
        { label: 'Leave', icon: <Icon name="leave" />, path: '/hr/leave', desc: 'Leave management', color: '#f59e0b' },
      ],
    },
  ];
  const activeGroups = moduleGroups.filter(g => hasGroup(g.key));
  const activeModuleCount = activeGroups.reduce((s, g) => s + g.items.length, 0);

  const kpis = isAdmin
    ? kpiConfigs(data, formatNPR, navigate, salesPath)
    : kpiConfigsStaff(data, formatNPR, navigate, salesPath);

  const getGreetingEmoji = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅';
    if (hour < 17) return '☀️';
    return '🌙';
  };

  const quickActions = [
    ...(mod('pos') && hasGroup('pos') && !hasCourier ? [
      { label: 'Add Sale', path: '/pos', icon: <Icon name="pos" />, color: '#059669' },
    ] : []),
    { label: 'New Sale', path: hasCourier ? '/courier-sales' : '/sales/new', icon: <Icon name="sales" />, color: '#059669' },
    { label: 'Purchase', path: '/purchases?new=1', icon: <Icon name="purchase" />, color: '#2563eb' },
    ...(mod('pos') && hasGroup('pos') ? [
      { label: 'Products', path: '/products', icon: <Icon name="product" />, color: '#7c3aed' },
    ] : []),
    ...(mod('accounts') && hasGroup('accounts') ? [
      { label: 'Journal', path: '/accounts/journal-entries', icon: <Icon name="journal" />, color: '#d97706' },
      { label: 'Vouchers', path: '/vouchers', icon: <Icon name="voucher" />, color: '#ca8a04' },
      { label: 'Ledger', path: '/ledger', icon: <Icon name="ledger" />, color: '#6366f1' },
      { label: 'P&L', path: '/accounts/income-statement', icon: <Icon name="income" />, color: '#16a34a' },
    ] : []),
  ];

  return (
    <div style={{ padding: '0', minHeight: '100vh', background: 'var(--page-bg, #f0f2f5)' }}>

      {/* Top Header Bar */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        borderRadius: 0,
        padding: '1.25rem 1.5rem',
        color: '#fff',
        marginBottom: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 200, height: 200,
          borderRadius: '50%', background: 'rgba(255,255,255,0.04)',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: '30%', width: 300, height: 300,
          borderRadius: '50%', background: 'rgba(255,255,255,0.03)',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.15rem' }}>
              {getGreetingEmoji()} {timeGreeting}, {user.name || 'User'}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>{dayName}, {dateStr}</span>
              <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(37,99,235,0.2)', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 600, color: '#93c5fd' }}>
                F.Y. {selectedYear?.name || 'N/A'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', position: 'relative' }}>
                🔔
                {(data?.lowStock || 0) > 0 && <span style={{ position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{data.lowStock}</span>}
              </button>
              {notifOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 280, background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0', overflow: 'hidden', zIndex: 100, color: '#1e293b' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', fontWeight: 600, fontSize: '0.85rem' }}>Notifications</div>
                  {(data?.lowStock || 0) > 0 ? (
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '0.5rem', cursor: 'pointer' }} onClick={() => { navigate('/products'); setNotifOpen(false); }}>
                      <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#991b1b' }}>Low Stock Alert</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{data.lowStock} products are below minimum stock level</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>All good! No alerts.</div>
                  )}
                </div>
              )}
            </div>
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem 0.35rem 0.35rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                  {(user.name || 'U').charAt(0).toUpperCase()}
                </div>
                <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || 'User'}</span>
              </button>
              {profileOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 200, background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0', overflow: 'hidden', zIndex: 100, color: '#1e293b', padding: '0.35rem 0' }}>
                  <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f1f5f9', marginBottom: '0.25rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{user.name}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{user.email || user.role}</div>
                  </div>
                  <button onClick={() => { navigate('/settings'); setProfileOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '0.45rem 0.75rem', border: 'none', background: 'transparent', fontSize: '0.82rem', cursor: 'pointer', color: '#374151' }} onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>Settings</button>
                  <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }} style={{ width: '100%', textAlign: 'left', padding: '0.45rem 0.75rem', border: 'none', background: 'transparent', fontSize: '0.82rem', cursor: 'pointer', color: '#ef4444' }} onMouseOver={e => e.currentTarget.style.background = '#fef2f2'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>Logout</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        {/* Quick Actions Pill Bar */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '0.25rem' }}>Quick Actions</span>
          {quickActions.map((a, i) => (
            <button key={i} onClick={() => navigate(a.path)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.4rem 0.85rem', borderRadius: 9999, border: 'none',
                background: a.color + '12', color: a.color, fontSize: '0.78rem',
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
              onMouseOver={e => { e.currentTarget.style.background = a.color; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseOut={e => { e.currentTarget.style.background = a.color + '12'; e.currentTarget.style.color = a.color; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <span style={{ fontSize: '0.9rem', display: 'flex' }}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>

        {/* KPI Cards — 6-card glass grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
          {kpis.map((kpi) => (
            <div key={kpi.key} onClick={kpi.onClick}
              style={{
                ...CARD_GLASS, borderRadius: 14, padding: '1.1rem 1.25rem',
                cursor: 'pointer', transition: 'all 0.25s ease', position: 'relative', overflow: 'hidden',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.1)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{
                position: 'absolute', top: -15, right: -15, width: 70, height: 70,
                borderRadius: '50%', background: kpi.color + '10',
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', position: 'relative' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: kpi.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color }}>
                  <Icon name={kpi.icon} />
                </div>
                <span style={{
                  fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.55rem',
                  borderRadius: 9999, background: kpi.badgeClass === 'positive' ? '#d1fae5' : kpi.badgeClass === 'negative' ? '#fee2e2' : '#f1f5f9',
                  color: kpi.badgeClass === 'positive' ? '#065f46' : kpi.badgeClass === 'negative' ? '#991b1b' : '#64748b',
                }}>{kpi.badge}</span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.1rem', position: 'relative' }}>{kpi.value}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', position: 'relative' }}>{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Branch Delivery Stats - Courier Companies Only */}
        {hasCourier && branchStats.length > 0 && (
          <div style={{ ...CARD_GLASS, borderRadius: 14, marginBottom: '1.25rem', overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Branch Delivery Overview</h3>
              <button className="btn btn-sm btn-secondary" onClick={() => navigate('/branch-deliveries')}>View All</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', padding: '0.75rem' }}>
              {branchStats.map(b => (
                <div key={b._id} style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => navigate('/branch-deliveries')}
                  onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                  onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{b.name}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>{b.total}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>total orders</div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.35rem', fontSize: '0.65rem' }}>
                    {b.pending > 0 && <span className="badge badge-secondary">{b.pending} pending</span>}
                    {b.processing > 0 && <span className="badge badge-info">{b.processing} processing</span>}
                    {b.shipped > 0 && <span className="badge badge-warning">{b.shipped} shipped</span>}
                    {b.delivered > 0 && <span className="badge badge-success">{b.delivered} delivered</span>}
                    {b.returned > 0 && <span className="badge badge-danger">{b.returned} returned</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content Grid: Chart + Transactions + Modules */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Sales Chart */}
          <div style={{ ...CARD_GLASS, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Sales Trend (7 Days)</h3>
              <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: 9999 }}>{formatNPR(chart.reduce((s, d) => s + d.total, 0))} total</span>
            </div>
            <div style={{ padding: '1rem 1rem 0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 200 }}>
                {chart.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ position: 'relative', width: '100%', height: `${Math.max(8, (d.total / maxChartValue) * 180)}px`, borderRadius: '6px 6px 0 0', background: 'linear-gradient(to top, #3b82f6, #60a5fa)', transition: 'height 0.5s ease', maxHeight: 180 }}>
                      <span style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', fontSize: '0.58rem', color: '#475569', whiteSpace: 'nowrap', fontWeight: 600 }}>{formatNPR(d.total)}</span>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.35rem' }}>{d.date.slice(5)}</div>
                  </div>
                ))}
                {chart.length === 0 && <div style={{ width: '100%', textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>No sales data yet</div>}
              </div>
            </div>
          </div>

          {/* Recent Transactions */}
          <div style={{ ...CARD_GLASS, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Recent Transactions</h3>
              <button className="btn btn-sm btn-secondary" onClick={() => navigate(salesPath)}>View All</button>
            </div>
            <div style={{ padding: '0.5rem' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr><th>Invoice</th><th>Amount</th><th>Payment</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {recentSales.map(s => (
                    <tr key={s._id} style={{ cursor: 'pointer' }} onClick={() => setDetail(s)}>
                      <td><span className="invoice-link">{s.invoiceNumber}</span></td>
                      <td className="text-success" style={{ fontWeight: 600 }}>{formatNPR(s.grandTotal)}</td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 9999,
                          fontSize: '0.7rem', fontWeight: 600,
                          background: s.paymentMethod === 'cash' ? '#d1fae5' : s.paymentMethod === 'credit' ? '#fee2e2' : '#dbeafe',
                          color: s.paymentMethod === 'cash' ? '#065f46' : s.paymentMethod === 'credit' ? '#991b1b' : '#1e40af',
                        }}>{s.paymentMethod}</span>
                      </td>
                      <td style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{new Date(s.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                  {recentSales.length === 0 && (
                    <tr><td colSpan="4" className="text-center">No sales yet. Start selling!</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Low Stock Alerts */}
          {!hasCourier && <div style={{ ...CARD_GLASS, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Low Stock Alerts</h3>
              <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: 9999 }}>{lowStock.length} items</span>
            </div>
            <div style={{ padding: '0.5rem' }}>
              {lowStock.length > 0 ? (
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr><th>Product</th><th>Stock</th><th>Min</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {lowStock.slice(0, 6).map(p => (
                      <tr key={p._id}>
                        <td>{p.name}</td>
                        <td><span className="badge badge-danger">{p.stock}</span></td>
                        <td>{p.minStock}</td>
                        <td>
                          <button className="btn btn-sm btn-primary" onClick={() => navigate('/products')}>Restock</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="db-empty" style={{ padding: '1.5rem', textAlign: 'center', color: '#16a34a', fontWeight: 500 }}>All products are well-stocked</div>
              )}
            </div>
          </div>}

          {/* Module Access Grid */}
          <div style={{ ...CARD_GLASS, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Your Modules</h3>
              <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: 9999 }}>{activeModuleCount} modules</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
              {activeGroups.map(group => (
                <div key={group.key} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.85rem', background: group.color + '10', color: group.color, cursor: 'pointer' }} onClick={() => {
                    if (group.key === 'pos') navigate('/pos/dashboard');
                    else if (group.key === 'inventory') navigate('/products/dashboard');
                    else if (group.key === 'accounts') navigate('/accounts/dashboard');
                    else if (group.key === 'hr') navigate('/hr/dashboard');
                  }}>
                    <span style={{ display: 'flex', fontSize: '1.1rem' }}>{group.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{group.title}</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{group.desc}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', padding: '0.5rem' }}>
                    {group.items.map((m, i) => (
                      <div key={i} onClick={() => navigate(m.path)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: m.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.color, flexShrink: 0, fontSize: '0.85rem' }}>{m.icon}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1e293b' }}>{m.label}</div>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{m.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {detail && (
        <EntryDetailsModal
          title={`Sale ${detail.invoiceNumber}`}
          subtitle={`${new Date(detail.createdAt).toLocaleString('en-IN')} | ${detail.customer?.name || 'Walk-in'} | ${detail.paymentMethod}`}
          meta={[
            { label: 'Customer', value: detail.customer?.name || 'Walk-in' },
            { label: 'Payment', value: detail.paymentMethod },
            { label: 'Status', value: detail.status },
            { label: 'Grand Total', value: formatNPR(detail.grandTotal) },
            { label: 'Paid', value: formatNPR(detail.amountPaid) },
            { label: 'Change', value: formatNPR(detail.change) },
            ...(detail.extraCharge?.amount > 0 ? [{ label: detail.extraCharge.remarks ? `Extra Charge (${detail.extraCharge.remarks})` : 'Extra Charge', value: `+ ${formatNPR(detail.extraCharge.amount)}` }] : []),
          ]}
          columns={[
            { key: 'product', label: 'Item', wide: true, render: (v) => v?.name || v || 'Unknown' },
            { key: 'price', label: 'Rate', align: 'right', render: (v, r) => formatNPR(r.quantity > 0 ? (Number(r.subtotal) / Number(r.quantity)) : v) },
            { key: 'quantity', label: 'Qty', align: 'right' },
            { key: 'subtotal', label: 'Subtotal', align: 'right', render: (v) => formatNPR(v) },
          ]}
          rows={detail.items || []}
          footer={[
            { label: 'Subtotal', value: formatNPR((detail.subtotal || 0) + (detail.extraCharge?.amount || 0)) },
            ...(detail.discount > 0 ? [{ label: 'Discount', value: `(-${formatNPR(detail.discount)})` }] : []),
            ...(detail.taxTotal > 0 ? [{ label: 'Taxable Amount', value: formatNPR((detail.subtotal || 0) + (detail.extraCharge?.amount || 0) - (detail.discount || 0)) }, { label: 'VAT', value: formatNPR(detail.taxTotal) }] : []),
            { label: 'Grand Total', value: formatNPR(detail.grandTotal) },
            { label: 'Paid', value: formatNPR(detail.amountPaid) },
            { label: 'Change', value: formatNPR(detail.change) },
          ]}
          onPrint={() => printInvoice(detail, company)}
          onClose={() => setDetail(null)}
        />
      )}
      {showBanks && (
        <EntryDetailsModal
          title="Bank Balances"
          subtitle={`Total bank balance: ${formatNPR(data?.bankBalance || 0)}`}
          meta={[
            { label: 'Banks', value: data?.banks?.length || 0 },
            { label: 'Combined Balance', value: formatNPR(data?.bankBalance || 0) },
          ]}
          columns={[
            { key: 'name', label: 'Bank', wide: true },
            { key: 'accountNumber', label: 'Account No.' },
            { key: 'accountHolder', label: 'Holder' },
            { key: 'balance', label: 'Balance', align: 'right', render: (v) => formatNPR(v) },
          ]}
          rows={(data?.banks || []).map(b => ({ ...b, accountNumber: b.accountNumber || '-', accountHolder: b.accountHolder || '-' }))}
          footer={[
            { label: 'Combined Balance', value: formatNPR(data?.bankBalance || 0) },
          ]}
          actions={
            <button className="btn btn-primary" onClick={() => { setShowBanks(false); navigate('/accounts/banks'); }}>Manage Banks</button>
          }
          onClose={() => setShowBanks(false)}
        />
      )}
    </div>
  );
}
