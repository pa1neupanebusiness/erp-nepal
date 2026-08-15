import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const FiscalYearContext = createContext();

export function FiscalYearProvider({ children }) {
  const [fiscalYears, setFiscalYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [viewingId, setViewingId] = useState(() => localStorage.getItem('viewingFiscalYear') || '');
  const [loading, setLoading] = useState(true);

  const loadYears = useCallback(async () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.token) {
      setFiscalYears([]);
      setSelectedYear(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/fiscal-years');
      setFiscalYears(res.data);
      const stored = localStorage.getItem('fiscalYear');
      if (stored) {
        const parsed = JSON.parse(stored);
        const exists = res.data.find(y => y._id === parsed._id);
        if (exists) {
          setSelectedYear(exists);
          setLoading(false);
          return;
        }
      }
      const active = res.data.find(y => y.isActive) || res.data[0];
      if (active) {
        setSelectedYear(active);
        localStorage.setItem('fiscalYear', JSON.stringify(active));
      }
    } catch (err) {
      console.error('Failed to load fiscal years', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadYears(); }, [loadYears]);

  const switchYear = (year) => {
    setSelectedYear(year);
    localStorage.setItem('fiscalYear', JSON.stringify(year));
    if (year.isActive) {
      setViewingId(year._id);
      localStorage.setItem('viewingFiscalYear', year._id);
    } else {
      setViewingId('');
      localStorage.removeItem('viewingFiscalYear');
    }
  };

  const viewYear = (year) => {
    setViewingId(year._id);
    localStorage.setItem('viewingFiscalYear', year._id);
  };

  const exitView = () => {
    setViewingId('');
    localStorage.removeItem('viewingFiscalYear');
    const active = fiscalYears.find(y => y.isActive) || fiscalYears[0];
    if (active) {
      setSelectedYear(active);
      localStorage.setItem('fiscalYear', JSON.stringify(active));
    }
  };

  const isViewingSelected = selectedYear && !selectedYear.isActive && viewingId === selectedYear._id;

  const refresh = () => loadYears();

  return (
    <FiscalYearContext.Provider value={{ fiscalYears, selectedYear, viewingId, isViewingSelected, switchYear, viewYear, exitView, loading, refresh }}>
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYear() {
  return useContext(FiscalYearContext);
}
