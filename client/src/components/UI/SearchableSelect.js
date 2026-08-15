import React, { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  onAdd,
  placeholder = 'Search & select...',
  disabled = false,
  required = false,
  style,
  inputStyle,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState(null);
  const wrapRef = useRef(null);

  const selected = options.find(o => o.value === value);

  const filtered = query
    ? options.filter(o => String(o.label).toLowerCase().includes(query.toLowerCase()))
    : options;

  const q = String(query || '').trim();
  const showAdd = onAdd && q.length > 0 && !options.some(o => String(o.label).trim().toLowerCase() === q.toLowerCase());
  const list = showAdd ? [...filtered, { value: '__add__', label: `+ Add "${q}"` }] : filtered;

  const updateRect = () => {
    const el = wrapRef.current;
    if (!el) return;
    const input = el.querySelector('input') || el;
    const r = input.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  };

  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [open]);

  const pick = (o) => {
    if (o.value === '__add__') {
      if (onAdd) onAdd(q);
    } else {
      onChange(o.value);
    }
    setOpen(false);
    setQuery('');
    setHighlight(0);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); setQuery(''); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, Math.max(list.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (list[highlight]) pick(list[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 140, ...style }}>
      <input
        type="text"
        value={open ? query : (selected ? selected.label : '')}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete="off"
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => { setOpen(true); setQuery(e.target.value); setHighlight(0); }}
        onKeyDown={onKeyDown}
        style={{ width: '100%', paddingRight: value ? '24px' : undefined, ...inputStyle }}
      />
      {value && (
        <span
          onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
          title="Clear selection"
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            cursor: 'pointer', color: '#94a3b8', background: 'transparent', padding: '0 3px', fontSize: '0.95rem', lineHeight: 1,
          }}
        >&times;</span>
      )}
      {open && rect && (
        <div
          style={{
            position: 'fixed', top: rect.top, left: rect.left, width: rect.width,
            background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
            maxHeight: 220, overflowY: 'auto', zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          }}
        >
          {filtered.length === 0 && !showAdd && (
            <div style={{ padding: '8px 10px', color: '#64748b', fontSize: '0.85rem' }}>No matches</div>
          )}
          {list.map((o, i) => (
            <div
              key={o.value === '__add__' ? '__add__' : o.value}
              onClick={() => pick(o)}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '7px 10px', cursor: 'pointer', fontSize: '0.9rem',
                background: i === highlight ? '#eff6ff' : '#fff',
                borderBottom: '1px solid #f1f5f9',
                ...(o.value === '__add__' ? { color: '#2563eb', fontWeight: 600, background: i === highlight ? '#eff6ff' : '#f0f9ff' } : {}),
              }}
            >
              {o.label}
              {o.subLabel && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{o.subLabel}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
