import { ADToBS, BSToAD } from 'bikram-sambat-js';

const BS_MONTHS = [
  'Baishakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

const BS_MONTHS_NP = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण', 'भाद्र', 'आश्विन',
  'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फाल्गुन', 'चैत्र'
];

export function getBSToday() {
  const bs = ADToBS(new Date());
  const [y, m, d] = bs.split('-');
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function bsToAD(bsStr) {
  if (!bsStr) return null;
  const parts = bsStr.split('-');
  if (parts.length !== 3) return null;
  try {
    const adDate = BSToAD({
      year: parseInt(parts[0]),
      month: parseInt(parts[1]),
      day: parseInt(parts[2])
    });
    return adDate;
  } catch {
    return null;
  }
}

export function adToBS(dateOrStr) {
  try {
    const bs = typeof dateOrStr === 'string' ? ADToBS(new Date(dateOrStr)) : ADToBS(dateOrStr);
    const [y, m, d] = bs.split('-');
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export function bsToObject(bsStr) {
  if (!bsStr) return { year: 0, month: 0, day: 0 };
  const parts = bsStr.split('-');
  return { year: parseInt(parts[0]) || 0, month: parseInt(parts[1]) || 0, day: parseInt(parts[2]) || 0 };
}

export function bsToString(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getDaysInBSMonth(year, month) {
  if (month < 1 || month > 12) return 30;
  try {
    const firstDay = BSToAD({ year, month, day: 1 });
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const firstOfNext = BSToAD({ year: nextYear, month: nextMonth, day: 1 });
    return Math.round((firstOfNext - firstDay) / (1000 * 60 * 60 * 24));
  } catch {
    return 30;
  }
}

export function formatBSDate(bsStr) {
  if (!bsStr) return '';
  const { year, month, day } = bsToObject(bsStr);
  if (!year) return '';
  return `${BS_MONTHS[(month || 1) - 1]} ${day}, ${year}`;
}

export function formatBSDateNP(bsStr) {
  if (!bsStr) return '';
  const { year, month, day } = bsToObject(bsStr);
  if (!year) return '';
  return `${year} ${BS_MONTHS_NP[(month || 1) - 1]} ${day}`;
}

export { BS_MONTHS, BS_MONTHS_NP };
