import React, { useState } from 'react';

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, remarkRequired }) {
  const [remark, setRemark] = useState('');

  if (!open) return null;

  const handleConfirm = () => {
    if (remarkRequired && !remark.trim()) return;
    onConfirm(remarkRequired ? remark : undefined);
    setRemark('');
  };

  const handleCancel = () => {
    setRemark('');
    onCancel();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }} onClick={handleCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 25px 60px rgba(0,0,0,0.25)', width: '100%', maxWidth: '420px', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 1.5rem 0.5rem', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>🗑️</div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>{title || 'Confirm'}</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5 }}>{message}</p>
          {remarkRequired && (
            <div style={{ marginTop: '1rem', textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Remarks *</label>
              <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={3} placeholder="Reason is required"
                style={{ width: '100%', padding: '0.5rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} required />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', borderTop: '1px solid #e2e8f0', marginTop: '1rem' }}>
          <button onClick={handleCancel} style={{ flex: 1, padding: '0.85rem', background: 'none', border: 'none', borderRight: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.9rem', color: '#64748b', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleConfirm} disabled={remarkRequired && !remark.trim()}
            style={{ flex: 1, padding: '0.85rem', background: 'none', border: 'none', fontWeight: 600, fontSize: '0.9rem', color: remarkRequired && !remark.trim() ? '#94a3b8' : '#dc2626', cursor: remarkRequired && !remark.trim() ? 'not-allowed' : 'pointer' }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
