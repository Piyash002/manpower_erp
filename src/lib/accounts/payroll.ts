import mongoose from 'mongoose';
import { PayslipBatch } from '@/models/PayslipBatch';
import { Payslip } from '@/models/Payslip';
import { Employee, PaymentMethodType } from '@/models/Employee';
import { Account } from '@/models/Account';
import { JournalEntry } from '@/models/JournalEntry';
import { AuditLog } from '@/models/AuditLog';
import { connectDB } from '@/lib/db';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { takaToPaisa } from '@/lib/accounts-money';
import {
  getSystemAccountId,
  postTransactionEntry,
  resolveDepositSystemTag,
  reverseJournalEntry,
  runInTransaction,
  type JournalLineInput,
} from '@/lib/accounts/posting';

function defaultAccrualDate(year: number, month: number): Date {
  // Last calendar day of the payroll month at 12:00 UTC
  return new Date(Date.UTC(year, month, 0, 12, 0, 0, 0));
}

function mapPayrollMethodToSystemTag(method: string): string {
  const m = String(method || '').trim().toLowerCase();
  if (m === 'bank') return 'BANK_MAIN';
  return resolveDepositSystemTag(method);
}

/**
 * Posts Salary Expense (5210) Dr / Salary Payable (2110) Cr on Payroll Run Confirm.
 * Idempotent per PayslipBatch ID so duplicate confirms never double-post.
 */
export async function postPayrollConfirmAccrual(params: {
  runId: string;
  entryDate?: Date | string;
  session?: mongoose.ClientSession;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  await ensureAccountsSeeded();
  void Employee;

  const batch = await PayslipBatch.findById(params.runId).session(params.session || null);
  if (!batch) {
    throw new Error('Payroll run not found.');
  }
  if (batch.is_reversal) {
    return { entry: null, duplicate: false, skipped: true };
  }

  const slips = await Payslip.find({
    batch_id: batch._id,
    is_reversal: { $ne: true },
    status: { $nin: ['Cancelled', 'Reversed'] },
  })
    .populate('employee_id', 'employee_id firstName lastName department')
    .session(params.session || null)
    .lean();

  const payableSlips = slips.filter((s: any) => Number(s.net_pay || 0) > 0);
  const salExpAccId = await getSystemAccountId('SALARY_EXPENSE');
  const salPayAccId = await getSystemAccountId('SALARY_PAYABLE');
  const branch = batch.branch || 'Main';
  const entryDate = params.entryDate
    ? new Date(params.entryDate)
    : defaultAccrualDate(batch.year, batch.month);

  const lines: JournalLineInput[] = [];
  if (payableSlips.length > 0) {
    for (const s of payableSlips as any[]) {
      const emp = s.employee_id || {};
      const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.employee_id || 'Employee';
      const dept = emp.department || batch.department || 'General';
      const amountPaisa = takaToPaisa(s.net_pay);
      if (amountPaisa <= 0) continue;

      lines.push({
        accountId: salExpAccId,
        description: `Salary expense ${s.payslip_no} (${empName})`,
        debitPaisa: amountPaisa,
        creditPaisa: 0,
        branch: s.branch || branch,
        department: dept,
        employeeId: emp._id ? emp._id.toString() : String(s.employee_id),
      });
      lines.push({
        accountId: salPayAccId,
        description: `Salary payable ${s.payslip_no} (${empName})`,
        debitPaisa: 0,
        creditPaisa: amountPaisa,
        branch: s.branch || branch,
        department: dept,
        employeeId: emp._id ? emp._id.toString() : String(s.employee_id),
      });
    }
  } else if (Number(batch.total_net_pay || 0) > 0) {
    const batchNetPaisa = takaToPaisa(batch.total_net_pay);
    const dept = batch.department && batch.department !== 'all' ? batch.department : 'HRM';
    lines.push({
      accountId: salExpAccId,
      description: `Salary expense batch ${batch.batch_code} (${batch.payslip_count || 0} employees)`,
      debitPaisa: batchNetPaisa,
      creditPaisa: 0,
      branch,
      department: dept,
    });
    lines.push({
      accountId: salPayAccId,
      description: `Salary payable batch ${batch.batch_code}`,
      debitPaisa: 0,
      creditPaisa: batchNetPaisa,
      branch,
      department: dept,
    });
  }

  if (lines.length === 0) {
    return { entry: null, duplicate: false, skipped: true };
  }

  const posted = await postTransactionEntry({
    journalType: 'JV',
    entryDate,
    description: `Payroll accrual for ${batch.name} (${batch.batch_code})`,
    reference: batch.batch_code,
    sourceModule: 'PAYROLL_CONFIRM',
    sourceId: batch._id.toString(),
    idempotencyKey: `PAYROLL_CONFIRM:${batch._id.toString()}`,
    lines,
    session: params.session,
    user: params.user,
  });

  return { entry: posted.entry, duplicate: posted.duplicate, skipped: false };
}

/**
 * Reverses the Posted PAYROLL_CONFIRM JournalEntry when a Confirmed Payroll Run is reversed in HRM.
 */
export async function reversePayrollConfirmAccrual(params: {
  runId: string;
  reason: string;
  reversalDate?: Date | string;
  session?: mongoose.ClientSession;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  const orig = await JournalEntry.findOne({
    sourceModule: 'PAYROLL_CONFIRM',
    sourceId: params.runId,
    status: 'Posted',
    isDeleted: { $ne: true },
  }).session(params.session || null);

  if (!orig) {
    return null;
  }

  return reverseJournalEntry({
    entryId: orig._id.toString(),
    reason: `Payroll run reversed: ${params.reason}`,
    reversalDate: params.reversalDate || orig.entryDate,
    session: params.session,
    user: params.user,
  });
}

/**
 * Authoritative Salary Disbursement executed from Accounts (/accounts/payroll).
 * Posts Payment Voucher (PV): Salary Payable (2110) Dr / Bank-Cash-Wallet Cr
 * and atomically updates HRM PayslipBatch + Payslips to Paid.
 */
export async function disbursePayrollRun(params: {
  runId: string;
  method: PaymentMethodType;
  payoutAccountId?: string;
  paymentDate?: Date | string;
  paymentReference: string;
  note?: string;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  await ensureAccountsSeeded();
  void Employee;

  const ref = String(params.paymentReference || '').trim();
  if (!ref) {
    throw new Error('Payment reference (bank advice / transaction ID) is required.');
  }
  const pDate = params.paymentDate ? new Date(params.paymentDate) : new Date();
  if (Number.isNaN(pDate.getTime())) {
    throw new Error('Invalid disbursement payment date.');
  }
  const actor = params.user?.name || params.user?.username || 'System';

  return runInTransaction(async (session) => {
    const batch = await PayslipBatch.findById(params.runId).session(session);
    if (!batch) {
      throw new Error('Payroll run not found.');
    }
    if (batch.status !== 'Confirmed') {
      throw new Error(
        `Only Confirmed payroll runs can be disbursed (current status: ${batch.status}).`
      );
    }

    // Ensure accrual JV exists (safety guard for runs confirmed prior to Phase C)
    const existingAccrual = await JournalEntry.findOne({
      sourceModule: 'PAYROLL_CONFIRM',
      sourceId: batch._id.toString(),
      status: 'Posted',
      isDeleted: { $ne: true },
    }).session(session);

    let accrualEntry = existingAccrual;
    if (!accrualEntry) {
      const accrued = await postPayrollConfirmAccrual({
        runId: batch._id.toString(),
        session,
        user: params.user,
      });
      accrualEntry = accrued.entry as any;
    }

    const slips = await Payslip.find({
      batch_id: batch._id,
      status: 'Confirmed',
      is_reversal: { $ne: true },
    })
      .populate('employee_id', 'employee_id firstName lastName department')
      .session(session)
      .lean();

    const payableSlips = slips.filter((s: any) => Number(s.net_pay || 0) > 0);
    const salPayAccId = await getSystemAccountId('SALARY_PAYABLE');
    let payoutAccId = '';
    if (params.payoutAccountId) {
      const customAcc = await Account.findOne({
        _id: params.payoutAccountId,
        isDeleted: { $ne: true },
        active: true,
        isGroup: false,
      })
        .session(session)
        .lean();
      if (!customAcc || customAcc.type !== 'Asset') {
        throw new Error('Selected payout account must be an active Cash/Bank Asset ledger account.');
      }
      payoutAccId = customAcc._id.toString();
    } else {
      payoutAccId = await getSystemAccountId(mapPayrollMethodToSystemTag(params.method));
    }
    const branch = batch.branch || 'Main';

    const lines: JournalLineInput[] = [];
    let totalDisbursedPaisa = 0;

    if (payableSlips.length > 0) {
      for (const s of payableSlips as any[]) {
        const emp = s.employee_id || {};
        const empName =
          `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.employee_id || 'Employee';
        const dept = emp.department || batch.department || 'General';
        const amountPaisa = takaToPaisa(s.net_pay);
        if (amountPaisa <= 0) continue;

        totalDisbursedPaisa += amountPaisa;
        lines.push({
          accountId: salPayAccId,
          description: `Salary payout ${s.payslip_no} (${empName})`,
          debitPaisa: amountPaisa,
          creditPaisa: 0,
          branch: s.branch || branch,
          department: dept,
          employeeId: emp._id ? emp._id.toString() : String(s.employee_id),
        });
      }
    } else if (Number(batch.total_net_pay || 0) > 0) {
      totalDisbursedPaisa = takaToPaisa(batch.total_net_pay);
      lines.push({
        accountId: salPayAccId,
        description: `Salary payout batch ${batch.batch_code}`,
        debitPaisa: totalDisbursedPaisa,
        creditPaisa: 0,
        branch,
        department: batch.department && batch.department !== 'all' ? batch.department : 'HRM',
      });
    } else {
      throw new Error('No confirmed payable payslips or net payable balance found in this payroll run.');
    }

    lines.push({
      accountId: payoutAccId,
      description: `Salary disbursement ${batch.batch_code} via ${params.method} (Ref: ${ref})${
        params.note ? ` - ${params.note}` : ''
      }`,
      debitPaisa: 0,
      creditPaisa: totalDisbursedPaisa,
      branch,
      department: batch.department && batch.department !== 'all' ? batch.department : 'HRM',
    });

    const { entry: payEntry } = await postTransactionEntry({
      journalType: 'PV',
      entryDate: pDate,
      description: `Salary disbursement for ${batch.name} (${batch.batch_code}) via ${params.method}`,
      reference: ref,
      sourceModule: 'PAYROLL_PAY',
      sourceId: batch._id.toString(),
      idempotencyKey: `PAYROLL_PAY:${batch._id.toString()}`,
      lines,
      session,
      user: params.user,
    });

    const now = new Date();
    const updRes = await Payslip.updateMany(
      { batch_id: batch._id, status: 'Confirmed', is_reversal: { $ne: true } },
      {
        $set: {
          status: 'Paid',
          payment_method: params.method,
          payment_date: pDate,
          payment_reference: ref,
          paid_by: actor,
          paid_at: now,
        },
      },
      { session }
    );

    batch.status = 'Paid';
    batch.payment_method = params.method;
    batch.payment_date = pDate;
    batch.payment_reference = ref;
    batch.paid_by = actor;
    batch.paid_at = now;
    await batch.save({ session });

    await AuditLog.create(
      [
        {
          userId: params.user?.userId || 'system',
          userName: actor,
          userRole: params.user?.role || 'System',
          action: 'ACCOUNTS_PAYROLL_DISBURSED',
          entity: 'PayslipBatch',
          entityId: batch._id.toString(),
          oldValues: { status: 'Confirmed' },
          newValues: {
            status: 'Paid',
            batch_code: batch.batch_code,
            voucherNo: payEntry.voucherNo,
            accrualVoucherNo: accrualEntry?.voucherNo || null,
            payment_method: params.method,
            payoutAccountId: payoutAccId,
            payment_reference: ref,
            totalDisbursedPaisa,
            payslipsPaid: updRes.modifiedCount,
          },
          timestamp: now,
        },
      ],
      { session }
    );

    return {
      batch,
      payEntry,
      accrualEntry,
      payslipsPaid: updRes.modifiedCount,
      totalDisbursedPaisa,
    };
  });
}

