const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return TENS[ten] + (one ? ' ' + ONES[one] : '');
}

function threeDigits(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (hundred) out += ONES[hundred] + ' Hundred';
  if (rest) out += (out ? ' ' : '') + twoDigits(rest);
  return out;
}

export function numberToWords(num) {
  const value = Math.round((Number(num) || 0) * 100) / 100;
  const rupees = Math.floor(value);
  const paisa = Math.round((value - rupees) * 100);

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  let words = '';
  if (crore) words += twoDigits(crore) + ' Crore';
  if (lakh) words += (words ? ' ' : '') + twoDigits(lakh) + ' Lakh';
  if (thousand) words += (words ? ' ' : '') + twoDigits(thousand) + ' Thousand';
  if (rest) words += (words ? ' ' : '') + threeDigits(rest);
  if (!words) words = 'Zero';

  let out = words + ' Rupees';
  if (paisa) out += ' and ' + twoDigits(paisa) + ' Paisa';
  return out + ' Only';
}
