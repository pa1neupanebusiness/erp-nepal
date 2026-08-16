import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();
const ToastStateContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

export function useToastState() {
  return useContext(ToastStateContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={addToast}>
      <ToastStateContext.Provider value={{ toasts, removeToast }}>
        {children}
      </ToastStateContext.Provider>
    </ToastContext.Provider>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastState();
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '10px 16px', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          background: t.type === 'success' ? '#059669' : t.type === 'error' ? '#dc2626' : t.type === 'warning' ? '#d97706' : '#2563eb',
          color: '#fff', fontSize: '0.9rem', maxWidth: 360, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', pointerEvents: 'auto',
        }} onClick={() => removeToast(t.id)}>
          <span style={{ flex: 1 }}>{t.message}</span>
          <span style={{ fontSize: '1.1rem', opacity: 0.8 }}>×</span>
        </div>
      ))}
    </div>
  );
}
