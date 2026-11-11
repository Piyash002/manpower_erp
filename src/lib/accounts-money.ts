/**
 * Shared integer-paisa money helpers for the Accounts module.
 * All financial values are stored in integer paisa (1 BDT = 100 paisa).
 * Zero floating-point arithmetic on balances or journal totals.
 */

export function takaToPaisa(taka: number | string | null | undefined): number {
  if (taka === null || taka === undefined || taka === '') return 0;
  const num = typeof taka === 'string' ? Number(taka.replace(/,/g, '').trim()) : Number(taka);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function paisaToTaka(paisa: number | null | undefined): number {
  const p = Number(paisa || 0);
  if (!Number.isFinite(p)) return 0;
  return Math.round(p) / 100;
}

export function assertIntPaisa(val: unknown, label = 'Amount'): number {
  const n = Number(val);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${label} must be an integer value in paisa.`);
  }
  return n;
}

export function sumPaisa(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of values) {
    total += Math.round(Number(v || 0));
  }
  return total;
}

/**
 * Formats integer paisa as BDT with Indian/Bangladeshi comma grouping (e.g. 1,50,000.00).
 */
export function formatPaisaBDT(
  paisa: number | null | undefined,
  options: { showDecimals?: boolean; showSymbol?: boolean } = {}
): string {
  const { showDecimals = true, showSymbol = true } = options;
  const safePaisa = Math.round(Number(paisa || 0));
  const isNeg = safePaisa < 0;
  const absPaisa = Math.abs(safePaisa);
  const whole = Math.floor(absPaisa / 100);
  const dec = absPaisa % 100;

  const wholeStr = String(whole);
  let last3 = wholeStr.slice(-3);
  const rest = wholeStr.slice(0, -3);
  if (rest) last3 = ',' + last3;
  const groupedWhole = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')}${last3}`;

  const decStr = showDecimals || dec !== 0 ? `.${String(dec).padStart(2, '0')}` : '';
  const symbol = showSymbol ? '৳' : '';
  return `${isNeg ? '-' : ''}${symbol}${groupedWhole}${decStr}`;
}

