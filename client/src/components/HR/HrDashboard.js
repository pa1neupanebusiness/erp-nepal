import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

export default function HrDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ employees: 0, presentToday: 0, absentToday: 0, pendingLeaves: 0, pendingSalary: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [empRes, attRes, leaveRes, salRes] = await Promise.all([
          api.get('/hr/employees'),
          api.get('/hr/attendance', { params: { status: 'present', startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] } }),
          api.get('/hr/leave', { params: { status: 'pending' } }),
          api.get('/hr/salary', { params: { status: 'pending' } }),
        ]);
        setStats({
          employees: empRes.data.length,
          presentToday: attRes.data.length,
          absentToday: empRes.data.filter(e => e.status === 'active').length - attRes.data.length,
          pendingLeaves: leaveRes.data.length,
          pendingSalary: salRes.data.length,
        });
      } catch (err) {
        console.error('Failed to fetch HR stats', err);
      }
      setLoading(false);
    };
    fetchStats();
  }, []);

  const kpiCards = [
    { label: 'Total Employees', value: stats.employees, icon: '👥', color: '#3b82f6', path: '/hr/employees' },
    { label: 'Present Today', value: stats.presentToday, icon: '✅', color: '#10b981', path: '/hr/attendance' },
    { label: 'Absent Today', value: stats.absentToday, icon: '❌', color: '#ef4444', path: '/hr/attendance' },
    { label: 'Pending Leaves', value: stats.pendingLeaves, icon: '📋', color: '#f59e0b', path: '/hr/leave' },
    { label: 'Pending Salary', value: stats.pendingSalary, icon: '💰', color: '#8b5cf6', path: '/hr/salary' },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>HR Dashboard</h1>
        <p>Manage employees, attendance, salary, and leave</p>
      </div>
      <div className="kpi-grid">
        {kpiCards.map((kpi, i) => (
          <div
            key={i}
            className="kpi-card"
            style={{ borderLeft: `4px solid ${kpi.color}`, cursor: 'pointer' }}
            onClick={() => navigate(kpi.path)}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div className="kpi-icon">{kpi.icon}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}