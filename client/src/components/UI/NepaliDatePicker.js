import React, { useState, useEffect, useRef, useCallback } from 'react';
import DateConverter from '@remotemerge/nepali-date-converter';

const BS_MONTHS_NP = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण', 'भाद्र', 'आश्विन',
  'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फाल्गुन', 'चैत्र'
];

const BS_MONTHS_EN = [
  'Baishakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

const BS_DAYS = ['आइत', 'सोम', 'मंगल', 'बुध', 'बिही', 'शुक्र', 'शनि'];

function getDaysInBSMonth(year, month) {
  if (month < 1 || month > 12) return 30;
  try {
    const current = new DateConverter(`${year}-${String(month).padStart(2, '0')}-01`).toAd();
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const next = new DateConverter(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`).toAd();
    const d1 = new Date(current.year, current.month - 1, current.date);
    const d2 = new Date(next.year, next.month - 1, next.date);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  } catch { return 30; }
}

function getBSToday() {
  try {
    const now = new Date();
    const bs = new DateConverter(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`).toBs();
    if (bs && bs.year && bs.month && bs.date) return { year: bs.year, month: bs.month, day: bs.date };
  } catch {}
  return { year: 2082, month: 4, day: 15 };
}

function getDayOfWeek(year, month, day) {
  try {
    const ad = new DateConverter(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`).toAd();
    return new Date(ad.year, ad.month - 1, ad.date).getDay();
  } catch { return 0; }
}

function toBsStr(y, m, d) {
  if (!y || !m || !d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseBsStr(str) {
  if (!str || typeof str !== 'string' || str === 'undefined' || str === 'null') return null;
  const parts = str.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
    if (y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 32) return { year: y, month: m, day: d };
  }
  return null;
}

export default function NepaliDatePicker({ value, onChange, style, placeholder, id, className }) {
  const today = getBSToday();
  const parsed = parseBsStr(value);

  const [year, setYear] = useState(parsed?.year || today.year);
  const [month, setMonth] = useState(parsed?.month || today.month);
  const [day, setDay] = useState(parsed?.day || today.day);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const p = parseBsStr(value);
    if (p) { setYear(p.year); setMonth(p.month); setDay(p.day); }
  }, [value]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const maxDay = getDaysInBSMonth(year, month);

  useEffect(() => {
    if (day > maxDay) { setDay(maxDay); onChange?.(toBsStr(year, month, maxDay)); }
  }, [year, month, maxDay]);

  const openPicker = useCallback(() => {
    if (!open && !parseBsStr(value)) {
      const t = getBSToday();
      setYear(t.year); setMonth(t.month); setDay(t.day);
      onChange?.(toBsStr(t.year, t.month, t.day));
    }
    setOpen(o => !o);
  }, [open, value, onChange]);

  const emit = (y, m, d) => { onChange?.(toBsStr(y, m, Math.min(d, getDaysInBSMonth(y, m)))); };

  const goToToday = () => {
    const t = getBSToday();
    setYear(t.year); setMonth(t.month); setDay(t.day);
    onChange?.(toBsStr(t.year, t.month, t.day));
    setOpen(false);
  };

  const selectDay = (d) => { setDay(d); emit(year, month, d); setOpen(false); };

  const years = [];
  for (let y = 2070; y <= 2100; y++) years.push(y);

  const days = [];
  for (let d = 1; d <= maxDay; d++) days.push(d);

  const calStartDow = getDayOfWeek(year, month, 1);

  const displayVal = (value && typeof value === 'string' && value !== 'undefined' && value !== 'null')
    ? value : toBsStr(year, month, day);

  const [pos, setPos] = useState({ above: false, left: 0, top: 0 });

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setPos({
        above: spaceBelow < 340,
        left: rect.left + window.scrollX,
        top: spaceBelow < 340 ? rect.top + window.scrollY - 340 - 4 : rect.bottom + window.scrollY + 4,
      });
    }
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', ...style }} className={className}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <input
          id={id} type="text" readOnly value={displayVal}
          placeholder={placeholder || 'YYYY-MM-DD'}
          onClick={openPicker}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', width: 120, cursor: 'pointer', background: '#fff' }}
        />
        <button type="button" onClick={openPicker}
          style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1', cursor: 'pointer', fontSize: '0.85rem', background: '#f8fafc' }}
        >{'\uD83D\uDCC5'}</button>
      </div>

      {open && (
        <div style={{
          position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 6px 24px rgba(0,0,0,0.15)', padding: '10px 12px', minWidth: 320,
        }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
            <select value={year} onChange={e => { const y = parseInt(e.target.value); setYear(y); emit(y, month, day); }}
              style={{ padding: '4px 2px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff', width: 78 }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={month} onChange={e => { const m = parseInt(e.target.value); setMonth(m); emit(year, m, day); }}
              style={{ padding: '4px 2px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff', width: 108 }}>
              {BS_MONTHS_NP.map((n, i) => <option key={i + 1} value={i + 1}>{i + 1}. {n}</option>)}
            </select>
            <select value={day} onChange={e => { const d = parseInt(e.target.value); setDay(d); emit(year, month, d); }}
              style={{ padding: '4px 2px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff', width: 58 }}>
              {days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button type="button" onClick={goToToday}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#eef2ff', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
            >आज</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, textAlign: 'center', fontSize: '0.68rem', color: '#64748b', marginBottom: 4 }}>
            {BS_DAYS.map(d => <div key={d} style={{ padding: '3px 0', fontWeight: 600 }}>{d}</div>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
            {(() => {
              const cells = [];
              for (let i = 0; i < calStartDow; i++) cells.push(<div key={`e${i}`} />);
              for (let d = 1; d <= maxDay; d++) {
                const isToday = year === today.year && month === today.month && d === today.day;
                const isSelected = year === parsed?.year && month === parsed?.month && d === parsed?.day;
                cells.push(
                  <div key={d} onClick={() => selectDay(d)}
                    style={{
                      padding: '5px 0', cursor: 'pointer', borderRadius: 5, textAlign: 'center',
                      background: isSelected ? '#4f46e5' : isToday ? '#eef2ff' : 'transparent',
                      color: isSelected ? '#fff' : '#1e293b',
                      fontWeight: isToday || isSelected ? 700 : 400, fontSize: '0.8rem',
                    }}
                  >{d}</div>
                );
              }
              return cells;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export function bsToADStr(bsStr) {
  if (!bsStr) return '';
  const p = parseBsStr(bsStr);
  if (!p) return '';
  try {
    const ad = new DateConverter(`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`).toAd();
    return `${ad.year}-${String(ad.month).padStart(2, '0')}-${String(ad.date).padStart(2, '0')}`;
  } catch { return ''; }
}

export function adToBsStr(dateOrStr) {
  if (!dateOrStr) return '';
  try {
    const d = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
    if (!d || isNaN(d.getTime())) return '';
    const bs = new DateConverter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`).toBs();
    if (!bs || !bs.year || !bs.month || !bs.date) return '';
    return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.date).padStart(2, '0')}`;
  } catch { return ''; }
}

export function getBSTodayStr() { const t = getBSToday(); return toBsStr(t.year, t.month, t.day); }
export { parseBsStr as parseBS, BS_MONTHS_EN, BS_MONTHS_NP };
