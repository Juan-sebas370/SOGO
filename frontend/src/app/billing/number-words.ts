// Valor en letras para la factura: 2606850 → "Dos millones seiscientos seis mil ochocientos cincuenta pesos M/CTE."

const UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function below1000(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const tail = rest < 30 ? UNITS[rest] : TENS[Math.floor(rest / 10)] + (rest % 10 ? ' y ' + UNITS[rest % 10] : '');
  return [HUNDREDS[h], tail].filter(Boolean).join(' ');
}

/** "uno" pasa a "un" delante de mil / millones ("veintiún mil", "un millón"). */
const apocope = (s: string) => s.replace(/veintiuno$/, 'veintiún').replace(/(^| )uno$/, '$1un');

function toWords(n: number): string {
  if (n === 0) return 'cero';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const units = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'un millón' : `${apocope(toWords(millions))} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${apocope(below1000(thousands))} mil`);
  if (units) parts.push(below1000(units));
  return parts.join(' ');
}

export function amountInWords(value: number): string {
  const n = Math.round(value);
  const words = apocope(toWords(n));   // "... uno pesos" → "... un pesos"
  // "un millón de pesos" / "dos millones de pesos" cuando no hay miles ni unidades
  const de = n >= 1_000_000 && n % 1_000_000 === 0 ? ' de' : '';
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}${de} pesos M/CTE.`;
}
