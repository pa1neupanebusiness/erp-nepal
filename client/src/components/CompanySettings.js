import React, { useState, useEffect } from 'react';
import api from '../api';
import { useToast } from './UI/Toast';

const taxLabels = {
  nepal: { vat: 'VAT', rate: 13 },
  india: { vat: 'GST', rate: 18 },
  usa: { vat: 'Sales Tax', rate: 0 },
  uk: { vat: 'VAT', rate: 20 },
  australia: { vat: 'GST', rate: 10 },
  canada: { vat: 'GST/HST', rate: 5 },
  germany: { vat: 'USt', rate: 19 },
  france: { vat: 'TVA', rate: 20 },
  japan: { vat: '消費税', rate: 10 },
  singapore: { vat: 'GST', rate: 9 },
  uae: { vat: 'VAT', rate: 5 },
  southafrica: { vat: 'VAT', rate: 15 },
  newzealand: { vat: 'GST', rate: 15 },
  ireland: { vat: 'VAT', rate: 23 },
};

export default function CompanySettings() {
  const addToast = useToast();
  const [form, setForm] = useState({
    name: '', phone: '', address: '', pan: '', regNumber: '', city: '',
    vatRate: '', salesTaxRate: '', dateFormat: 'ad',
  });
  const [loading, setLoading] = useState(true);
  const [hasCompany, setHasCompany] = useState(true);
  const [saving, setSaving] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const country = user?.company?.country || 'nepal';
  const tax = taxLabels[country] || taxLabels.nepal;

  useEffect(() => {
    api.get('/company')
      .then(r => {
        const data = r.data || {};
        setForm({
          name: data.name || '',
          phone: data.phone || '',
          address: data.address || '',
          pan: data.pan || '',
          regNumber: data.regNumber || '',
          city: data.city || '',
          vatRate: data.vatRate ?? '',
          salesTaxRate: data.salesTaxRate ?? '',
          dateFormat: data.dateFormat || 'ad',
        });
      })
      .catch(() => setHasCompany(false))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        vatRate: form.vatRate !== '' ? Number(form.vatRate) : undefined,
        salesTaxRate: form.salesTaxRate !== '' ? Number(form.salesTaxRate) : undefined,
        isTaxConfigured: true,
      };
      const { data } = await api.put('/company', payload);
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      if (stored.company) {
        stored.company.name = data.name;
        stored.company.vatRate = data.vatRate;
        stored.company.salesTaxRate = data.salesTaxRate;
        stored.company.dateFormat = data.dateFormat;
        stored.company.isTaxConfigured = true;
        localStorage.setItem('user', JSON.stringify(stored));
      }
      addToast('Company settings updated', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update', 'error');
    }
    setSaving(false);
  };

  if (loading) return <div>Loading...</div>;

  if (!hasCompany) return (
    <div>
      <div className="page-header"><h1>Company Settings</h1></div>
      <div className="card">
        <p>No company is assigned to this account. Company settings are managed by each company's admin from this page, or by the super admin from the Companies page.</p>
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1>Company Settings</h1>
      </div>
      <form onSubmit={handleSubmit} className="card form-card" style={{ maxWidth: 500 }}>
        <div className="form-group"><label>Company Name *</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="form-group"><label>Phone</label>
          <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="form-group"><label>Address</label>
          <input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
        <div className="form-group"><label>City</label>
          <input value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
        <div className="form-group"><label>PAN / VAT No.</label>
          <input value={form.pan || ''} onChange={e => setForm({ ...form, pan: e.target.value })} placeholder="Enter PAN number" /></div>
        <div className="form-group"><label>Company Registration No.</label>
          <input value={form.regNumber || ''} onChange={e => setForm({ ...form, regNumber: e.target.value })} /></div>

        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '16px', paddingTop: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '12px' }}>
            {tax.vat} Configuration
          </h3>
          <div className="form-group">
            <label>{tax.vat} Rate (%) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.vatRate}
              onChange={e => setForm({ ...form, vatRate: e.target.value })}
              placeholder={`e.g. ${tax.rate}`}
              required
            />
            <small style={{ color: '#64748b', fontSize: '11px' }}>Standard {tax.vat} rate for your country: {tax.rate}%</small>
          </div>
          {country !== 'usa' && (
            <div className="form-group">
              <label>Sales Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.salesTaxRate}
                onChange={e => setForm({ ...form, salesTaxRate: e.target.value })}
                placeholder="0"
              />
              <small style={{ color: '#64748b', fontSize: '11px' }}>Additional sales tax if applicable (default: 0)</small>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '16px', paddingTop: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '12px' }}>Date Format</h3>
          <div className="form-group">
            <label>Date Format</label>
            <select value={form.dateFormat} onChange={e => setForm({ ...form, dateFormat: e.target.value })}>
              <option value="ad">Gregorian (AD) - YYYY-MM-DD</option>
              {country === 'nepal' && <option value="bs">Bikram Sambat (BS) - YYYY-MM-DD</option>}
            </select>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
