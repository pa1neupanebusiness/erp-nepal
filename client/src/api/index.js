import axios from 'axios';
import { showConfirm } from '../components/UI/ConfirmDialog';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.token) config.headers.Authorization = `Bearer ${user.token}`;
  if (user.role === 'super_admin') {
    const sc = JSON.parse(localStorage.getItem('selectedCompany') || 'null');
    if (sc) config.headers['X-Company-Id'] = sc;
  }
  const fy = JSON.parse(localStorage.getItem('fiscalYear') || '{}');
  if (fy._id) {
    const viewing = localStorage.getItem('viewingFiscalYear');
    const showFy = fy.isActive || viewing === fy._id;
    if (showFy) {
      config.params = config.params || {};
      config.params.fiscalYear = fy._id;
      config.params.fyStart = fy.startDate;
      config.params.fyEnd = fy.endDate;
      config.params.fyIsActive = fy.isActive ? '1' : '0';
    }
    const method = (config.method || 'get').toLowerCase();
    if (method !== 'get' && !fy.isActive && viewing === fy._id) {
      const proceed = await showConfirm(`You are entering data for fiscal year ${fy.name || 'this fiscal year'}.\n\nThis record will be stored and shown under that fiscal year. Continue?`, { title: 'Confirm Fiscal Year' });
      if (!proceed) {
        return Promise.reject({ cancelled: true });
      }
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.removeItem('user');
      localStorage.removeItem('fiscalYear');
      const hadSession = !!user.token;
      const path = window.location.pathname;
      if (hadSession && path !== '/login' && path !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
