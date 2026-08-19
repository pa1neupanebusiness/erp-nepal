import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useFiscalYear } from '../../context/FiscalYearContext';

export default function AccountsDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalVouchers: 0, totalSales: 0, totalPurchases: 0, cashBalance: 0, bankBalance: 0, outstandingReceivable: 0, outstandingPayable: 0 });
  const [loading, setLoading] = useState(true);
  const { selectedYear } = useFiscalYear();

  useEffect(() => { fetchStats(); }, [selectedYear?._id]);

  const fetchStats = async () => {
    try {
      const [summaryRes, vouchersRes, salesRes, purchasesRes] = await Promise.all([
        api.get('/dashboard/summary').catch(() => ({ data: {} })),
        api.get('/vouchers').catch(() => ({ data: [] })),
        api.get('/sales').catch(() => ({ data: [] })),
        api.get('/purchases').catch(() => ({ data: [] })),
      ]);
      const d = summaryRes.data || {};
      const vouchers = vouchersRes.data || [];
      setStats({
        totalVouchers: vouchers.length,
        totalSales: d.monthSales || 0,
        totalPurchases: d.monthPurchases || 0,
        cashBalance: d.cashBalance || 0,
        bankBalance: d.bankBalance || 0,
        outstandingReceivable: d.outstandingReceivable || 0,
        outstandingPayable: d.outstandingPayable || 0,
      });
    } catch (err) {
      console.error('Failed to fetch accounts stats', err);
    }
    setLoading(false);
  };

  const kpiCards = [
    { label: 'Total Vouchers', value: stats.totalVouchers, icon: '🧾', color: '#d97706', path: '/vouchers' },
    { label: 'Monthly Sales', value: stats.totalSales, icon: '📈', color: '#16a34a', path: '/reports/vat' },
    { label: 'Monthly Purchases', value: stats.totalPurchases, icon: '📥', color: '#f97316', path: '/purchases' },
    { label: 'Cash Balance', value: stats.cashBalance, icon: '🏦', color: '#059669', path: '/accounts' },
    { label: 'Bank Balance', value: stats.bankBalance, icon: '🏧', color: '#2563eb', path: '/accounts' },
    { label: 'Receivable', value: stats.outstandingReceivable, icon: '📤', color: '#dc2626', path: '/reports/aging' },
    { label: 'Payable', value: stats.outstandingPayable, icon: '📥', color: '#7c3aed', path: '/reports/aging' },
  ];

  if (loading) return <div>Loading...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Accounting Dashboard</h1>
        <p>Financial overview and vouchers</p>
      </div>
      <div className="kpi-grid">
        {kpiCards.map((kpi, i) => (
          <div key={i} className="kpi-card" style={{ borderLeft: `4px solid ${kpi.color}`, cursor: 'pointer' }} onClick={() => navigate(kpi.path)}>
            <div className="kpi-top">
              <span className="kpi-icon">{kpi.icon}</span>
            </div>
            <div className="kpi-value">{typeof kpi.value === 'number' ? 'Rs. ' + kpi.value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : kpi.value}</div>
            <div className="kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}