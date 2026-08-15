import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useFiscalYear } from '../../context/FiscalYearContext';

export default function POSDashboard() {
  const [stats, setStats] = useState({ todaySales: 0, todayCount: 0, todayRefunds: 0, monthSales: 0, monthRefunds: 0, totalCustomers: 0, todayCustomers: 0 });
  const [loading, setLoading] = useState(true);
  const { selectedYear } = useFiscalYear();

  useEffect(() => { fetchStats(); }, [selectedYear?._id]);

  const fetchStats = async () => {
    try {
      const [summaryRes, salesRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/dashboard/recent-sales'),
      ]);
      setStats({
        todaySales: summaryRes.data?.todaySales || 0,
        todayCount: summaryRes.data?.todayCount || 0,
        todayRefunds: summaryRes.data?.todayRefunds || 0,
        monthSales: summaryRes.data?.monthSales || 0,
        monthRefunds: summaryRes.data?.monthRefunds || 0,
        totalCustomers: summaryRes.data?.totalCustomers || 0,
        todayCustomers: summaryRes.data?.todayCount || 0,
      });
    } catch (err) {
      console.error('Failed to fetch POS stats', err);
    }
    setLoading(false);
  };

  const kpiCards = [
    { label: "Today's Sales", value: stats.todaySales, icon: '💰', color: '#059669', path: '/sales' },
    { label: 'Today\'s Transactions', value: stats.todayCount, icon: '🧾', color: '#3b82f6', path: '/sales' },
    { label: "Today's Refunds", value: stats.todayRefunds, icon: '↩️', color: '#ef4444', path: '/sales' },
    { label: 'Monthly Sales', value: stats.monthSales, icon: '📅', color: '#8b5cf6', path: '/sales' },
    { label: 'Monthly Refunds', value: stats.monthRefunds, icon: '📤', color: '#f59e0b', path: '/sales' },
    { label: 'Total Customers', value: stats.totalCustomers, icon: '👥', color: '#be185d', path: '/customers' },
  ];

  if (loading) return <div>Loading...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>POS Dashboard</h1>
        <p>Sales overview and transactions</p>
      </div>
      <div className="kpi-grid">
        {kpiCards.map((kpi, i) => (
          <div key={i} className="kpi-card" style={{ borderLeft: `4px solid ${kpi.color}`, cursor: 'pointer' }} onClick={() => window.location.href = kpi.path}>
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