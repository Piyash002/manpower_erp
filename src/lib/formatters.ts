/**
 * Formats a number to Bangladeshi Taka (BDT) with Indian digit grouping:
 * 1,00,000 instead of 100,000
 */
export function formatBDT(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '৳0';
  }

  const rounded = Math.round(amount);
  const isNegative = rounded < 0;
  const absAmount = Math.abs(rounded).toString();

  let lastThree = absAmount.substring(absAmount.length - 3);
  const otherNumbers = absAmount.substring(0, absAmount.length - 3);

  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }

  const res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  return `${isNegative ? '-' : ''}৳${res}`;
}

/**
 * Format date to standard readable format (DD MMM YYYY)
 */
export function formatDate(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';

  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  return `${day} ${month} ${year}`;
}

/**
 * Format date as DD-MM-YYYY (Payroll & official tables)
 */
export function formatDateDMY(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Format input date for HTML date input (YYYY-MM-DD)
 */
export function toInputDate(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

/**
 * Check if a date is within 6 months from today (Passport Alert)
 */
export function isWithin6Months(dateInput: Date | string | null | undefined): boolean {
  if (!dateInput) return false;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

  return d >= today && d <= sixMonthsFromNow;
}

/**
 * Check if a date is expired (past today)
 */
export function isExpired(dateInput: Date | string | null | undefined): boolean {
  if (!dateInput) return false;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return d < today;
}

/**
 * Calculate installments according to PRD section 7:
 * - ceil(remaining / n)
 * - last installment takes leftover so sum is exact
 * - due dates: admission date plus 1, 2, ... n months
 */
export interface CalculatedInstallment {
  number: number;
  dueDate: string; // YYYY-MM-DD
  amount: number;
}

export function calculateInstallments(
  remainingAmount: number,
  installmentCount: number,
  admissionDate: string | Date
): CalculatedInstallment[] {
  if (remainingAmount <= 0 || installmentCount <= 0) {
    return [];
  }

  const count = Math.min(Math.max(1, installmentCount), 24);
  const baseAmount = Math.ceil(remainingAmount / count);
  const result: CalculatedInstallment[] = [];

  const baseDate = new Date(admissionDate);
  if (isNaN(baseDate.getTime())) {
    throw new Error('Invalid admission date');
  }

  let accumulated = 0;

  for (let i = 1; i <= count; i++) {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    let amount = baseAmount;
    if (i === count) {
      // Last installment takes leftover so the sum is exact
      amount = remainingAmount - accumulated;
    } else {
      accumulated += amount;
    }

    result.push({
      number: i,
      dueDate: dueDate.toISOString().split('T')[0],
      amount: Math.max(0, amount),
    });
  }

  return result;
}

/**
 * Convert number to words in Bangladeshi Taka
 */
export function amountInWords(num: number): string {
  if (!num || num === 0) return 'Zero Taka Only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertGroup(n: number): string {
    let output = '';
    if (n >= 100) {
      output += a[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      output += b[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      output += a[n] + ' ';
    }
    return output.trim();
  }

  let amount = Math.floor(Math.abs(num));
  let words = '';

  const crore = Math.floor(amount / 10000000);
  amount %= 10000000;
  const lakh = Math.floor(amount / 100000);
  amount %= 100000;
  const thousand = Math.floor(amount / 1000);
  amount %= 1000;
  const remaining = amount;

  if (crore > 0) {
    words += convertGroup(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertGroup(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertGroup(thousand) + ' Thousand ';
  }
  if (remaining > 0) {
    words += convertGroup(remaining) + ' ';
  }

  return `${num < 0 ? 'Minus ' : ''}${words.trim()} Taka Only`;
}

export const EMPLOYEE_DEPARTMENTS = [
  'Visa',
  'Training',
  'Accounts',
  'Agent',
  'Counseling',
  'Administration',
  'Other',
] as const;

export function getTodayDhaka(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatTimeDhaka(val?: string | Date | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDhakaTimeInput(val?: string | Date | null, fallback = ''): string {
  if (!val) return fallback;
  const d = new Date(val);
  if (isNaN(d.getTime())) return fallback;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === 'hour')?.value || '09';
  const mm = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hh === '24' ? '00' : hh}:${mm}`;
}

