import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { PayslipBatch } from '@/models/PayslipBatch';
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
    const entries = await JournalEntry.find({
      sourceModule: { $in: ['PAYROLL_CONFIRM', 'PAYROLL_PAY'] },
      sourceId: { $in: runIds },
      isDeleted: { $ne: true },
    })
      .select('voucherNo sourceModule sourceId status entryDate totalDebitPaisa')
      .lean();

    const entryMap = new Map<string, any[]>();
    for (const e of entries) {
      const k = String(e.sourceId);
      if (!entryMap.has(k)) entryMap.set(k, []);
      entryMap.get(k)!.push(e);
    }

    const enriched = runs.map((r: any) => ({
      ...r,
      journalEntries: entryMap.get(r._id.toString()) || [],
    }));

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
