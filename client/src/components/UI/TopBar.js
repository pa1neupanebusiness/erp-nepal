import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import api from '../../api';
import NotificationBell from './NotificationBell';
import { TimestampToggle } from '../../utils/timeService';

export default function TopBar() {
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [muted, setMuted] = useState(() => localStorage.getItem('notifMuted') === 'true');
  const [prevCount, setPrevCount] = useState(0);
  const [companies, setCompanies] = useState([]);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';
  const isSuperAdmin = user.role === 'super_admin';
  const [selectedCompany, setSelectedCompany] = useState(() => JSON.parse(localStorage.getItem('selectedCompany') || 'null'));
  const contactRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.get('/companies').then(r => {
      setCompanies(r.data);
      const sc = JSON.parse(localStorage.getItem('selectedCompany') || 'null');
      if (sc && !r.data.find(c => c._id === sc)) localStorage.removeItem('selectedCompany');
    }).catch(() => {});
  }, [isSuperAdmin]);

  const handleCompanyChange = (id) => {
    if (!id) {
      localStorage.removeItem('selectedCompany');
    } else {
      localStorage.setItem('selectedCompany', JSON.stringify(id));
    }
    setSelectedCompany(id || null);
    window.location.reload();
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (contactRef.current && !contactRef.current.contains(e.target)) setContactOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleMute = () => {
    setMuted(prev => {
      const next = !prev;
      localStorage.setItem('notifMuted', String(next));
      return next;
    });
  };

  const loadNotifications = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const company = user?.company;
      if (!company) return;

      const items = [];

      if (company.isTaxConfigured === false) {
        const country = company.country || 'nepal';
        const taxNames = {
          nepal: 'VAT/TDS', india: 'GST/TDS', usa: 'Sales Tax', uk: 'VAT',
          australia: 'GST', canada: 'GST/HST', germany: 'USt', france: 'TVA',
          japan: '消費税', singapore: 'GST', uae: 'VAT', southafrica: 'VAT',
          newzealand: 'GST', ireland: 'VAT',
        };
        items.push({
          id: 'tax-setup',
          type: 'warning',
          title: `${taxNames[country] || 'Tax'} Not Configured`,
          message: `Please set up your ${taxNames[country] || 'tax'} rate in Company Settings.`,
          action: () => navigate('/company-settings'),
          actionLabel: 'Configure Now',
        });
      }

      if (!company.dateFormat) {
        items.push({
          id: 'date-format',
          type: 'info',
          title: 'Date Format Not Set',
          message: 'Configure your preferred date format in Company Settings.',
          action: () => navigate('/company-settings'),
          actionLabel: 'Set Date Format',
        });
      }

      setNotifications(prev => {
        if (items.length > prevCount && prevCount > 0 && !muted) {
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRl9vT19teleVBmb3JtYXQAAAA=');
            audio.volume = 0.3;
            audio.play().catch(() => {});
          } catch (e) {}
        }
        setPrevCount(items.length);
        return items;
      });
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
  };

  const unreadCount = notifications.length;

  return (
    <div style={{ 
      position: 'fixed', top: 0, left: 0, right: 0, 
      background: 'linear-gradient(135deg, var(--topbar-g1) 0%, var(--topbar-g2) 100%)',
      borderBottom: '1px solid var(--topbar-border)',
      padding: '12px 20px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      zIndex: 1000,
    }}>
      <div style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--topbar-text)' }}>
        ERP System
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {isSuperAdmin && (
          <select
            value={selectedCompany || ''}
            onChange={e => handleCompanyChange(e.target.value)}
            style={{
              background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--topbar-border)',
              borderRadius: '6px', padding: '5px 8px', fontSize: '13px', maxWidth: '240px', cursor: 'pointer',
            }}
            title="Enter company (super admin)"
          >
            <option value="">All Companies</option>
            {companies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )}
        <NotificationBell user={user} />
        
        <button
          onClick={toggleMute}
          style={{
            background: muted ? '#fee2e2' : '#f0fdf4',
            border: `1px solid ${muted ? '#fca5a5' : '#86efac'}`, borderRadius: '6px',
            padding: '4px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            color: muted ? '#991b1b' : '#166534',
          }}
          title={muted ? 'Unmute notifications' : 'Mute notifications'}
        >
          {muted ? '🔇 Mute' : '🔊 Sound'}
        </button>
        
        <button
          onClick={() => setContactOpen(!contactOpen)}
          title="Contact"
          style={{
            background: 'none', border: '1px solid var(--topbar-border)', borderRadius: '6px',
            padding: '4px 8px', fontSize: '14px', cursor: 'pointer',
            color: 'var(--topbar-muted)',
          }}
        >
          📧
        </button>

        <TimestampToggle />
        <button
          onClick={toggleTheme}
          title="Toggle theme"
          style={{
            background: 'none', border: '1px solid var(--topbar-border)', borderRadius: '6px',
            padding: '4px 8px', fontSize: '14px', cursor: 'pointer',
            color: 'var(--topbar-muted)',
          }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        
        <div style={{ fontSize: '0.85rem', color: 'var(--topbar-muted)' }}>
          {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
        </div>
      </div>

      {contactOpen && isAdmin && (
        <div ref={contactRef} style={{ 
          position: 'absolute', top: '60px', right: '20px',
          background: 'var(--card)', borderRadius: '10px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          width: '280px', zIndex: 1001,
          border: '1px solid var(--border)',
        }}>
          <div style={{ 
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            fontWeight: '600', fontSize: '14px', color: 'var(--text)',
          }}>
            Contact Support
          </div>
          <a 
            href="mailto:pa1neupane.business@gmail.com" 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 16px', borderBottom: '1px solid var(--border-soft)',
              textDecoration: 'none', color: 'var(--text)', fontSize: '13px',
            }}
            onClick={() => setContactOpen(false)}
          >
            <span style={{ fontSize: '18px' }}>✉️</span>
            <div>
              <div style={{ fontWeight: '600' }}>Email Us</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>pa1neupane.business@gmail.com</div>
            </div>
          </a>
          <a 
            href="https://wa.me/9779862023112?text=Hello%20ERP%20Support%2C%20I%20need%20help%20with%20my%20account."
            target="_blank"
            rel="noopener noreferrer"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 16px',
              textDecoration: 'none', color: 'var(--text)', fontSize: '13px',
            }}
            onClick={() => setContactOpen(false)}
          >
            <span style={{ fontSize: '18px' }}>💬</span>
            <div>
              <div style={{ fontWeight: '600' }}>WhatsApp Us</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>+977 9862023112</div>
            </div>
          </a>
        </div>
      )}
    </div>
  );
}
