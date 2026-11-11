import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { Student } from '@/models/Student';
import { JournalEntry } from '@/models/JournalEntry';
import {
  ACCOUNTS_READ_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { createStudentFeePlanOnAdmission } from '@/lib/accounts/fees';

const assignPlanSchema = z.object({
  studentId: z.string().trim().min(1, 'studentId is required'),
  templateId: z.string().trim().min(1, 'templateId is required'),
  branch: z.string().trim().default('Main'),
  department: z.string().trim().default('Counseling'),
  admissionDate: z.string().trim().optional(),
  discountTaka: z.number().min(0).optional(),
  discountReason: z.string().trim().max(300).optional(),
});

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    void Student;
    void JournalEntry;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const status = searchParams.get('status') || 'all';

    const filter: Record<string, any> = { isDeleted: { $ne: true } };
    if (status !== 'all') filter.status = status;

    let plans = await StudentFeePlan.find(filter)
      .populate(
        'studentId',
        'student_no name phone mobile passport_no batch trade trade_name country_of_interest destination_country'
      )
      .populate('invoiceJournalEntryId', 'voucherNo status entryDate')
      .sort({ createdAt: -1 })
      .lean();

    if (search) {
      plans = plans.filter((p: any) => {
        const stName = String(p.studentId?.name || '').toLowerCase();
        const stNo = String(p.studentId?.student_no || p.studentNo || '').toLowerCase();
        const planNo = String(p.planNo || '').toLowerCase();
        return stName.includes(search) || stNo.includes(search) || planNo.includes(search);
      });
    }

    return NextResponse.json({ success: true, data: plans });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load student fee plans' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const raw = await req.json();
    const parsed = assignPlanSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid fee plan payload');
    }

    const d = parsed.data;
    const res = await createStudentFeePlanOnAdmission({
      studentId: d.studentId,
      templateId: d.templateId,
      branch: d.branch,
      department: d.department,
      admissionDate: d.admissionDate,
      discountTaka: d.discountTaka,
      discountReason: d.discountReason,
      user: auth.user,
    });

    if (res.duplicate) {
      return NextResponse.json(
        { success: false, message: 'Student already has an active Fee Plan in Accounts.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: res.plan,
        message: `Fee Plan ${res.plan?.planNo} assigned and posted (${res.entry?.voucherNo}).`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return badRequestResponse(error.message || 'Failed to assign fee plan');
  }
}

