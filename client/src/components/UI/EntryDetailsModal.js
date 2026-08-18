import React, { useEffect } from 'react';
import { printEntry } from './printEntry';

export default function EntryDetailsModal({ title, subtitle, meta = [], columns = [], rows = [], footer = [], actions, onClose, onRowClick, onPrint }) {
  const displayRows = rows;

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);
  const doPrint = () => {
    if (onPrint) { onPrint(); return; }
    printEntry({ title, subtitle, meta, columns, rows, footer });
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <div className="modal-actions" style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            <button className="btn btn-sm btn-secondary" onClick={doPrint}>Print</button>
            <button className="btn btn-sm btn-danger" onClick={doPrint}>PDF</button>
            {actions}
            <button className="btn btn-sm modal-close-x" title="Close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="modal-body">
          {subtitle && <div className="text-muted" style={{ marginBottom: '0.75rem' }}>{subtitle}</div>}
          {meta.length > 0 && (
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: '0.75rem' }}>
              {meta.map((m, i) => (
                <div key={i} style={{ fontSize: '0.85rem', overflow: 'hidden', wordBreak: 'break-word' }}>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>{m.label}</div>
                  <strong>{m.value}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="table-responsive">
            <table className="table">
              <thead><tr>{columns.map((c, i) => <th key={i} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</th>)}</tr></thead>
              <tbody>
                {displayRows.map((r, i) => (
                  <tr key={i} onClick={() => onRowClick && onRowClick(r)} style={onRowClick ? { cursor: 'pointer' } : {}}>
                    {columns.map((c, j) => <td key={j} className={c.align === 'right' ? 'text-right' : ''}>{c.render ? c.render(r[c.key], r) : r[c.key]}</td>)}
                  </tr>
                ))}
                {displayRows.length === 0 && <tr><td colSpan={Math.max(columns.length, 1)} className="text-center">No data</td></tr>}
              </tbody>
              {footer.length > 0 && (
                <tfoot>
                  {footer.map((f, i) => (
                    <tr key={i}>
                      <td colSpan={Math.max(columns.length - 1, 1)} className="text-right"><strong>{f.label}</strong></td>
                      <td className="text-right"><strong>{f.render ? f.render(f.value) : f.value}</strong></td>
                    </tr>
                  ))}
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
