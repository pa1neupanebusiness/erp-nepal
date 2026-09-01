import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import FiscalYearSelector from './FiscalYearSelector';
import { useTheme } from '../../context/ThemeContext';

const Icon = ({ name, size = 18, color = 'currentColor' }) => {
  const icons = {
    dashboard: <path d="M3 12l9-9 9 9M5 10v10h14V10" />,
    sales: <path d="M12 5v14M5 12h14" />,
    emi: <path d="M4 6h16M4 12h16M4 18h16" />,
    pos: <path d="M3 3h2l.894.894A2 2 0 007.707 3H21a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />,
    summary: <path d="M9 12h6M9 16h6M9 8h6" />,
    refund: <path d="M12 5v14M7 10l5 5 5-5" />,
    approval: <path d="M5 13l4 4L19 7" />,
    product: <path d="M21 16V8a2 2 0 0 0-1-1.73l-8-5a2 2 0 0 0-2 0l-8 5a2 2 0 0 0 1 1.73V16a2 2 0 0 0 1 1.73l8 5a2 2 0 0 0 2 0l8-5a2 2 0 0 0 1-1.73z" />,
    purchase: <path d="M1 12h22M5 6h14M5 18h14" />,
    category: <path d="M12 2l3 7h7l-6 4 2 8-6-4-6 4 2-8-6-4h7z" />,
    supplier: <path d="M16 21V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12M16 21l5-5M16 21l-5-5" />,
    stock: <path d="M3 18h18M3 6h18M8 10h8M8 14h8" />,
    customer: <path d="M20 21V11a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v10M9 9a3 3 0 1 1 6 0M15 21v-5a3 3 0 0 0-6 0v5" />,
    damage: <path d="M12 2L2 7v10l10 5 10-5V7z" />,
    accounts: <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7z" />,
    voucher: <path d="M3 4h18v2H3zM3 9h18v2H3zM3 14h18v2H3zM3 19h18v2H3z" />,
    journal: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />,
    ledger: <path d="M3 3h2l.894.894A2 2 0 007.707 3H21a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />,
    trial: <path d="M3 12l9-9 9 9M5 10v10h14V10" />,
    income: <path d="M12 19V5M5 12l7 7 7-7" />,
    balance: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    daybook: <path d="M4 4h16v2H4zM4 10h16v2H4zM4 16h16v2H4zM4 22h16v2H4z" />,
    company: <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7z" />,
    settings: <path d="M10.325 4.617a.75.75 0 01 1.35 0l.719 1.438a.75.75 0 001.116.246l1.02-.51a.75.75 0 01 1.08.247l.295 1.018a.75.75 0 01-.12.869l-.61.58a.75.75 0 00-.229.63v1.02a.75.75 0 00.229.63l.61.58a.75.75 0 01-.12.869l-.295 1.018a.75.75 0 01-1.08.247l-1.02-.51a.75.75 0 01-1.116-.246l-.719-1.438a.75.75 0 00-1.35 0z" />,
    cashflow: <path d="M12 1v22M4 12h16" />,
    aging: <path d="M8 7V3M8 19V15M16 7V3M16 19v-4" />,
    vat: <path d="M12 2l3 10h7l-6 5 2 10-6-5-6 5 2-10-6-5h7z" />,
    tds: <path d="M12 20V4M6 10l6 6 6-6" />,
    expense: <path d="M12 1v22M4 12h16" />,
    hr: <path d="M16 21V5a4 4 0 0 0-4-4 4 4 0 0 0-4 4v16" />,
    employee: <path d="M20 21V11a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v10M9 9a3 3 0 1 1 6 0" />,
    attendance: <path d="M12 11h4M12 15h4M12 7h4M8 7l4 4-4 4V7z" />,
    salary: <path d="M4 6h16M4 10h16M4 14h10M4 18h14" />,
    leave: <path d="M6 19l6-6 6 6M9 7h6M9 11h6" />,
    exit: <path d="M9 21h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2zM2 12h5M5 9l3 3-3 3" />,
    paymentin: <path d="M12 5v14M5 12h14M9 8l3-3 3 3M9 16l3 3 3-3" />,
    paymentout: <path d="M12 5v14M5 12h14M9 8l3-3 3 3M9 16l3 3 3-3" />,
    salesreturn: <path d="M9 15l-5 5m0-5l5 5M3 3h7a7 7 0 017 7v4M9 3a3 3 0 00-3 3v12" />,
    tracking: <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />,
    purchasereturn: <path d="M9 15l-5 5m0-5l5 5M3 3h7a7 7 0 017 7v4M9 3a3 3 0 00-3 3v12" />,
    menu: <path d="M3 12h18M3 6h18M3 18h18" />,
    close: <path d="M18 6L6 18M6 6l12 12" />,
  };

  return (
    <span className="nav-icon" style={{ display: 'inline-flex', width: size, height: size, marginRight: '8px' }}>
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icons[name] || icons.dashboard}
      </svg>
    </span>
  );
};

export { Icon };

function NavSection({ title, paths = [], children, activeSection, onToggle }) {
  const location = useLocation();
  const isActive = paths.some(p => location.pathname.startsWith(p));
  const isOpen = activeSection === title;

  return (
    <div className={`nav-section${isActive ? ' has-active' : ''}`}>
      <button className="nav-section-title" onClick={() => onToggle(title)} aria-expanded={isOpen}>
        <span className="nav-section-title-text">{title}</span>
        <span className={`nav-chevron${isOpen ? ' open' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      {isOpen && <div className="nav-section-body">{children}</div>}
    </div>
  );
}

const countryNames = {
  nepal: 'Nepal', india: 'India', usa: 'USA', uk: 'UK', australia: 'Australia',
  canada: 'Canada', germany: 'Germany', france: 'France', japan: 'Japan',
  singapore: 'Singapore', uae: 'UAE', southafrica: 'South Africa',
  newzealand: 'New Zealand', ireland: 'Ireland',
};

const taxLabels = {
  nepal: { vat: 'VAT', tds: 'TDS', label: 'VAT & TDS Reports' },
  india: { vat: 'GST', tds: 'TDS', label: 'GST & TDS Reports' },
  usa: { vat: 'Sales Tax', tds: '', label: 'Sales Tax Reports' },
  uk: { vat: 'VAT', tds: 'PAYE', label: 'VAT & PAYE Reports' },
  australia: { vat: 'GST', tds: 'PAYG', label: 'GST & PAYG Reports' },
  canada: { vat: 'GST/HST', tds: 'CPP/EI', label: 'Tax Reports' },
  germany: { vat: 'USt', tds: 'Lohnsteuer', label: 'Umsatzsteuer Reports' },
  france: { vat: 'TVA', tds: 'PAS', label: 'TVA Reports' },
  japan: { vat: '消費税', tds: '源泉税', label: 'Tax Reports' },
  singapore: { vat: 'GST', tds: 'CPF', label: 'GST & CPF Reports' },
  uae: { vat: 'VAT', tds: 'WPS', label: 'VAT Reports' },
  southafrica: { vat: 'VAT', tds: 'PAYE', label: 'VAT & PAYE Reports' },
  newzealand: { vat: 'GST', tds: 'PAYE', label: 'GST & PAYE Reports' },
  ireland: { vat: 'VAT', tds: 'PAYE/PRSI', label: 'VAT & PAYE Reports' },
};

export default function Layout({ user, onLogout, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(null);

  const hasCourier = (user?.company?.enabledModules || []).includes('tracking');

  useEffect(() => {
    const mainEl = document.querySelector('.main-content');
    if (mainEl) mainEl.scrollTop = 0;
  }, [location.pathname]);

  useEffect(() => {
    const path = location.pathname;
    if (path === '/' || path === '/login') { setActiveSection(null); return; }
    const sectionMap = {
      'Sales': ['/pos', '/emi', '/sales', '/pos-summary', '/request-refund', '/admin/refund-approvals', '/refund'],
      'Courier': ['/tracking', '/courier-sales'],
      'Purchase': ['/purchases'],
      'Inventory': ['/products', '/categories', '/stock-reports', '/damage'],
      'Expense': ['/accounting/expenses', '/expenses'],
      'Other Income': ['/other-income'],
      'Manage Accounts': ['/accounts', '/vouchers', '/ledger', '/fixed-assets', '/reports/monthly-sales-register'],
      'VAT & TDS Reports': ['/reports/vat', '/reports/tds', '/reports/aging', '/reports/cash-flow'],
      'HR & Payroll': ['/hr'],
      'Super Admin': ['/admin'],
      'Admin': ['/company-settings', '/users'],
    };
    for (const [title, paths] of Object.entries(sectionMap)) {
      if (paths.some(p => path.startsWith(p))) { setActiveSection(title); return; }
    }
  }, [location.pathname]);
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = isSuperAdmin || user?.role === 'admin';
  const isBranchStaff = (user?.groups || []).includes('branch');
  const groups = user?.groups || [];
  const hasGroup = (g) => isAdmin || groups.includes(g);
  const enabled = user?.company?.enabledModules || ['sales', 'emi', 'purchase', 'accounts', 'reports', 'settings'];
  const mod = (m) => isSuperAdmin || enabled.includes(m);
  const companyName = user?.company?.name || 'ERP System';
  const country = user?.company?.country || 'nepal';
  const countryName = countryNames[country] || country;
  const currency = user?.company?.currency || 'NPR';
  const tax = taxLabels[country] || taxLabels.nepal;

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`;

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSection = (title) => { setActiveSection(prev => prev === title ? null : title); };

  const v = {
    pos: mod('pos') && hasGroup('pos'),
    sales: mod('sales') && hasGroup('pos'),
    emi: mod('emi') && hasGroup('pos'),
    posAdmin: mod('pos') && isAdmin,
    purchase: mod('purchase') && hasGroup('inventory'),
    accounts: mod('accounts') && hasGroup('accounts'),
    reports: mod('reports') && hasGroup('accounts'),
    hr: mod('hr') && hasGroup('hr'),
    settings: mod('settings') && isAdmin,
    tracking: mod('tracking') && (hasGroup('pos') || (user?.groups || []).includes('branch') || (user?.groups || []).includes('driver')),
  };
  const salesVisible = !isSuperAdmin && (v.pos || v.sales || v.emi || v.posAdmin);
  const courierVisible = !isSuperAdmin && v.tracking;
  const showCreateInvoice = !courierVisible && v.sales;
  const purchaseVisible = !isSuperAdmin && v.purchase;
  const storeVisible = !isSuperAdmin && v.purchase;
  const accountingVisible = !isSuperAdmin && v.accounts;
  const reportsVisible = !isSuperAdmin && v.reports;
  const hrVisible = !isSuperAdmin && v.hr;

  const isActive = (paths) => paths.some(p => location.pathname.startsWith(p));

  return (
    <div className="app-layout">
      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <button className="mobile-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {sidebarOpen ? <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></> : <><path d="M3 12h18" /><path d="M3 6h18" /><path d="M3 18h18" /></>}
          </svg>
        </button>
        <div className="mobile-topbar-title">{companyName}</div>
        <div className="mobile-topbar-right">
          <FiscalYearSelector />
        </div>
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

      <nav className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h2>{companyName}</h2>
          <div className="company-meta">
            <span className="company-country">{countryName}</span>
            <span className="company-currency">{currency}</span>
          </div>
          <FiscalYearSelector />
        </div>
        <div className="sidebar-nav">
          <NavLink to="/" end className={linkClass} onClick={closeSidebar} style={{ borderBottom: '1px solid var(--border)' }}><Icon name="dashboard" /><span className="nav-text">Dashboard</span></NavLink>

          {salesVisible && <NavSection title="Sales" paths={['/pos', '/emi', '/sales', '/pos-summary', '/request-refund', '/admin/refund-approvals', '/refund']} activeSection={activeSection} onToggle={toggleSection}>
            {v.pos && <NavLink to="/pos" className={linkClass} onClick={closeSidebar}><Icon name="pos" /><span className="nav-text">POS</span></NavLink>}
            {v.emi && <NavLink to="/emi" className={linkClass} onClick={closeSidebar}><Icon name="emi" /><span className="nav-text">EMI</span></NavLink>}
            {showCreateInvoice && <NavLink to="/sales/new" className={linkClass} onClick={closeSidebar}><Icon name="sales" /><span className="nav-text">Create Sales Invoice</span></NavLink>}
            {showCreateInvoice && <NavLink to="/sales" className={linkClass} onClick={closeSidebar}><Icon name="sales" /><span className="nav-text">Sales History</span></NavLink>}
            {showCreateInvoice && <NavLink to="/sales/payment-in" className={linkClass} onClick={closeSidebar}><Icon name="paymentin" /><span className="nav-text">Payment In</span></NavLink>}
            {showCreateInvoice && <NavLink to="/sales/returns" className={linkClass} onClick={closeSidebar}><Icon name="salesreturn" /><span className="nav-text">Sales Returns</span></NavLink>}
            {v.pos && <NavLink to="/pos-summary" className={linkClass} onClick={closeSidebar}><Icon name="summary" /><span className="nav-text">Daily Summary</span></NavLink>}
            {v.pos && <NavLink to="/request-refund" className={linkClass} onClick={closeSidebar}><Icon name="refund" /><span className="nav-text">Request Refund</span></NavLink>}
            {v.posAdmin && <NavLink to="/admin/refund-approvals" className={linkClass} onClick={closeSidebar}><Icon name="approval" /><span className="nav-text">Refund Approvals</span></NavLink>}
            {v.posAdmin && <NavLink to="/refund" className={linkClass} onClick={closeSidebar}><Icon name="refund" /><span className="nav-text">Direct Refund</span></NavLink>}
          </NavSection>}

          {purchaseVisible && <NavSection title="Purchase" paths={['/purchases', '/purchases/payment-out', '/purchases/returns']} activeSection={activeSection} onToggle={toggleSection}>
            <NavLink to="/purchases" className={linkClass} onClick={closeSidebar}><Icon name="purchase" /><span className="nav-text">Purchase</span></NavLink>
            <NavLink to="/purchases/payment-out" className={linkClass} onClick={closeSidebar}><Icon name="paymentout" /><span className="nav-text">Payment Out</span></NavLink>
            <NavLink to="/purchases/returns" className={linkClass} onClick={closeSidebar}><Icon name="purchasereturn" /><span className="nav-text">Purchase Return</span></NavLink>
          </NavSection>}

          {storeVisible && <NavLink to="/parties" className={linkClass} onClick={closeSidebar}><Icon name="customer" /><span className="nav-text">Parties</span></NavLink>}

          {storeVisible && <NavSection title="Inventory" paths={['/products', '/categories', '/stock-reports', '/damage']} activeSection={activeSection} onToggle={toggleSection}>
            <NavLink to="/products" className={linkClass} onClick={closeSidebar}><Icon name="product" /><span className="nav-text">Products</span></NavLink>
            <NavLink to="/categories" className={linkClass} onClick={closeSidebar}><Icon name="category" /><span className="nav-text">Categories</span></NavLink>
            <NavLink to="/stock-reports" className={linkClass} onClick={closeSidebar}><Icon name="stock" /><span className="nav-text">Stock Reports</span></NavLink>
            <NavLink to="/damage" className={linkClass} onClick={closeSidebar}><Icon name="damage" /><span className="nav-text">Damage/Waste</span></NavLink>
          </NavSection>}

          {accountingVisible && <NavSection title="Expense" paths={['/accounting/expenses', '/expenses']} activeSection={activeSection} onToggle={toggleSection}>
            <NavLink to="/accounting/expenses" className={linkClass} onClick={closeSidebar}><Icon name="expense" /><span className="nav-text">Expenses</span></NavLink>
            <NavLink to="/expenses" className={linkClass} onClick={closeSidebar}><Icon name="expense" /><span className="nav-text">Petty Expenses</span></NavLink>
          </NavSection>}

          {accountingVisible && <NavLink to="/other-income" className={linkClass} onClick={closeSidebar}><Icon name="income" /><span className="nav-text">Other Income</span></NavLink>}

          {accountingVisible && <NavSection title="Manage Accounts" paths={['/accounts', '/vouchers', '/ledger', '/fixed-assets', '/reports/monthly-sales-register']} activeSection={activeSection} onToggle={toggleSection}>
            <NavLink to="/accounts" className={linkClass} onClick={closeSidebar}><Icon name="accounts" /><span className="nav-text">Chart of Accounts</span></NavLink>
            <NavLink to="/accounts/banks" className={linkClass} onClick={closeSidebar}><Icon name="accounts" /><span className="nav-text">Banks</span></NavLink>
            <NavLink to="/vouchers" className={linkClass} onClick={closeSidebar}><Icon name="voucher" /><span className="nav-text">Vouchers</span></NavLink>
            <NavLink to="/accounts/journal-entries" className={linkClass} onClick={closeSidebar}><Icon name="journal" /><span className="nav-text">Journal Entries</span></NavLink>
            <NavLink to="/accounts/purchases" className={linkClass} onClick={closeSidebar}><Icon name="purchase" /><span className="nav-text">Purchases</span></NavLink>
            <NavLink to="/ledger" className={linkClass} onClick={closeSidebar}><Icon name="ledger" /><span className="nav-text">Ledger</span></NavLink>
            <NavLink to="/accounts/trial-balance" className={linkClass} onClick={closeSidebar}><Icon name="trial" /><span className="nav-text">Trial Balance</span></NavLink>
            <NavLink to="/accounts/income-statement" className={linkClass} onClick={closeSidebar}><Icon name="income" /><span className="nav-text">Income Statement</span></NavLink>
            <NavLink to="/accounts/balance-sheet" className={linkClass} onClick={closeSidebar}><Icon name="balance" /><span className="nav-text">Balance Sheet</span></NavLink>
            <NavLink to="/accounts/daybook" className={linkClass} onClick={closeSidebar}><Icon name="daybook" /><span className="nav-text">Daybook</span></NavLink>
            <NavLink to="/fixed-assets" className={linkClass} onClick={closeSidebar}><Icon name="accounts" /><span className="nav-text">Fixed Assets</span></NavLink>
            <NavLink to="/reports/monthly-sales-register" className={linkClass} onClick={closeSidebar}><Icon name="voucher" /><span className="nav-text">Monthly Sales Register</span></NavLink>
          </NavSection>}

          {courierVisible && <NavSection title="Courier" paths={['/tracking', '/courier-sales', '/branch-deliveries']} activeSection={activeSection} onToggle={toggleSection}>
            {(isAdmin || isBranchStaff || (user?.groups || []).includes('pos')) && <NavLink to="/courier-sales" className={linkClass} onClick={closeSidebar}><Icon name="sales" /><span className="nav-text">Courier Sales</span></NavLink>}
            {(isAdmin || isBranchStaff || (user?.groups || []).includes('pos')) && <NavLink to="/courier-sales/report" className={linkClass} onClick={closeSidebar}><Icon name="daybook" /><span className="nav-text">Daily Report</span></NavLink>}
            {(isAdmin || isBranchStaff || (user?.groups || []).includes('pos')) && <NavLink to="/courier-sales/history" className={linkClass} onClick={closeSidebar}><Icon name="sales" /><span className="nav-text">Sales History</span></NavLink>}
            <NavLink to="/tracking" className={linkClass} onClick={closeSidebar}><Icon name="tracking" /><span className="nav-text">Order Tracking</span></NavLink>
            {(isAdmin || isBranchStaff) && <NavLink to="/branch-deliveries" className={linkClass} onClick={closeSidebar}><Icon name="tracking" /><span className="nav-text">Branch Deliveries</span></NavLink>}
            {(user?.groups || []).includes('branch') && <NavLink to="/tracking/branch" className={linkClass} onClick={closeSidebar}><Icon name="tracking" /><span className="nav-text">Branch Orders</span></NavLink>}
            {(user?.groups || []).includes('driver') && <NavLink to="/tracking/driver" className={linkClass} onClick={closeSidebar}><Icon name="tracking" /><span className="nav-text">My Deliveries</span></NavLink>}
          </NavSection>}

          {reportsVisible && <NavSection title={tax.label} paths={['/reports']} activeSection={activeSection} onToggle={toggleSection}>
            <NavLink to="/reports/cash-flow" className={linkClass} onClick={closeSidebar}><Icon name="cashflow" /><span className="nav-text">Cash Flow</span></NavLink>
            <NavLink to="/reports/aging" className={linkClass} onClick={closeSidebar}><Icon name="aging" /><span className="nav-text">Aging Report</span></NavLink>
            {tax.vat && <NavLink to="/reports/vat" className={linkClass} onClick={closeSidebar}><Icon name="vat" /><span className="nav-text">{tax.vat} Report</span></NavLink>}
            {tax.tds && <NavLink to="/reports/tds" className={linkClass} onClick={closeSidebar}><Icon name="tds" /><span className="nav-text">{tax.tds} Report</span></NavLink>}
          </NavSection>}

          {hrVisible && <NavSection title="HR & Payroll" paths={['/hr']} activeSection={activeSection} onToggle={toggleSection}>
            <NavLink to="/hr" className={linkClass} onClick={closeSidebar}><Icon name="dashboard" /><span className="nav-text">HR Dashboard</span></NavLink>
            <NavLink to="/hr/employees" className={linkClass} onClick={closeSidebar}><Icon name="employee" /><span className="nav-text">Employees</span></NavLink>
            <NavLink to="/hr/attendance" className={linkClass} onClick={closeSidebar}><Icon name="attendance" /><span className="nav-text">Attendance</span></NavLink>
            <NavLink to="/hr/salary" className={linkClass} onClick={closeSidebar}><Icon name="salary" /><span className="nav-text">Salary</span></NavLink>
            <NavLink to="/hr/leave" className={linkClass} onClick={closeSidebar}><Icon name="leave" /><span className="nav-text">Leave</span></NavLink>
          </NavSection>}

          {isSuperAdmin && <NavSection title="Super Admin" paths={['/admin']} activeSection={activeSection} onToggle={toggleSection}>
            <NavLink to="/admin/dashboard" className={linkClass} onClick={closeSidebar}><Icon name="dashboard" /><span className="nav-text">Admin Dashboard</span></NavLink>
            <NavLink to="/admin/companies" className={linkClass} onClick={closeSidebar}><Icon name="company" /><span className="nav-text">Companies</span></NavLink>
          </NavSection>}

          {v.settings && <NavSection title="Admin" paths={['/company-settings', '/users', '/tracking/branches']} activeSection={activeSection} onToggle={toggleSection}>
            <NavLink to="/company-settings" className={linkClass} onClick={closeSidebar}><Icon name="settings" /><span className="nav-text">Company Settings</span></NavLink>
            <NavLink to="/users" className={linkClass} onClick={closeSidebar}><Icon name="employee" /><span className="nav-text">User Management</span></NavLink>
            {v.tracking && <NavLink to="/tracking/branches" className={linkClass} onClick={closeSidebar}><Icon name="tracking" /><span className="nav-text">Branch Management</span></NavLink>}
          </NavSection>}
        </div>
        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{user?.name}</span>
            <span className="user-role">{user?.role === 'super_admin' ? 'Super Admin' : user?.role}</span>
          </div>
          <button onClick={handleLogout} className="logout-btn"><Icon name="exit" /> Logout</button>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="mobile-bottom-nav">
        <NavLink to="/" end className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l9-9 9 9M5 10v10h14V10" /></svg>
          <span>Home</span>
        </NavLink>
        {salesVisible && <NavLink to="/pos" className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h2l.894.894A2 2 0 007.707 3H21a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" /></svg>
          <span>POS</span>
        </NavLink>}
        {storeVisible && <NavLink to="/products" className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-8-5a2 2 0 0 0-2 0l-8 5a2 2 0 0 0 1 1.73V16a2 2 0 0 0 1 1.73l8 5a2 2 0 0 0 2 0l8-5a2 2 0 0 0 1-1.73z" /></svg>
          <span>Stock</span>
        </NavLink>}
        {accountingVisible && <NavLink to="/accounts" className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7z" /></svg>
          <span>Accounts</span>
        </NavLink>}
        <button className="mobile-nav-item" onClick={() => setSidebarOpen(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          <span>More</span>
        </button>
      </nav>

      <main className="main-content">
        {children}
        <div className="footer-brand">© 2026 Made by DevUp Soft</div>
      </main>
    </div>
  );
}
