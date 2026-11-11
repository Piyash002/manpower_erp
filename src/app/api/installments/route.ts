import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { Student } from '@/models/Student';
import { paisaToTaka } from '@/lib/accounts-money';

export const dynamic = 'force-dynamic';

/**
 * Read-only legacy compatibility endpoint sourced strictly from Accounts StudentFeePlan stages.
 * Never mutates or inserts legacy Installment documents.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    void Student;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const statusFilter = searchParams.get('status')?.trim() || 'all';
    const timeframe = searchParams.get('timeframe')?.trim() || 'all';
    const batchFilter = searchParams.get('batch')?.trim() || 'all';
    const tradeFilter = searchParams.get('trade')?.trim() || 'all';
    const monthFilter = searchParams.get('month')?.trim() || 'all';
    const sortBy = searchParams.get('sort')?.trim() || 'due_asc';

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    let studentIdFilter: any = null;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const matchingStudents = await Student.find({
        $or: [
          { name: searchRegex },
          { student_no: searchRegex },
          { mobile: searchRegex },
          { passport_no: searchRegex },
          { batch: searchRegex },
          { trade_name: searchRegex },
        ],
      }).select('_id');
      studentIdFilter = { $in: matchingStudents.map((s) => s._id) };
    }

    const planQuery: any = { isDeleted: { $ne: true } };
    if (studentIdFilter) planQuery.studentId = studentIdFilter;

    const plans = await StudentFeePlan.find(planQuery)
      .populate({
        path: 'studentId',
        select:
          'name student_no mobile passport_no trade_name batch destination_country total_paid total_due fee_snapshot status',
      })
      .lean();

    let totalOutstandingDue = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let dueThisMonthCount = 0;
    let dueThisMonthAmount = 0;
    let paidCount = 0;
    let paidAmount = 0;

    const batchSet = new Set<string>();
    const tradeSet = new Set<string>();
    const monthSet = new Set<string>();

    const formattedList: any[] = [];
    for (const plan of plans as any[]) {
      const stDoc = plan.studentId;
      if (!stDoc) continue;
      if (stDoc.batch) batchSet.add(stDoc.batch);
      if (stDoc.trade_name) tradeSet.add(stDoc.trade_name);

      const netPayableTaka = paisaToTaka(plan.netPayablePaisa || 0);
      const totalPaidTaka = paisaToTaka(Math.max(0, (plan.totalPaidPaisa || 0) - (plan.totalRefundedPaisa || 0)));
      const totalDueTaka = paisaToTaka(plan.totalDuePaisa || 0);

      for (const st of plan.stages || []) {
        const dueDate = new Date(st.dueDate);
        const amountTaka = paisaToTaka(st.amountPaisa || 0);
        const paidTaka = paisaToTaka(st.paidPaisa || 0);
        const rawRemaining = Math.max(0, amountTaka - paidTaka);
        const isPaid = st.status === 'Paid' || rawRemaining === 0 || totalDueTaka <= 0;
        const remainingDue = isPaid ? 0 : rawRemaining;
        const isOverdue = !isPaid && dueDate < startOfToday;
        const isDueThisMonth = !isPaid && dueDate >= startOfMonth && dueDate <= endOfMonth;

        if (!isNaN(dueDate.getTime())) {
          const ym = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
          monthSet.add(ym);
        }

        let effectiveStatus: 'Paid' | 'Partial' | 'Pending' | 'Overdue' = st.status;
        if (isPaid) effectiveStatus = 'Paid';
        else if (isOverdue) effectiveStatus = 'Overdue';
        else if (paidTaka > 0) effectiveStatus = 'Partial';
        else effectiveStatus = 'Pending';

        if (!isPaid) totalOutstandingDue += remainingDue;
        if (isOverdue) {
          overdueCount++;
          overdueAmount += remainingDue;
        }
        if (isDueThisMonth) {
          dueThisMonthCount++;
          dueThisMonthAmount += remainingDue;
        }
        if (isPaid) {
          paidCount++;
          paidAmount += amountTaka;
        }

        formattedList.push({
          _id: `${plan._id.toString()}-${st.stageNo}`,
          student: {
            _id: stDoc._id.toString(),
            name: stDoc.name,
            student_no: stDoc.student_no,
            mobile: stDoc.mobile,
            passport_no: stDoc.passport_no,
            trade_name: stDoc.trade_name,
            batch: stDoc.batch || '',
            destination_country: stDoc.destination_country,
            total_payable: netPayableTaka,
            total_paid: totalPaidTaka,
            total_due: totalDueTaka,
            status: stDoc.status,
          },
          installment_no: st.stageNo,
          due_date: st.dueDate,
          amount: amountTaka,
          paid_amount: paidTaka,
          remaining_due: remainingDue,
          paid_on: st.paidAt || null,
          status: effectiveStatus,
          isOverdue,
          isDueThisMonth,
        });
      }
    }

    // 4. Apply status, timeframe, month, batch, and trade filters
    let filteredList = formattedList;

    if (statusFilter !== 'all') {
      if (statusFilter.toLowerCase() === 'overdue') {
        filteredList = filteredList.filter((item) => item.status === 'Overdue');
      } else if (statusFilter.toLowerCase() === 'pending') {
        filteredList = filteredList.filter((item) => item.status === 'Pending');
      } else if (statusFilter.toLowerCase() === 'partial') {
        filteredList = filteredList.filter((item) => item.status === 'Partial');
      } else if (statusFilter.toLowerCase() === 'unpaid') {
        filteredList = filteredList.filter((item) => item.status !== 'Paid');
      } else if (statusFilter.toLowerCase() === 'paid') {
        filteredList = filteredList.filter((item) => item.status === 'Paid');
      }
    }

    if (timeframe !== 'all' && monthFilter === 'all') {
      if (timeframe === 'overdue') {
        filteredList = filteredList.filter((item) => item.isOverdue);
      } else if (timeframe === 'due_this_month') {
        filteredList = filteredList.filter((item) => item.isDueThisMonth);
      } else if (timeframe === 'due_next_30') {
        filteredList = filteredList.filter(
          (item) => item.status !== 'Paid' && new Date(item.due_date) <= in30Days
        );
      }
    }

    if (monthFilter && monthFilter !== 'all') {
      if (monthFilter === 'this_month') {
        filteredList = filteredList.filter((item) => {
          const d = new Date(item.due_date);
          return d >= startOfMonth && d <= endOfMonth;
        });
      } else {
        // Expects YYYY-MM
        filteredList = filteredList.filter((item) => {
          const d = new Date(item.due_date);
          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return ym === monthFilter;
        });
      }
    }

    if (batchFilter && batchFilter !== 'all') {
      filteredList = filteredList.filter((item) => item.student.batch === batchFilter);
    }

    if (tradeFilter && tradeFilter !== 'all') {
      filteredList = filteredList.filter((item) => item.student.trade_name === tradeFilter);
    }

    // 5. Sort filtered list with deterministic tie-breakers
    filteredList.sort((a, b) => {
      const timeA = new Date(a.due_date).getTime();
      const timeB = new Date(b.due_date).getTime();

      if (sortBy === 'due_desc') {
        return (
          timeB - timeA ||
          b.installment_no - a.installment_no ||
          a.student.student_no.localeCompare(b.student.student_no)
        );
      }
      if (sortBy === 'amount_desc') {
        return (
          b.remaining_due - a.remaining_due ||
          b.amount - a.amount ||
          timeA - timeB ||
          a.student.student_no.localeCompare(b.student.student_no)
        );
      }
      if (sortBy === 'total_due_desc') {
        return (
          b.student.total_due - a.student.total_due ||
          b.remaining_due - a.remaining_due ||
          timeA - timeB
        );
      }
      if (sortBy === 'batch_asc') {
        const cmp = (a.student.batch || 'ZZZ').localeCompare(b.student.batch || 'ZZZ');
        return cmp !== 0 ? cmp : timeA - timeB || a.installment_no - b.installment_no;
      }
      if (sortBy === 'trade_asc') {
        const cmp = (a.student.trade_name || 'ZZZ').localeCompare(b.student.trade_name || 'ZZZ');
        return cmp !== 0 ? cmp : timeA - timeB || a.installment_no - b.installment_no;
      }
      // Default: 'due_asc' (nearest due date first)
      return (
        timeA - timeB ||
        a.installment_no - b.installment_no ||
        a.student.student_no.localeCompare(b.student.student_no)
      );
    });

    const filteredDueAmount = filteredList.reduce(
      (sum, item) => sum + (item.status !== 'Paid' ? item.remaining_due : 0),
      0
    );

    return NextResponse.json({
      success: true,
      stats: {
        totalOutstandingDue,
        overdueCount,
        overdueAmount,
        dueThisMonthCount,
        dueThisMonthAmount,
        paidCount,
        paidAmount,
        totalInstallments: formattedList.length,
        filteredDueAmount,
        filteredCount: filteredList.length,
      },
      facets: {
        batches: Array.from(batchSet).sort(),
        trades: Array.from(tradeSet).sort(),
        months: Array.from(monthSet).sort(),
      },
      installments: filteredList,
    });
  } catch (error: any) {
    console.error('Error fetching installments:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch installments' },
      { status: 500 }
    );
  }
}

