import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FiscalYearProvider, useFiscalYear } from './context/FiscalYearContext';
import { ThemeProvider } from './context/ThemeContext';
import { DateFormatProvider } from './context/DateFormatContext';
import { ToastProvider, ToastContainer, useToast } from './components/UI/Toast';
import ErrorBoundary from './components/UI/ErrorBoundary';
import api from './api';
import NepaliDatePicker, { bsToADStr, getBSTodayStr } from './components/UI/NepaliDatePicker';
import TopBar from './components/UI/TopBar';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import Layout from './components/Layout/Layout';
import Dashboard from './components/Dashboard/Dashboard';
import POS from './components/POS/POS';
import ProductList from './components/Products/ProductList';
import CategoryList from './components/Categories/CategoryList';
import SupplierList from './components/Suppliers/SupplierList';
import CustomerList from './components/Customers/CustomerList';
import SalesList from './components/Sales/SalesList';
import CreateSalesInvoice from './components/Sales/CreateSalesInvoice';
import SalesEdit from './components/Sales/SalesEdit';
import EmiPage from './components/Sales/EmiPage';
import TrackingPage from './components/Tracking/TrackingPage';
import BranchDashboard from './components/Tracking/BranchDashboard';
import DriverDashboard from './components/Tracking/DriverDashboard';
import BranchManagement from './components/Admin/BranchManagement';
import CourierSalesForm from './components/Tracking/CourierSalesForm';
import CourierSalesHistory from './components/Tracking/CourierSalesHistory';
import CourierDailyReport from './components/Tracking/CourierDailyReport';
import BranchDeliveryDetails from './components/Tracking/BranchDeliveryDetails';
import TrackPublic from './components/Tracking/TrackPublic';
import Refund from './components/Sales/Refund';
import RefundRequest from './components/Sales/RefundRequest';
import RefundApproval from './components/Admin/RefundApproval';
import DailySummary from './components/POS/DailySummary';
import AccountsPage from './components/Accounts/AccountsPage';
import StockReports from './components/StockReports';
import Vouchers from './components/Vouchers/Vouchers';
import Purchases from './components/Purchases/Purchases';
import PaymentOut from './components/Purchases/PaymentOut';
import PurchaseReturn from './components/Purchases/PurchaseReturn';
import PaymentIn from './components/Sales/PaymentIn';
import SalesReturn from './components/Sales/SalesReturn';
import PettyExpenses from './components/Expenses/PettyExpenses';
import OtherIncome from './components/Income/OtherIncome';
import AccountingExpenses from './components/Accounting/AccountingExpenses';
import FixedAssets from './components/Accounting/FixedAssets';
import DamageTracking from './components/Damage/DamageTracking';
import LedgerView from './components/Ledger/LedgerView';
import Daybook from './components/Accounting/Daybook';
import CashFlow from './components/Reports/CashFlow';
import AgingReport from './components/Reports/AgingReport';
import VATReport from './components/Reports/VATReport';
import TDSReport from './components/Reports/TDSReport';
import MonthlySalesRegister from './components/Reports/MonthlySalesRegister';
import UserManagement from './components/Users/UserManagement';
import CompanyManagement from './components/Admin/CompanyManagement';
import CompanySettings from './components/CompanySettings';
import HrDashboard from './components/HR/HrDashboard';
import EmployeeList from './components/HR/EmployeeList';
import AttendancePage from './components/HR/AttendancePage';
import SalaryPage from './components/HR/SalaryPage';
import LeavePage from './components/HR/LeavePage';
import POSDashboard from './components/POS/POSDashboard';
import InventoryDashboard from './components/Inventory/InventoryDashboard';
import AccountsDashboard from './components/Accounts/AccountsDashboard';
import AdminDashboard from './components/Admin/AdminDashboard';
import PartiesPage from './components/Parties/PartiesPage';
import './styles/App.css';
import './styles/Setup.css';
import './styles/App-additions.css';
import './styles/chatWidget.css';
import ChatWidget from './components/UI/ChatWidget';

function FiscalYearPrompt() {
  const today = getBSTodayStr();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const addToast = useToast();
  const { refresh } = useFiscalYear();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) {
      addToast('All fields are required', 'error');
      return;
    }
    setLoading(true);
    try {
      await api.post('/fiscal-years', { name, startDate: bsToADStr(startDate), endDate: bsToADStr(endDate) });
      await refresh();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create fiscal year', 'error');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '2.5rem', width: '100%', maxWidth: '480px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.75rem', color: '#fff' }}>
            📅
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.5rem' }}>Setup Fiscal Year</h1>
          <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>Create your first fiscal year to start using the ERP</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Fiscal Year Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 2082/83" style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', transition: 'border 0.2s', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = '#667eea'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Start Date (BS)</label>
              <NepaliDatePicker value={startDate} onChange={val => setStartDate(val)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>End Date (BS)</label>
              <NepaliDatePicker value={endDate} onChange={val => setEndDate(val)} />
            </div>
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s' }}>
            {loading ? 'Creating...' : 'Create Fiscal Year'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const { fiscalYears, loading: fyLoading, refresh } = useFiscalYear();

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    refresh();
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  if (!user) {
    return (
      <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/register" element={<Register />} />
            <Route path="/track/:trackingNumber" element={<TrackPublic />} />
            <Route path="*" element={<Login onLogin={handleLogin} />} />
          </Routes>
        </Router>
      </ThemeProvider>
    );
  }

  if (!fyLoading && fiscalYears.length === 0) {
    return (
      <ThemeProvider>
        <FiscalYearPrompt />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <Router>
      <TopBar />
      <Layout user={user} onLogout={handleLogout}>
        {user?.company?.chatbotEnabled && <ChatWidget />}
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={user.role === 'super_admin' && !localStorage.getItem('selectedCompany') ? <AdminDashboard /> : <Dashboard />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/companies" element={<CompanyManagement />} />
          <Route path="/pos/dashboard" element={<POSDashboard />} />
          <Route path="/products/dashboard" element={<InventoryDashboard />} />
          <Route path="/accounts/dashboard" element={<AccountsDashboard />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/categories" element={<CategoryList />} />
          <Route path="/stock-reports" element={<StockReports />} />
          <Route path="/suppliers" element={<SupplierList />} />
          <Route path="/customers" element={<CustomerList />} />
          <Route path="/parties" element={<PartiesPage />} />
          <Route path="/sales" element={<SalesList />} />
          <Route path="/sales/new" element={<CreateSalesInvoice />} />
          <Route path="/sales/edit/:id" element={<SalesEdit />} />
          <Route path="/sales/payment-in" element={<PaymentIn />} />
          <Route path="/sales/returns" element={<SalesReturn />} />
          <Route path="/emi" element={(user?.role === 'super_admin' || (user?.company?.enabledModules || []).includes('emi')) ? <EmiPage /> : <Navigate to="/" />} />
          <Route path="/tracking" element={(user?.role === 'super_admin' || (user?.company?.enabledModules || []).includes('tracking')) ? <TrackingPage /> : <Navigate to="/" />} />
          <Route path="/tracking/branches" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('tracking') && (user?.role === 'super_admin' || user?.role === 'admin'))) ? <BranchManagement /> : <Navigate to="/" />} />
          <Route path="/tracking/driver" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('tracking') && (user?.groups || []).includes('driver'))) ? <DriverDashboard /> : <Navigate to="/" />} />
          <Route path="/tracking/branch" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('tracking') && (user?.groups || []).includes('branch'))) ? <BranchDashboard /> : <Navigate to="/" />} />
          <Route path="/courier-sales" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('tracking') && (user?.role === 'super_admin' || user?.role === 'admin' || ((user?.groups || []).includes('branch') || (user?.groups || []).includes('pos'))))) ? <CourierSalesForm /> : <Navigate to="/" />} />
          <Route path="/courier-sales/history" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('tracking') && (user?.role === 'super_admin' || user?.role === 'admin' || ((user?.groups || []).includes('branch') || (user?.groups || []).includes('pos'))))) ? <CourierSalesHistory /> : <Navigate to="/" />} />
          <Route path="/courier-sales/report" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('tracking') && (user?.role === 'super_admin' || user?.role === 'admin' || ((user?.groups || []).includes('branch') || (user?.groups || []).includes('pos'))))) ? <CourierDailyReport /> : <Navigate to="/" />} />
          <Route path="/branch-deliveries" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('tracking') && (user?.role === 'super_admin' || user?.role === 'admin' || (user?.groups || []).includes('branch')))) ? <BranchDeliveryDetails /> : <Navigate to="/" />} />
          <Route path="/track/:trackingNumber" element={<TrackPublic />} />
          <Route path="/refund" element={<Refund />} />
          <Route path="/request-refund" element={<RefundRequest />} />
          <Route path="/admin/refund-approvals" element={<RefundApproval />} />
          <Route path="/pos-summary" element={<DailySummary />} />
          <Route path="/accounts/*" element={<AccountsPage />} />
          <Route path="/vouchers" element={<Vouchers />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/purchases/payment-out" element={<PaymentOut />} />
          <Route path="/purchases/returns" element={<PurchaseReturn />} />
          <Route path="/expenses" element={<PettyExpenses />} />
          <Route path="/other-income" element={<OtherIncome />} />
          <Route path="/accounting/expenses" element={<AccountingExpenses />} />
          <Route path="/fixed-assets" element={<FixedAssets />} />
          <Route path="/damage" element={<DamageTracking />} />
          <Route path="/ledger" element={<LedgerView />} />
          <Route path="/accounts/daybook" element={<Daybook />} />
          <Route path="/reports/cash-flow" element={<CashFlow />} />
          <Route path="/reports/aging" element={<AgingReport />} />
          <Route path="/reports/vat" element={<VATReport />} />
          <Route path="/reports/tds" element={<TDSReport />} />
          <Route path="/reports/monthly-sales-register" element={<MonthlySalesRegister />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/company-settings" element={<CompanySettings />} />
          <Route path="/hr/dashboard" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('hr') && (user?.groups || []).includes('hr'))) ? <HrDashboard /> : <Navigate to="/" />} />
          <Route path="/hr" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('hr') && (user?.groups || []).includes('hr'))) ? <HrDashboard /> : <Navigate to="/" />} />
          <Route path="/hr/employees" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('hr') && (user?.groups || []).includes('hr'))) ? <EmployeeList /> : <Navigate to="/" />} />
          <Route path="/hr/attendance" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('hr') && (user?.groups || []).includes('hr'))) ? <AttendancePage /> : <Navigate to="/" />} />
          <Route path="/hr/salary" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('hr') && (user?.groups || []).includes('hr'))) ? <SalaryPage /> : <Navigate to="/" />} />
          <Route path="/hr/leave" element={(user?.role === 'super_admin' || user?.role === 'admin' || ((user?.company?.enabledModules || []).includes('hr') && (user?.groups || []).includes('hr'))) ? <LeavePage /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </ErrorBoundary>
      </Layout>
      </Router>
    </ThemeProvider>
  );
}

function App() {
  return (
    <DateFormatProvider>
      <FiscalYearProvider>
        <ToastProvider>
          <AppContent />
          <ToastContainer />
        </ToastProvider>
      </FiscalYearProvider>
    </DateFormatProvider>
  );
}

export default App;

