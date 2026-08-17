import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { Icon } from '../Layout/Layout';
import EntryDetailsModal from '../UI/EntryDetailsModal';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [recentSales, setRecentSales] = useState([]);
  const [chart, setChart] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [vatReminder, setVatReminder] = useState(null);
  const [timeGreeting, setTimeGreeting] = useState('');
  const [detail, setDetail] = useState(null);
  const [showBanks, setShowBanks] = useState(false);
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
    if (isAdmin) api.get('/accounts/vat-periods').then(r => setVatReminder(r.data?.reminder || null)).catch(() => {});
  }, [selectedYear]);

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

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
        { label: 'Sales History', icon: <Icon name="sales" />, path: '/sales', desc: 'View past sales', color: '#1e293b' },
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

  const maxChartValue = chart.length > 0 ? Math.max(...chart.map(x => x.total), 0.01) : 1;

  return (
    <div className="dashboard">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <h1>{timeGreeting}, {user.name || 'User'} 👋</h1>
          <p className="dashboard-date">{dayName}, {dateStr}</p>
        </div>
        <div className="dashboard-header-right">
          <div className="fiscal-info">
            <span className="fiscal-badge">F.Y. {selectedYear?.name || 'N/A'}</span>
            <span className="dashboard-company">ERP Nepal - Accounting & Store</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        {isAdmin ? (
          <>
            <div className="kpi-card kpi-today" style={{ cursor: 'pointer' }} onClick={() => navigate('/sales')}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="sales" /></span>
                <span className="kpi-change positive">+{data?.todayCount || 0} today</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.todaySales || 0)}</div>
              <div className="kpi-label">Today's Sales</div>
            </div>
            <div className="kpi-card kpi-month" style={{ cursor: 'pointer' }} onClick={() => navigate('/sales')}>
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
          </>
        ) : (
          <>
            <div className="kpi-card kpi-today" style={{ cursor: 'pointer' }} onClick={() => navigate('/sales')}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="sales" /></span>
                <span className="kpi-change positive">+{data?.todayCount || 0} today</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.todaySales || 0)}</div>
              <div className="kpi-label">Today's Sales</div>
            </div>
            <div className="kpi-card kpi-refund" style={{ cursor: 'pointer' }} onClick={() => navigate('/sales')}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="refund" /></span>
                <span className="kpi-change">Today</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.todayRefunds || 0)}</div>
              <div className="kpi-label">Today's Refunds</div>
            </div>
            <div className="kpi-card kpi-month" style={{ cursor: 'pointer' }} onClick={() => navigate('/sales')}>
              <div className="kpi-top">
                <span className="kpi-icon"><Icon name="sales" /></span>
                <span className="kpi-change">This month</span>
              </div>
              <div className="kpi-value">{formatNPR(data?.monthSales || 0)}</div>
              <div className="kpi-label">Monthly Sales</div>
            </div>
            <div className="kpi-card kpi-refund-month" style={{ cursor: 'pointer' }} onClick={() => navigate('/sales')}>
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

      {isAdmin && vatReminder && (
        <div className={`vat-reminder ${vatReminder.overdue ? 'overdue' : ''}`} style={{ marginBottom: '1rem', cursor: 'pointer' }} onClick={() => navigate('/reports/vat')}>
          <strong>{vatReminder.overdue ? 'VAT filing OVERDUE' : 'VAT filing due'}:</strong>{' '}
          {vatReminder.filingMonth
            ? <>filing for <strong>{vatReminder.filingMonth}</strong> (Net VAT {formatNPR(vatReminder.netVAT)}) — {vatReminder.overdue ? `${Math.abs(vatReminder.daysLeft)} days overdue — file now` : `${vatReminder.daysLeft} days left`}</>
            : <>click to view details</>}
        </div>
      )}

      {/* Recent Transactions */}
      <div className="db-card recent-sales-card" style={{ marginBottom: '1rem' }}>
        <div className="db-card-header">
          <h3>Recent Transactions</h3>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/sales')}>View All</button>
        </div>
        <div className="db-card-body">
          <table className="table">
            <thead>
              <tr><th>Invoice</th><th>Amount</th><th>Payment</th><th>Time</th></tr>
            </thead>
            <tbody>
              {recentSales.map(s => (
                <tr key={s._id} style={{ cursor: 'pointer' }} onClick={() => setDetail(s)}>
                  <td><span className="invoice-link">{s.invoiceNumber}</span></td>
                  <td className="text-success">{formatNPR(s.grandTotal)}</td>
                  <td><span className="badge badge-success">{s.paymentMethod}</span></td>
                  <td className="text-muted">{new Date(s.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
              {recentSales.length === 0 && (
                <tr><td colSpan="4" className="text-center">No sales yet. Start selling!</td></tr>
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
        {hasGroup('pos') && <button className="qa-btn qa-pos" onClick={() => navigate('/pos')}>
          <span className="qa-icon"><Icon name="pos" /></span>
          <span className="qa-text">New Sale (POS)</span>
        </button>}
        {hasGroup('inventory') && <button className="qa-btn qa-product" onClick={() => navigate('/products')}>
          <span className="qa-icon"><Icon name="product" /></span>
          <span className="qa-text">Add Product</span>
        </button>}
        {hasGroup('inventory') && <button className="qa-btn qa-stock" onClick={() => navigate('/stock-reports')}>
          <span className="qa-icon"><Icon name="stock" /></span>
          <span className="qa-text">Stock Report</span>
        </button>}
        {hasGroup('accounts') && <button className="qa-btn qa-journal" onClick={() => navigate('/accounts/journal-entries')}>
          <span className="qa-icon"><Icon name="journal" /></span>
          <span className="qa-text">Journal Entry</span>
        </button>}
        {hasGroup('accounts') && <button className="qa-btn qa-pl" onClick={() => navigate('/accounts/income-statement')}>
          <span className="qa-icon"><Icon name="income" /></span>
          <span className="qa-text">Profit & Loss</span>
        </button>}
        {hasGroup('accounts') && <button className="qa-btn qa-bs" onClick={() => navigate('/accounts/balance-sheet')}>
          <span className="qa-icon"><Icon name="balance" /></span>
          <span className="qa-text">Balance Sheet</span>
        </button>}
        {hasGroup('inventory') && <button className="qa-btn qa-journal" onClick={() => navigate('/purchases')}>
          <span className="qa-icon"><Icon name="purchase" /></span>
          <span className="qa-text">New Purchase</span>
        </button>}
        {hasGroup('accounts') && <button className="qa-btn qa-stock" onClick={() => navigate('/vouchers')}>
          <span className="qa-icon"><Icon name="voucher" /></span>
          <span className="qa-text">Vouchers</span>
        </button>}
        {hasGroup('accounts') && <button className="qa-btn qa-product" onClick={() => navigate('/ledger')}>
          <span className="qa-icon"><Icon name="ledger" /></span>
          <span className="qa-text">View Ledger</span>
        </button>}
        {hasGroup('accounts') && <button className="qa-btn qa-customers" onClick={() => navigate('/reports/vat')}>
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
        <div className="db-card">
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
        </div>

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
