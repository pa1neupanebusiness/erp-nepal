import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../UI/Toast';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const addToast = useToast();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      onLogin(data);
    } catch (err) {
      addToast(err.response?.data?.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <button className="theme-toggle theme-toggle-floating" onClick={toggleTheme} title="Toggle theme">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <div className="login-card">
        <div className="login-header">
          <h1>ERP System</h1>
          <p>Accounting & Store Management</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="login-footer">
          <Link to="/register" style={{ color: '#3b82f6', fontSize: '0.85rem' }}>Create Free Account</Link>
        </div>
      </div>
    </div>
  );
}
