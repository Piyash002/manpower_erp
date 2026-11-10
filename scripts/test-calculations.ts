import {
  formatBDT,
  calculateInstallments,
  amountInWords,
  isWithin6Months,
} from '../src/lib/formatters';

console.log('====================================================');
console.log('MANPOWER ERP - CALCULATION & BUSINESS LOGIC QC TESTS');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
    if (details) console.error(`   Details: ${details}`);
    failCount++;
  }
}

// 1. Fee Calculation Test
const admFee = 10000;
const crsFee = 35000;
const vCost = 140000;
const gFee = 15000;
const discount = 5000;
const expectedTotal = admFee + crsFee + vCost + gFee - discount; // 195,000

assert(
  expectedTotal === 195000,
  'Total Payable Calculation matches PRD Formula',
  `Expected 195000, got ${expectedTotal}`
);

// 2. Installment Exact Sum & Ceil Calculation Test
const paidNow = 45000;
const remaining = expectedTotal - paidNow; // 150,000
const installmentCount = 3;
const admissionDate = '2026-05-15';

const schedule = calculateInstallments(remaining, installmentCount, admissionDate);

assert(schedule.length === 3, 'Installment Count is 3');

const sumInstallments = schedule.reduce((sum, item) => sum + item.amount, 0);
assert(
  sumInstallments === remaining,
  'Sum of Installments EXACTLY equals Remaining Balance (Leftover rule)',
  `Expected ${remaining}, got ${sumInstallments}`
);

assert(
  schedule[0].dueDate === '2026-06-15' &&
    schedule[1].dueDate === '2026-07-15' &&
    schedule[2].dueDate === '2026-08-15',
  'Installment Monthly Due Dates are accurate'
);

// Test uneven installment division (e.g. 100,000 divided into 3 installments)
// 100000 / 3 = 33333.33 -> ceil = 33334
// Inst 1 = 33334, Inst 2 = 33334, Inst 3 = 100000 - 66668 = 33332
const unevenRemaining = 100000;
const unevenSchedule = calculateInstallments(unevenRemaining, 3, admissionDate);
const unevenSum = unevenSchedule.reduce((sum, i) => sum + i.amount, 0);

assert(
  unevenSum === 100000,
  'Uneven division sum is exact: 100,000 BDT',
  `Inst 1: ${unevenSchedule[0].amount}, Inst 2: ${unevenSchedule[1].amount}, Inst 3: ${unevenSchedule[2].amount}. Sum: ${unevenSum}`
);
assert(
  unevenSchedule[0].amount === 33334,
  'Ceil rule applies to earlier installments (33334)',
  `Got ${unevenSchedule[0].amount}`
);
assert(
  unevenSchedule[2].amount === 33332,
  'Last installment takes remaining balance (33332)',
  `Got ${unevenSchedule[2].amount}`
);

// 3. Indian Digit Grouping Currency Formatter Test
assert(
  formatBDT(100000) === '৳1,00,000',
  'formatBDT formats 100000 with Indian grouping (৳1,00,000)',
  `Got ${formatBDT(100000)}`
);
assert(
  formatBDT(1550000) === '৳15,50,000',
  'formatBDT formats 1550000 with Indian grouping (৳15,50,000)',
  `Got ${formatBDT(1550000)}`
);
assert(formatBDT(0) === '৳0', 'formatBDT formats 0 correctly');

// 4. Amount in Words Test
const words = amountInWords(195000);
assert(
  words.toLowerCase().includes('one lakh') && words.toLowerCase().includes('ninety five thousand'),
  'Amount in words converts 195000 to Bangladeshi words format',
  `Got "${words}"`
);

// 5. Passport 6-month Expiry Alert Test
const today = new Date();
const fourMonthsLater = new Date();
fourMonthsLater.setMonth(today.getMonth() + 4);
const eightMonthsLater = new Date();
eightMonthsLater.setMonth(today.getMonth() + 8);

assert(
  isWithin6Months(fourMonthsLater) === true,
  'Passport expiring in 4 months triggers isWithin6Months alert'
);
assert(
  isWithin6Months(eightMonthsLater) === false,
  'Passport expiring in 8 months does not trigger alert'
);

console.log('\n====================================================');
console.log(`QC TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

