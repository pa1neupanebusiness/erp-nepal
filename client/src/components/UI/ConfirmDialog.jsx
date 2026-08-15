import React from 'react';
import { createRoot } from 'react-dom/client';

function ConfirmModal({ title, message, confirmLabel, cancelLabel, danger, onResult }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{message}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '1rem 1.25rem 1.25rem' }}>
          <button className="btn btn-secondary" onClick={() => onResult(false)}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onResult(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// Imperative, app-styled confirm dialog. Returns a Promise<boolean>.
// Usable from React components (via useConfirm) or plain modules (api layer).
export function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const done = (val) => {
      root.unmount();
      if (container.parentNode) container.parentNode.removeChild(container);
      resolve(val);
    };
    root.render(
      <ConfirmModal
        title={options.title || 'Confirm'}
        message={message}
        confirmLabel={options.confirmLabel || 'OK'}
        cancelLabel={options.cancelLabel || 'Cancel'}
        danger={!!options.danger}
        onResult={done}
      />
    );
  });
}

export function useConfirm() {
  return (message, options) => showConfirm(message, options);
}
