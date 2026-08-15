import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useFiscalYear } from '../../context/FiscalYearContext';

export default function InventoryDashboard() {
  const [stats, setStats] = useState({ totalProducts: 0, lowStock: 0, totalCategories: 0, totalSuppliers: 0, totalPurchases: 0, totalSales: 0 });
  const [loading, setLoading] = useState(true);
  const { selectedYear } = useFiscalYear();

  useEffect(() => { fetchStats(); }, [selectedYear?._id]);

  const fetchStats = async () => {
    try {
      const [productsRes, categoriesRes, suppliersRes, purchasesRes, salesRes] = await Promise.all([
        api.get('/products').catch(() => ({ data: [] })),
        api.get('/categories').catch(() => ({ data: [] })),
        api.get('/suppliers').catch(() => ({ data: [] })),
        api.get('/purchases').catch(() => ({ data: [] })),
        api.get('/sales').catch(() => ({ data: [] })),
      ]);
      const products = productsRes.data || [];
      const lowStock = products.filter(p => p.stock <= (p.minStock || 0)).length;
      setStats({
        totalProducts: products.length,
        lowStock,
        totalCategories: categoriesRes.data?.length || 0,
        totalSuppliers: suppliersRes.data?.length || 0,
        totalPurchases: purchasesRes.data?.length || 0,
        totalSales: salesRes.data?.length || 0,
      });
    } catch (err) {
      console.error('Failed to fetch inventory stats', err);
    }
    setLoading(false);
  };

  const kpiCards = [
    { label: 'Total Products', value: stats.totalProducts, icon: '📦', color: '#7c3aed', path: '/products' },
    { label: 'Low Stock Items', value: stats.lowStock, icon: '⚠️', color: '#ef4444', path: '/stock-reports' },
    { label: 'Categories', value: stats.totalCategories, icon: '🏷️', color: '#0d9488', path: '/categories' },
    { label: 'Suppliers', value: stats.totalSuppliers, icon: '🚚', color: '#ea580c', path: '/suppliers' },
    { label: 'Purchases', value: stats.totalPurchases, icon: '📥', color: '#f97316', path: '/purchases' },
    { label: 'Sales', value: stats.totalSales, icon: '🛒', color: '#059669', path: '/sales' },
  ];

  if (loading) return <div>Loading...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Inventory Dashboard</h1>
        <p>Store, products, and stock overview</p>
      </div>
      <div className="kpi-grid">
        {kpiCards.map((kpi, i) => (
          <div key={i} className="kpi-card" style={{ borderLeft: `4px solid ${kpi.color}`, cursor: 'pointer' }} onClick={() => window.location.href = kpi.path}>
            <div className="kpi-top">
              <span className="kpi-icon">{kpi.icon}</span>
            </div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}