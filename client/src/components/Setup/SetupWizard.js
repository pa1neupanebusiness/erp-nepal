import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../UI/Toast';

const countryFlags = {
  nepal: '🇳🇵',
  india: '🇮🇳',
  usa: '🇺🇸',
  uk: '🇬🇧',
  australia: '🇦🇺',
};

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [countries, setCountries] = useState([]);
  const addToast = useToast();
  const { theme } = useTheme();

  const [formData, setFormData] = useState({
    country: '',
    companyName: '',
    companyEmail: '',
    phone: '',
    address: '',
    pan: '',
    city: '',
    dateFormat: 'bs'
  });

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const res = await api.get('/setup/countries');
        setCountries(res.data);
      } catch (err) {
        console.error('Failed to load countries', err);
      }
    };
    fetchCountries();
  }, []);

  useEffect(() => {
    if (formData.country === 'nepal') {
      setFormData(prev => ({ ...prev, dateFormat: 'bs' }));
    } else {
      setFormData(prev => ({ ...prev, dateFormat: 'ad' }));
    }
  }, [formData.country]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCountrySelect = (code) => {
    setFormData({ ...formData, country: code });
  };

  const handleNext = () => {
    if (step === 1 && !formData.country) {
      addToast('Please select your country', 'error');
      return;
    }
    if (step === 2 && (!formData.companyName || !formData.companyEmail)) {
      addToast('Company name and email are required', 'error');
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await api.post('/setup/complete', formData);
      onComplete();
    } catch (err) {
      addToast(err.response?.data?.message || 'Setup failed', 'error');
    }
    setLoading(false);
  };

  const getCurrency = () => {
    const country = countries.find(c => c.code === formData.country);
    return country ? country.currency : 'NPR';
  };

  return (
    <div className="setup-page">
      <div className="setup-card">
        <div className="setup-header">
          <h1>Welcome to ERP System</h1>
          <p>Let's set up your business</p>
        </div>

        <div className="setup-steps">
          <div className={`step ${step >= 1 ? 'active' : ''}`}>1</div>
          <div className="step-line"></div>
          <div className={`step ${step >= 2 ? 'active' : ''}`}>2</div>
          <div className="step-line"></div>
          <div className={`step ${step >= 3 ? 'active' : ''}`}>3</div>
        </div>

        {step === 1 && (
          <div className="setup-section">
            <h2>Select Your Country</h2>
            <p className="setup-description">Chart of accounts will be set up based on your country's rules</p>

            <div className="country-grid">
              {countries.map((country) => (
                <div
                  key={country.code}
                  className={`country-option ${formData.country === country.code ? 'selected' : ''}`}
                  onClick={() => handleCountrySelect(country.code)}
                >
                  <span className="country-flag">{countryFlags[country.code]}</span>
                  <span className="country-name">{country.name}</span>
                  <span className="country-currency">{country.currency}</span>
                </div>
              ))}
            </div>

            <div className="setup-actions">
              <button className="btn btn-primary btn-lg" onClick={handleNext}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="setup-section">
            <h2>Company Information</h2>
            <p className="setup-description">Enter your business details</p>

            <div className="form-group">
              <label>Company Name *</label>
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                placeholder="Enter company name"
                required
              />
            </div>

            <div className="form-group">
              <label>Company Email *</label>
              <input
                type="email"
                name="companyEmail"
                value={formData.companyEmail}
                onChange={handleChange}
                placeholder="company@example.com"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="Phone number"
                />
              </div>
              <div className="form-group">
                <label>Tax Number (PAN/VAT)</label>
                <input
                  type="text"
                  name="pan"
                  value={formData.pan}
                  onChange={handleChange}
                  placeholder="Tax ID"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Street address"
              />
            </div>

            <div className="form-group">
              <label>City</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="City"
              />
            </div>

            <div className="setup-actions-row">
              <button className="btn btn-secondary btn-lg" onClick={handleBack}>
                Back
              </button>
              <button className="btn btn-primary btn-lg" onClick={handleNext}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="setup-section">
            <h2>Select Date Format</h2>
            <p className="setup-description">Choose how dates will be displayed in {getCurrency()} transactions</p>

            <div className="date-options">
              <div
                className={`date-option ${formData.dateFormat === 'bs' ? 'selected' : ''} ${formData.country !== 'nepal' ? 'disabled' : ''}`}
                onClick={() => formData.country === 'nepal' && setFormData({ ...formData, dateFormat: 'bs' })}
              >
                <div className="date-option-icon">📅</div>
                <div className="date-option-title">Bikram Sambat (BS)</div>
                <div className="date-option-desc">Nepali Calendar</div>
                {formData.country === 'nepal' && <div className="date-option-badge">Recommended</div>}
              </div>

              <div
                className={`date-option ${formData.dateFormat === 'ad' ? 'selected' : ''}`}
                onClick={() => setFormData({ ...formData, dateFormat: 'ad' })}
              >
                <div className="date-option-icon">🌍</div>
                <div className="date-option-title">Gregorian (AD)</div>
                <div className="date-option-desc">International Standard</div>
              </div>
            </div>

            <div className="setup-summary">
              <h3>Setup Summary</h3>
              <div className="summary-row">
                <span>Country:</span>
                <strong>{countryFlags[formData.country]} {countries.find(c => c.code === formData.country)?.name}</strong>
              </div>
              <div className="summary-row">
                <span>Company:</span>
                <strong>{formData.companyName}</strong>
              </div>
              <div className="summary-row">
                <span>Currency:</span>
                <strong>{getCurrency()}</strong>
              </div>
              <div className="summary-row">
                <span>Date Format:</span>
                <strong>{formData.dateFormat === 'bs' ? 'Bikram Sambat (BS)' : 'Gregorian (AD)'}</strong>
              </div>
            </div>

            <div className="setup-actions-row">
              <button className="btn btn-secondary btn-lg" onClick={handleBack}>
                Back
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleComplete}
                disabled={loading}
              >
                {loading ? 'Setting up...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        )}

        <div className="setup-footer">
          <small>Chart of accounts will be auto-configured for your country</small>
        </div>
      </div>
    </div>
  );
}
