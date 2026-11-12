import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { PayslipBatch } from '@/models/PayslipBatch';
import { Payslip } from '@/models/Payslip';
import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { JournalEntry } from '@/models/JournalEntry';
import {
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { disbursePayrollRun, postPayrollConfirmAccrual } from '@/lib/accounts/payroll';

const disburseSchema = z.object({
  runId: z.string().trim().min(1, 'runId is required'),
  method: z.enum(['Bank', 'bKash', 'Nagad', 'Cash']),
  payoutAccountId: z.string().trim().optional(),
  paymentDate: z.string().trim().optional(),
  paymentReference: z.string().trim().min(2, 'Payment reference / bank advice # is required').max(120),
  note: z.string().trim().max(300).optional(),
});

export async function GET(req: NextRequest) {
  // HR is allowed to inspect read-only payroll payment status here
  const auth = requireAccountsAuth(req, ['Admin', 'Accountant', 'Viewer', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();

    const runs = await PayslipBatch.find({
      is_reversal: { $ne: true },
      status: { $in: ['Confirmed', 'Paid'] },
    })
      .sort({ year: -1, month: -1, createdAt: -1 })
      .lean();

    const runIds = runs.map((r: any) => r._id.toString());
    const [entries, payslips] = await Promise.all([
      JournalEntry.find({
        sourceModule: { $in: ['PAYROLL_CONFIRM', 'PAYROLL_PAY'] },
        sourceId: { $in: runIds },
        isDeleted: { $ne: true },
      })
        .select('voucherNo sourceModule sourceId status entryDate totalDebitPaisa')
        .lean(),
      Payslip.find({
        batch_id: { $in: runs.map((r: any) => r._id) },
        is_reversal: { $ne: true },
        status: { $nin: ['Cancelled', 'Reversed'] },
      })
        .select('batch_id payslip_no employee_id contract_id net_pay status payment_method payment_reference')
        .populate({
          path: 'employee_id',
          model: Employee,
          select: 'employee_id firstName lastName department payment_method bank_name bank_branch bank_account_no phone',
        })
        .populate({
          path: 'contract_id',
          model: EmployeeContract,
          select: 'bank_name bank_account_no',
        })
        .lean(),
    ]);

    const entryMap = new Map<string, any[]>();
    for (const e of entries) {
      const k = String(e.sourceId);
      if (!entryMap.has(k)) entryMap.set(k, []);
      entryMap.get(k)!.push(e);
    }

    const recipientMap = new Map<string, any[]>();
    for (const p of payslips as any[]) {
      const k = String(p.batch_id);
      const emp = p.employee_id || {};
      const contract = p.contract_id || {};
      const method = p.payment_method || emp.payment_method || 'Bank';
      const isWallet = method === 'bKash' || method === 'Nagad';
      const accountNo =
        String(emp.bank_account_no || '').trim() ||
        String(contract.bank_account_no || '').trim() ||
        (isWallet ? String(emp.phone || '').trim() : '');
      const bankName =
        String(emp.bank_name || '').trim() ||
        String(contract.bank_name || '').trim() ||
        (method === 'Bank' ? '' : method);
      const name =
        `${emp.firstName || ''} ${emp.lastName || ''}`.trim() ||
        emp.employee_id ||
        'Unknown Employee';

      if (!recipientMap.has(k)) recipientMap.set(k, []);
      recipientMap.get(k)!.push({
        payslipId: String(p._id),
        payslipNo: p.payslip_no || '',
        employeeObjId: emp._id ? String(emp._id) : '',
        employeeCode: emp.employee_id || '',
        name,
        department: emp.department || '',
        method,
        bankName,
        bankBranch: String(emp.bank_branch || '').trim(),
        accountNo,
        phone: String(emp.phone || '').trim(),
        netPay: Number(p.net_pay || 0),
        status: p.status || 'Confirmed',
        paymentReference: p.payment_reference || '',
      });
    }

    const enriched = runs.map((r: any) => {
      const idStr = r._id.toString();
      const recipients = recipientMap.get(idStr) || [];
      const missingBankCount = recipients.filter(
        (rec: any) => rec.method !== 'Cash' && !rec.accountNo
      ).length;
      return {
        ...r,
        journalEntries: entryMap.get(idStr) || [],
        recipients,
        missingBankCount,
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch salary disbursements' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const raw = await req.json();
    const parsed = disburseSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid disbursement payload');
    }

    const d = parsed.data;
    const res = await disbursePayrollRun({
      runId: d.runId,
      method: d.method,
      payoutAccountId: d.payoutAccountId,
      paymentDate: d.paymentDate,
      paymentReference: d.paymentReference,
      note: d.note,
      user: auth.user,
    });

    return NextResponse.json({
      success: true,
      data: res,
      message: `Disbursed ${res.batch.batch_code} (${res.payslipsPaid} payslips marked Paid, Voucher ${res.payEntry.voucherNo}).`,
    });
  } catch (error: any) {
    return badRequestResponse(error.message || 'Failed to disburse payroll');
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { runId } = await req.json();
    if (!runId) return badRequestResponse('runId is required');
    const res = await postPayrollConfirmAccrual({ runId, user: auth.user });
    return NextResponse.json({
      success: true,
      data: res,
      message: res.entry
        ? `Posted accrual voucher ${res.entry.voucherNo}.`
        : 'No payable net amount to accrue.',
    });
  } catch (error: any) {
    return badRequestResponse(error.message || 'Failed to sync payroll accrual');
  }
}
