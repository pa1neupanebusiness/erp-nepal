import { ADToBS } from 'bikram-sambat-js';

const NEPALI_MONTHS = ['Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra', 'Baishakh', 'Jestha', 'Ashadh'];

export function toBS(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const bs = ADToBS(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  if (!bs) return '';
  const [y, m, day] = bs.split('-');
  const monthIndex = parseInt(m, 10) - 1;
  const monthName = NEPALI_MONTHS[monthIndex] || m;
  return `${monthName} ${parseInt(day, 10)}, ${y}`;
}
