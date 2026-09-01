import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { Icon } from '../Layout/Layout';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import SaleDetailModal from '../UI/SaleDetailModal';
import PurchaseDetailModal from '../UI/PurchaseDetailModal';
import { printInvoice } from '../POS/PrintInvoice';
import { printPurchaseVoucher } from '../UI/printPurchase';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [chart, setChart] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [branchStats, setBranchStats] = useState([]);
  const [timeGreeting, setTimeGreeting] = useState('');
  const [saleDetailId, setSaleDetailId] = useState(null);
  const [purchaseDetailId, setPurchaseDetailId] = useState(null);
  const [showBanks, setShowBanks] = useState(false);
  const [company, setCompany] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
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
    api.get('/dashboard/recent-transactions').then(r => setRecentTx(r.data)).catch(() => {});
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
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    if (moreOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moreOpen]);

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const moduleGroups = [
    {
      key: 'pos',
      title: 'POS / Billing',
      icon: <Icon name="pos" />,
      color: '#059669',
      desc: 'Billing, sales & customers',
      items: [
        { label: 'POS / Billing', icon: <Icon name="pos" />, path: '/pos', desc: 'New sale & checkout', color: '#059669' },
        { label: 'Sales History', icon: <Icon name="sales" />, path: hasCourier ? '/courier-sales/history' : '/sales', desc: 'View past sales', color: '#1e293b' },
        { label: 'Customers', icon: <Icon name="customer" />, path: '/customers', desc: 'Customer database', color: '#be185d' },
      ],
    },
    {
      key: 'inventory',
      title: 'Store & Inventory',
      icon: <Icon name="product" />,
      color: '#7c3aed',
      desc: 'Products, purchases & stock',
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
      key: 'accounts',
      title: 'Accounting & Reports',
      icon: <Icon name="accounts" />,
      color: '#2563eb',
      desc: 'Vouchers, ledger & financials',
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
      key: 'hr',
      title: 'HR & Payroll',
      icon: <Icon name="employee" />,
      color: '#0891b2',
      desc: 'Employees, attendance, salary & leave',
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

  const salesPath = hasCourier ? '/courier-sales/history' : '/sales';
  const maxChartValue = chart.length > 0 ? Math.max(...chart.map(x => x.total), 0.01) : 1;

  return (
    <div className="dashboard">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <h1>{timeGreeting}, {user.name || 'User'} 👋</h1>
          <p className="dashboard-date">{dayName}, {dateStr}</p>
        </div>
        <div className="dashboard-header-right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="fiscal-info" style={{ marginRight: '0.5rem' }}>
            <span className="fiscal-badge">F.Y. {selectedYear?.name || 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => navigate(hasCourier ? '/courier-sales' : '/sales/new')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
                background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(5,150,105,0.25)', transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(5,150,105,0.35)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(5,150,105,0.25)'; }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14" /></svg>
              Add Sales
            </button>
            <button
              onClick={() => navigate('/purchases?new=1')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
                background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37,99,235,0.25)', transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.35)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.25)'; }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14" /></svg>
              Add Purchase
            </button>
            <div ref={moreRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMoreOpen(prev => !prev)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.5rem 0.85rem', borderRadius: '8px',
                  border: '1.5px solid #e2e8f0', background: '#fff', color: '#374151',
                  fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'all 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.background = '#f8fafc'; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}
              >
                Add More
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ transform: moreOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {moreOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
                  minWidth: '200px', background: '#fff', border: '1px solid #e2e8f0',
                  borderRadius: '10px', boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                  padding: '0.35rem 0', overflow: 'hidden',
                }}>
                  {[
                    { label: 'Payment In', path: '/sales/payment-in', icon: '↗', color: '#059669' },
                    { label: 'Payment Out', path: '/purchases/payment-out', icon: '↙', color: '#dc2626' },
                    { label: 'Sales Return', path: '/sales/returns', icon: '↩', color: '#d97706' },
                    { label: 'Purchase Return', path: '/purchases/returns', icon: '↪', color: '#7c3aed' },
                    { label: 'Expense', path: '/accounting/expenses', icon: '📤', color: '#f97316' },
                    { label: 'Income', path: '/vouchers', icon: '📥', color: '#16a34a' },
                  ].map((item, i) => (
                    <button
                      key={i}
                      onClick={() => { navigate(item.path); setMoreOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        width: '100%', padding: '0.55rem 0.85rem', border: 'none',
                        background: 'transparent', color: '#374151', fontSize: '0.82rem',
                        fontWeight: 500, cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                      onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '26px', height: '26px', borderRadius: '6px',
                        background: item.color + '12', color: item.color,
                        fontSize: '0.85rem', fontWeight: 700, flexShrink: 0,
                      }}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        {isAdmin ? (
          <>
            <div className="kpi-card kpi-today" style={{ cursor: 'pointer' }} onClick={() => navigate(salesPath)}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="sales" /></span>
                <span className="kpi-change positive">+{data?.todayCount || 0} today</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.todaySales || 0)}</div>
              <div className="kpi-label">Today's Sales</div>
            </div>
            <div className="kpi-card kpi-month" style={{ cursor: 'pointer' }} onClick={() => navigate(salesPath)}>
              <div className="kpi-top">
            <span className="kpi-icon"><Icon name="sales" /></span>
            <span className="kpi-change">This month</span>
          </div>
          <div className="kpi-value">{formatNPR(data?.monthSales || 0)}</div>
              <div className="kpi-label">Monthly Sales</div>
            </div>
            <div className="kpi-card kpi-cash" style={{ cursor: 'pointer' }} onClick={() => navigate('/accounts')}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="cashflow" /></span>
                <span className="kpi-change">Cash</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.cashBalance || 0)}</div>
              <div className="kpi-label">Cash in Hand</div>
            </div>
            <div className="kpi-card kpi-bank" style={{ cursor: 'pointer' }} onClick={() => setShowBanks(true)}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="cashflow" /></span>
                <span className="kpi-change">Bank</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.bankBalance || 0)}</div>
              <div className="kpi-label">Bank Balance</div>
            </div>
            {!hasCourier && <>
            <div className="kpi-card kpi-products" style={{ cursor: 'pointer' }} onClick={() => navigate('/products')}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="product" /></span>
                <span className={`kpi-change ${data?.lowStock > 0 ? 'negative' : 'positive'}`}>{data?.lowStock || 0} low stock</span>
              </div>
              <div className="kpi-value">{data?.totalProducts || 0}</div>
              <div className="kpi-label">Total Products</div>
            </div>
            <div className="kpi-card kpi-customers" style={{ cursor: 'pointer' }} onClick={() => navigate('/products')}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="product" /></span>
                <span className="kpi-change">Inventory</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.stockValuation || 0)}</div>
              <div className="kpi-label">Stock Valuation</div>
            </div>
            </>}
          </>
        ) : (
          <>
            <div className="kpi-card kpi-today" style={{ cursor: 'pointer' }} onClick={() => navigate(salesPath)}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="sales" /></span>
                <span className="kpi-change positive">+{data?.todayCount || 0} today</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.todaySales || 0)}</div>
              <div className="kpi-label">Today's Sales</div>
            </div>
            <div className="kpi-card kpi-refund" style={{ cursor: 'pointer' }} onClick={() => navigate(salesPath)}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="refund" /></span>
                <span className="kpi-change">Today</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.todayRefunds || 0)}</div>
              <div className="kpi-label">Today's Refunds</div>
            </div>
            <div className="kpi-card kpi-month" style={{ cursor: 'pointer' }} onClick={() => navigate(salesPath)}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="sales" /></span>
                <span className="kpi-change">This month</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.monthSales || 0)}</div>
              <div className="kpi-label">Monthly Sales</div>
            </div>
            <div className="kpi-card kpi-refund-month" style={{ cursor: 'pointer' }} onClick={() => navigate(salesPath)}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="refund" /></span>
                <span className="kpi-change">This month</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.monthRefunds || 0)}</div>
              <div className="kpi-label">Monthly Refunds</div>
            </div>
          </>
        )}
      </div>

      {/* Branch Delivery Stats - Courier Companies Only */}
      {hasCourier && branchStats.length > 0 && (
        <div className="db-card" style={{ marginBottom: '1rem' }}>
          <div className="db-card-header">
            <h3>Branch Delivery Overview</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/branch-deliveries')}>View All</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', padding: '0.75rem' }}>
            {branchStats.map(b => (
              <div key={b._id} style={{ padding: '0.75rem', background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '8px', cursor: 'pointer' }} onClick={() => navigate('/branch-deliveries')}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{b.name}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>{b.total}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>total orders</div>
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

      {/* Recent Transactions */}
      <div className="db-card recent-sales-card" style={{ marginBottom: '1rem' }}>
        <div className="db-card-header">
          <h3>Recent Transactions</h3>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate(salesPath)}>View All</button>
        </div>
        <div className="db-card-body">
          <table className="table">
            <thead>
              <tr><th>Type</th><th>Invoice</th><th>Party</th><th>Amount</th><th>Payment</th><th>Time</th></tr>
            </thead>
            <tbody>
              {recentTx.map(t => (
                <tr key={t._id} style={{ cursor: 'pointer' }} onClick={() => t.kind === 'sale' ? setSaleDetailId(t._id) : setPurchaseDetailId(t._id)}>
                  <td><span className={`badge ${t.kind === 'sale' ? 'badge-success' : 'badge-info'}`}>{t.kind === 'sale' ? 'Sale' : 'Purchase'}</span></td>
                  <td><span className="invoice-link">{t.number}</span></td>
                  <td>{t.party}</td>
                  <td className="text-success">{formatNPR(t.amount)}</td>
                  <td><span className="badge badge-success">{t.paymentMethod}</span></td>
                  <td className="text-muted">{new Date(t.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
              {recentTx.length === 0 && (
                <tr><td colSpan="6" className="text-center">No transactions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section-header">
        <h2>Quick Actions</h2>
      </div>
      <div className="quick-actions">
        {!hasCourier && <>
          {mod('pos') && hasGroup('pos') && <button className="qa-btn qa-product" onClick={() => navigate('/products')}>
            <span className="qa-icon"><Icon name="product" /></span>
            <span className="qa-text">Add Product</span>
          </button>}
          {mod('pos') && hasGroup('pos') && <button className="qa-btn qa-stock" onClick={() => navigate('/stock-reports')}>
            <span className="qa-icon"><Icon name="stock" /></span>
            <span className="qa-text">Stock Report</span>
          </button>}
        </>}
        {mod('accounts') && hasGroup('accounts') && <button className="qa-btn qa-journal" onClick={() => navigate('/accounts/journal-entries')}>
          <span className="qa-icon"><Icon name="journal" /></span>
          <span className="qa-text">Journal Entry</span>
        </button>}
        {mod('accounts') && hasGroup('accounts') && <button className="qa-btn qa-pl" onClick={() => navigate('/accounts/income-statement')}>
          <span className="qa-icon"><Icon name="income" /></span>
          <span className="qa-text">Profit & Loss</span>
        </button>}
        {mod('accounts') && hasGroup('accounts') && <button className="qa-btn qa-bs" onClick={() => navigate('/accounts/balance-sheet')}>
          <span className="qa-icon"><Icon name="balance" /></span>
          <span className="qa-text">Balance Sheet</span>
        </button>}
        {mod('purchase') && hasGroup('inventory') && <button className="qa-btn qa-journal" onClick={() => navigate('/purchases')}>
          <span className="qa-icon"><Icon name="purchase" /></span>
          <span className="qa-text">New Purchase</span>
        </button>}
        {mod('accounts') && hasGroup('accounts') && <button className="qa-btn qa-stock" onClick={() => navigate('/vouchers')}>
          <span className="qa-icon"><Icon name="voucher" /></span>
          <span className="qa-text">Vouchers</span>
        </button>}
        {mod('accounts') && hasGroup('accounts') && <button className="qa-btn qa-product" onClick={() => navigate('/ledger')}>
          <span className="qa-icon"><Icon name="ledger" /></span>
          <span className="qa-text">View Ledger</span>
        </button>}
        {mod('accounts') && hasGroup('accounts') && <button className="qa-btn qa-customers" onClick={() => navigate('/reports/vat')}>
          <span className="qa-icon"><Icon name="vat" /></span>
          <span className="qa-text">VAT Report</span>
        </button>}
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-main-grid">
        {/* Sales Chart */}
        <div className="db-card chart-card">
          <div className="db-card-header">
            <h3>Sales Trend (7 Days)</h3>
            <span className="db-card-badge">{formatNPR(chart.reduce((s, d) => s + d.total, 0))} total</span>
          </div>
          <div className="chart-area">
            <div className="chart-bars">
              {chart.map((d, i) => (
                <div key={i} className="chart-col">
                  <div className="chart-bar" style={{ height: `${Math.max(8, (d.total / maxChartValue) * 180)}px` }}>
                    <span className="chart-bar-value">{formatNPR(d.total)}</span>
                  </div>
                  <div className="chart-col-label">{d.date.slice(5)}</div>
                </div>
              ))}
              {chart.length === 0 && <div className="chart-empty">No sales data yet</div>}
            </div>
          </div>
        </div>

        {/* Low Stock Alerts */}
        {!hasCourier && <div className="db-card">
          <div className="db-card-header">
            <h3>Low Stock Alerts</h3>
            <span className="db-card-badge">{lowStock.length} items</span>
          </div>
          <div className="db-card-body">
            {lowStock.length > 0 ? (
              <table className="table">
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
                        <button className="btn btn-sm btn-primary" onClick={() => navigate(`/products`)}>Restock</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="db-empty">All products are well-stocked ✅</div>
            )}
          </div>
        </div>}

        {/* Module Access Grid */}
        <div className="db-card modules-card">
          <div className="db-card-header">
            <h3>Your Modules</h3>
            <span className="db-card-badge">{activeModuleCount} modules</span>
          </div>
          <div className="modules-groups">
            {activeGroups.map(group => (
              <div key={group.key} className="module-group">
                <div className="module-group-header" style={{ background: group.color + '15', color: group.color, cursor: 'pointer' }} onClick={() => {
                  if (group.key === 'pos') navigate('/pos/dashboard');
                  else if (group.key === 'inventory') navigate('/products/dashboard');
                  else if (group.key === 'accounts') navigate('/accounts/dashboard');
                  else if (group.key === 'hr') navigate('/hr/dashboard');
                  else if (group.key === 'admin') navigate('/admin/dashboard');
                }}>
                  <span className="module-group-icon">{group.icon}</span>
                  <div>
                    <div className="module-group-title">{group.title}</div>
                    <div className="module-group-desc">{group.desc}</div>
                  </div>
                </div>
                <div className="modules-grid">
                  {group.items.map((m, i) => (
                    <div key={i} className="module-item" onClick={() => navigate(m.path)}>
                      <div className="module-icon" style={{ background: m.color + '15', color: m.color }}>{m.icon}</div>
                      <div className="module-info">
                        <div className="module-name">{m.label}</div>
                        <div className="module-desc">{m.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {saleDetailId && (
        <SaleDetailModal saleId={saleDetailId} onClose={() => setSaleDetailId(null)} onPrint={(d) => printInvoice(d, company)} />
      )}
      {purchaseDetailId && (
        <PurchaseDetailModal purchaseId={purchaseDetailId} onClose={() => setPurchaseDetailId(null)} onPrint={(d) => printPurchaseVoucher(d, company)} />
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
