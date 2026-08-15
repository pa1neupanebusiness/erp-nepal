// Convert numeric amounts to words in Rupees and Paisa (IRD-compliant invoice wording).

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

function threeDigits(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (hundreds) out += `${ONES[hundreds]} Hundred`;
  if (rest) out += `${out ? ' ' : ''}${twoDigits(rest)}`;
  return out;
}

// Indian numbering system: lakhs & crores (standard for NPR/INR amounts).
function wholeNumberToWords(n) {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

/**
 * Convert a float amount into words: "One Thousand Five Hundred Twenty Rupees and Fifty Paisa Only"
 * @param {number|string} value Amount (supports up to 2 decimals for paisa)
 * @param {object} opts { rupeeLabel, paisaLabel, onlyLabel } customize wording
 */
export function amountToWords(value, opts = {}) {
  const rupeeWord = opts.rupeeLabel || 'Rupees';
  const paisaWord = opts.paisaLabel || 'Paisa';
  const onlyWord = opts.onlyLabel || 'Only';

  const num = Math.abs(Number(value) || 0);
  const rupees = Math.floor(num);
  const paisa = Math.round((num - rupees) * 100);

  const rupWord = wholeNumberToWords(rupees);
  const paiWord = paisa ? wholeNumberToWords(paisa) : '';

  let out = `${rupWord} ${rupeeWord}`;
  if (paiWord) out += ` and ${paiWord} ${paisaWord}`;
  return `${out} ${onlyWord}`;
}

/** Convert to Nepali (Devanagari) digits, e.g. 2082 -> २०८२ */
export function toNepaliDigits(str) {
  const map = { '0': '०', '1': '१', '2': '२', '3': '३', '4': '४', '5': '५', '6': '६', '7': '७', '8': '८', '9': '९' };
  return String(str).replace(/[0-9]/g, d => map[d]);
}

export default amountToWords;
