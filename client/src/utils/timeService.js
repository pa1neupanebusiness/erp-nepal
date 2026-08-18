import { useState, useEffect } from 'react';
import api from '../api';
import { adToBsStr } from '../components/UI/NepaliDatePicker';

const STORAGE_KEY = 'erp_show_timestamp';
let cache = { t: 0, data: null };

// Single source of truth for the "Show Timestamp" toggle. Persisted in
// localStorage so every report view shares the same preference.
export function isTimestampEnabled() {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === null ? true : v === 'true';
}

export function useTimestampToggle() {
  const [show, setShow] = useState(() => isTimestampEnabled());
  useEffect(() => { localStorage.setItem(STORAGE_KEY, show ? 'true' : 'false'); }, [show]);
  return [show, () => setShow((s) => !s)];
}

// Reusable toggle button to drop into any report header ("Show" / "Hide" = add to all).
export function TimestampToggle() {
  const [show, toggle] = useTimestampToggle();
  return (
    <button type="button" className="btn btn-sm btn-secondary" onClick={toggle} title="Toggle report timestamp">
      {show ? 'Hide Timestamp' : 'Show Timestamp'}
    </button>
  );
}

// Fetch the authoritative system/server timestamp. Cached briefly so a single
// print run (and repeated prints within a few seconds) don't hammer the server.
export async function getSystemTime() {
  const now = Date.now();
  if (cache.data && now - cache.t < 10000) return cache.data;
  try {
    const { data } = await api.get('/system/time');
    cache = { t: now, data };
    return data;
  } catch {
    const d = new Date();
    const bs = adToBsStr(d) || d.toISOString().slice(0, 10);
    const data = {
      time: d.toISOString(),
      enDate: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      enTime: d.toLocaleTimeString('en-GB', { hour12: false }),
      bsDate: bs.replace(/\//g, '-'),
      bsTime: d.toLocaleTimeString('en-GB', { hour12: false }),
    };
    cache = { t: now, data };
    return data;
  }
}

// Stable newest-first comparison: always uses createdAt (system time) first,
// then _id (insertion order) as tiebreaker. Never uses 'date' (BS business date)
// because it has no time component and causes misordering.
export function compareByDate(a, b, newestFirst = true) {
  const ta = new Date(a?.createdAt || a?._id || 0).getTime();
  const tb = new Date(b?.createdAt || b?._id || 0).getTime();
  if (ta !== tb) return newestFirst ? tb - ta : ta - tb;
  const aid = a?._id || '';
  const bid = b?._id || '';
  return newestFirst ? String(bid).localeCompare(String(aid)) : String(aid).localeCompare(String(bid));
}

// Convenience: returns a new array sorted newest-first (does not mutate input).
export function sortByDate(arr, newestFirst = true) {
  return Array.isArray(arr) ? arr.slice().sort((a, b) => compareByDate(a, b, newestFirst)) : arr;
}

// "Nepali timestamp": Bikram Sambat date + clock time, from the system.
export function formatTimestamp(data, { nepali = true } = {}) {
  if (!data) return '';
  const bs = data.bsDate ? data.bsDate.replace(/-/g, '/') : '';
  if (nepali && bs) return `BS: ${bs}, ${data.bsTime || ''}`;
  return `${data.enDate || ''}, ${data.enTime || ''}`;
}
