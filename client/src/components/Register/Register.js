import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';

const countryFlags = {
  nepal: '🇳🇵', india: '🇮🇳', usa: '🇺🇸', uk: '🇬🇧', australia: '🇦🇺',
  canada: '🇨🇦', germany: '🇩🇪', france: '🇫🇷', uae: '🇦🇪', saudi: '🇸🇦',
  singapore: '🇸🇬', malaysia: '🇲🇾', japan: '🇯🇵', china: '🇨🇳',
};

export default function Register() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countries, setCountries] = useState([]);
  const [showCustomCountry, setShowCustomCountry] = useState(false);
  const [customCountryName, setCustomCountryName] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);

  const [form, setForm] = useState({
    country: '',
    customCountry: '',
    customCurrency: 'USD',
    companyName: '',
    email: '',
    phone: '',
    address: '',
    pan: '',
    city: '',
    adminName: '',
    password: '',
    confirmPassword: '',
    dateFormat: 'ad',
  });

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const res = await api.get('/companies/countries');
        setCountries(res.data);
      } catch (err) {
        console.error('Failed to load countries', err);
      }
    };
    fetchCountries();
  }, []);

  useEffect(() => {
    if (form.country === 'nepal') {
      setForm(prev => ({ ...prev, dateFormat: 'bs' }));
    } else if (form.country && !form.country.startsWith('custom_')) {
      setForm(prev => ({ ...prev, dateFormat: 'ad' }));
    }
  }, [form.country]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCountrySelect = (code) => {
    if (code === 'custom') {
      setShowCustomCountry(true);
      setForm(prev => ({ ...prev, country: '', customCountry: '' }));
    } else {
      setShowCustomCountry(false);
      setForm(prev => ({ ...prev, country: code, customCountry: '' }));
    }
  };

  const handleCustomCountrySearch = async () => {
    if (!customCountryName.trim()) return;
    setSearching(true);
    try {
      const res = await api.post('/companies/search-country', { name: customCountryName.trim() });
      if (res.data.found) {
        setSearchResult(res.data);
        setForm(prev => ({ ...prev, country: res.data.code, customCountry: res.data.name }));
        setShowCustomCountry(false);
      } else {
        const code = 'custom_' + customCountryName.trim().toLowerCase().replace(/\s+/g, '_');
        setForm(prev => ({ ...prev, country: code, customCountry: customCountryName.trim() }));
        setShowCustomCountry(false);
      }
    } catch (err) {
      const code = 'custom_' + customCountryName.trim().toLowerCase().replace(/\s+/g, '_');
      setForm(prev => ({ ...prev, country: code, customCountry: customCountryName.trim() }));
      setShowCustomCountry(false);
    }
    setSearching(false);
  };

  const getCurrency = () => {
    if (form.country.startsWith('custom_')) {
      return form.customCurrency || 'USD';
    }
    const country = countries.find(c => c.code === form.country);
    return country ? country.currency : '';
  };

  const getCountryDisplayName = () => {
    if (form.country.startsWith('custom_')) {
      return form.customCountry || 'Custom Country';
    }
    return countries.find(c => c.code === form.country)?.name || form.country;
  };

  const getCountryFlag = () => {
    if (form.country.startsWith('custom_')) return '🌍';
    return countryFlags[form.country] || '🌍';
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (!form.country && !form.customCountry) {
        setError('Please select your country or enter a custom one');
        return;
      }
      if (showCustomCountry && customCountryName.trim() && !searching) {
        handleCustomCountrySearch();
        return;
      }
    }
    if (step === 2 && (!form.companyName || !form.email)) {
      setError('Company name and email are required');
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!form.adminName || !form.password) {
      setError('Admin name and password are required');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = {
        companyName: form.companyName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        pan: form.pan,
        city: form.city,
        country: form.country,
        customCountry: form.customCountry,
        customCurrency: form.customCurrency,
        dateFormat: form.dateFormat,
        adminName: form.adminName,
        password: form.password,
      };
      const { data } = await api.post('/companies/register', payload);
      if (data.fiscalYear) localStorage.setItem('fiscalYear', JSON.stringify(data.fiscalYear));
      localStorage.setItem('user', JSON.stringify(data));
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <button className="theme-toggle theme-toggle-floating" onClick={toggleTheme} title="Toggle theme">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <div className="register-card">
        <div className="register-header">
          <h1>ERP System</h1>
          <p>Create your business account</p>
        </div>

        <div className="setup-steps" style={{ marginBottom: '24px' }}>
          <div className={`step ${step >= 1 ? 'active' : ''}`}>1</div>
          <div className="step-line"></div>
          <div className={`step ${step >= 2 ? 'active' : ''}`}>2</div>
          <div className="step-line"></div>
          <div className={`step ${step >= 3 ? 'active' : ''}`}>3</div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {step === 1 && (
          <div>
            <h2 style={{ fontSize: '16px', color: 'var(--text)', marginBottom: '6px' }}>Select Your Country</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Chart of accounts will be auto-configured</p>
            <div className="country-grid">
              {countries.map((country) => (
                <div
                  key={country.code}
                  className={`country-option ${form.country === country.code ? 'selected' : ''}`}
                  onClick={() => handleCountrySelect(country.code)}
                >
                  <span className="country-flag">{countryFlags[country.code]}</span>
                  <span className="country-name">{country.name}</span>
                  <span className="country-currency">{country.currency}</span>
                </div>
              ))}
              <div
                className={`country-option ${showCustomCountry ? 'selected' : ''}`}
                onClick={() => handleCountrySelect('custom')}
                style={{ borderStyle: 'dashed', background: 'transparent' }}
              >
                <span className="country-flag">➕</span>
                <span className="country-name">Custom Country</span>
                <span className="country-currency">Type to search</span>
              </div>
            </div>

            {showCustomCountry && (
              <div style={{ marginTop: '16px', padding: '16px', background: 'var(--card-hover)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Country Name *</label>
                  <input
                    type="text"
                    name="customCountry"
                    value={customCountryName}
                    onChange={e => {
                      setCustomCountryName(e.target.value);
                      setForm(prev => ({ ...prev, customCountry: e.target.value }));
                    }}
                    placeholder="e.g. Bangladesh, Philippines, Kenya..."
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Currency Code (ISO 4217) *</label>
                  <input
                    type="text"
                    name="customCurrency"
                    value={form.customCurrency}
                    onChange={e => setForm(prev => ({ ...prev, customCurrency: e.target.value.toUpperCase() }))}
                    placeholder="e.g. BDT, PHP, KES"
                    maxLength={3}
                    required
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                {searching && <div style={{ color: '#3b82f6', fontSize: '13px' }}>Searching chart of accounts...</div>}
                {searchResult && !searchResult.found && (
                  <div style={{ color: '#f59e0b', fontSize: '13px', marginTop: '8px' }}>
                    Country not in database. A generic chart of accounts will be generated.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button className="btn btn-secondary btn-lg" onClick={() => setShowCustomCountry(false)}>Cancel</button>
                  <button className="btn btn-primary btn-lg" onClick={handleCustomCountrySearch} disabled={searching || !customCountryName.trim()}>
                    {searching ? 'Searching...' : 'Search & Continue'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button className="btn btn-primary btn-lg" onClick={handleNext}>Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ fontSize: '16px', color: 'var(--text)', marginBottom: '6px' }}>Company Information</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Enter your business details</p>
            <div className="form-group">
              <label>Company Name *</label>
              <input type="text" name="companyName" value={form.companyName} onChange={handleChange} placeholder="Enter company name" required />
            </div>
            <div className="form-group">
              <label>Company Email *</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="company@example.com" required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input type="text" name="phone" value={form.phone} onChange={handleChange} placeholder="Phone number" />
              </div>
              <div className="form-group">
                <label>Tax Number (PAN/VAT)</label>
                <input type="text" name="pan" value={form.pan} onChange={handleChange} placeholder="Tax ID" />
              </div>
            </div>
            <div className="form-group">
              <label>Address</label>
              <input type="text" name="address" value={form.address} onChange={handleChange} placeholder="Street address" />
            </div>
            <div className="form-group">
              <label>City</label>
              <input type="text" name="city" value={form.city} onChange={handleChange} placeholder="City" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
              <button className="btn btn-secondary btn-lg" onClick={handleBack}>Back</button>
              <button className="btn btn-primary btn-lg" onClick={handleNext}>Next</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 style={{ fontSize: '16px', color: 'var(--text)', marginBottom: '6px' }}>Admin Account</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Create your admin login credentials</p>
            <div className="form-group">
              <label>Admin Name *</label>
              <input type="text" name="adminName" value={form.adminName} onChange={handleChange} placeholder="Your full name" required />
            </div>
            <div className="form-group">
              <label>Password *</label>
              <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Min 6 characters" required minLength={6} />
            </div>
            <div className="form-group">
              <label>Confirm Password *</label>
              <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="Confirm password" required />
            </div>

            <div className="setup-summary" style={{ marginTop: '16px' }}>
              <h3>Setup Summary</h3>
              <div className="summary-row">
                <span>Country:</span>
                <strong>{getCountryFlag()} {getCountryDisplayName()}</strong>
              </div>
              <div className="summary-row">
                <span>Company:</span>
                <strong>{form.companyName}</strong>
              </div>
              <div className="summary-row">
                <span>Currency:</span>
                <strong>{getCurrency()}</strong>
              </div>
              <div className="summary-row">
                <span>Admin:</span>
                <strong>{form.adminName || '-'}</strong>
              </div>
              <div className="summary-row">
                <span>Date Format:</span>
                <strong>{form.dateFormat === 'bs' ? 'Bikram Sambat (BS)' : 'Gregorian (AD)'}</strong>
              </div>
              <div className="summary-row">
                <span>Fiscal Year:</span>
                <strong style={{ color: '#3b82f6' }}>Auto-configured</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
              <button className="btn btn-secondary btn-lg" onClick={handleBack}>Back</button>
              <button className="btn btn-success btn-lg" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>
          </div>
        )}

        <div className="register-footer">
          Already have an account? <Link to="/login">Login</Link>
        </div>
      </div>
    </div>
  );
}
