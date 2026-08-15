import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { format as dateFnsFormat } from 'date-fns';
import { ADToBS, BSToAD } from 'bikram-sambat-js';
import api from '../api';

const DateFormatContext = createContext();

export function DateFormatProvider({ children }) {
  const [dateFormat, setDateFormat] = useState('ad');
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user?.company?._id) {
        setLoading(false);
        return;
      }
      const res = await api.get('/date-format');
      setDateFormat(res.data.dateFormat || 'ad');
    } catch (err) {
      console.error('Failed to load date format settings', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const updateDateFormat = async (format) => {
    try {
      await api.put('/date-format', { dateFormat: format });
      setDateFormat(format);
    } catch (err) {
      console.error('Failed to update date format', err);
    }
  };

  const formatDate = (date, formatStr = 'YYYY-MM-DD') => {
    if (!date) return '';

    try {
      if (dateFormat === 'bs') {
        const bsStr = ADToBS(new Date(date));
        const [y, m, d] = bsStr.split('-');

        if (formatStr === 'YYYY-MM-DD') {
          return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        return `${y}/${m}/${d}`;
      } else {
        const d = new Date(date);
        return dateFnsFormat(d, 'yyyy-MM-dd');
      }
    } catch (err) {
      console.error('Date format error:', err);
      return String(date);
    }
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return null;

    try {
      if (dateFormat === 'bs') {
        const parts = String(dateStr).split(/[-/]/);
        if (parts.length === 3) {
          const adDate = BSToAD({
            year: parseInt(parts[0]),
            month: parseInt(parts[1]),
            day: parseInt(parts[2])
          });
          return new Date(adDate);
        }
      }
      return new Date(dateStr);
    } catch (err) {
      console.error('Date parse error:', err);
      return null;
    }
  };

  return (
    <DateFormatContext.Provider value={{
      dateFormat,
      loading,
      updateDateFormat,
      formatDate,
      parseDate
    }}>
      {children}
    </DateFormatContext.Provider>
  );
}

export function useDateFormat() {
  return useContext(DateFormatContext);
}
