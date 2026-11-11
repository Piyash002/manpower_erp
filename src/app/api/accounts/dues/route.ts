import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { Student } from '@/models/Student';
import { ACCOUNTS_READ_ROLES, requireAccountsAuth } from '@/lib/accounts-auth';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { paisaToTaka } from '@/lib/accounts-money';
import { buildXlsxBuffer } from '@/lib/export-utils';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    void Student;

    const plans = await StudentFeePlan.find({
      isDeleted: { $ne: true },
      totalDuePaisa: { $gt: 0 },
    })
      .populate(
        'studentId',
        'student_no name phone mobile trade trade_name country_of_interest destination_country'
      )
      .sort({ totalDuePaisa: -1 })
      .lean();

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const buckets = {
      currentPaisa: 0,
      days1to30Paisa: 0,
      days31to60Paisa: 0,
      days61to90Paisa: 0,
      over90Paisa: 0,
    };

    const items = plans.map((plan: any) => {
      let maxOverdueDays = 0;
      const openStages = (plan.stages || []).filter(
        (s: any) => (s.amountPaisa || 0) - (s.paidPaisa || 0) > 0
      );

      for (const st of openStages) {
        const rem = (st.amountPaisa || 0) - (st.paidPaisa || 0);
        const due = new Date(st.dueDate);
        const diffDays = Math.floor((todayStart.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) buckets.currentPaisa += rem;
        else {
          maxOverdueDays = Math.max(maxOverdueDays, diffDays);
          if (diffDays <= 30) buckets.days1to30Paisa += rem;
          else if (diffDays <= 60) buckets.days31to60Paisa += rem;
          else if (diffDays <= 90) buckets.days61to90Paisa += rem;
          else buckets.over90Paisa += rem;
        }
      }

      return {
        _id: plan._id,
        planNo: plan.planNo,
        student: plan.studentId,
        netPayablePaisa: plan.netPayablePaisa,
        totalPaidPaisa: plan.totalPaidPaisa,
        totalDuePaisa: plan.totalDuePaisa,
        maxOverdueDays,
        openStages,
      };
    });

    const { searchParams } = new URL(req.url);
    const exportFmt = searchParams.get('export');
    if (exportFmt === 'csv' || exportFmt === 'xlsx') {
      const headers = [
        'Plan No',
        'Student No',
        'Student Name',
        'Phone',
        'Trade',
        'Country',
        'Net Payable (BDT)',
        'Total Paid (BDT)',
        'Due Balance (BDT)',
        'Max Overdue Days',
        'Next Open Stage',
      ];
      const rows = items.map((it: any) => [
        it.planNo,
        it.student?.student_no || '',
        it.student?.name || '',
        it.student?.phone || it.student?.mobile || '',
        it.student?.trade || it.student?.trade_name || '',
        it.student?.country_of_interest || it.student?.destination_country || '',
        paisaToTaka(it.netPayablePaisa),
        paisaToTaka(it.totalPaidPaisa),
        paisaToTaka(it.totalDuePaisa),
        it.maxOverdueDays,
        it.openStages?.[0]?.label || '',
      ]);

      if (exportFmt === 'xlsx') {
        const buf = buildXlsxBuffer('Due & Aging', headers, rows);
        return new NextResponse(new Uint8Array(buf), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="Accounts-Due-Aging.xlsx"',
          },
        });
      }

      const csvEscape = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="Accounts-Due-Aging.csv"',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { buckets, items },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to calculate due & aging' },
      { status: 500 }
    );
  }
}

