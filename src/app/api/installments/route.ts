import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Installment } from '@/models/Installment';
import { Student } from '@/models/Student';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const statusFilter = searchParams.get('status')?.trim() || 'all';
    const timeframe = searchParams.get('timeframe')?.trim() || 'all';
    const batchFilter = searchParams.get('batch')?.trim() || 'all';
    const tradeFilter = searchParams.get('trade')?.trim() || 'all';
    const monthFilter = searchParams.get('month')?.trim() || 'all'; // 'all' | 'this_month' | 'YYYY-MM'
    const sortBy = searchParams.get('sort')?.trim() || 'due_asc';

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // 1. If search is provided, find matching student IDs first
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

      const matchedIds = matchingStudents.map((s) => s._id);
      studentIdFilter = { $in: matchedIds };
    }

    // 2. Fetch all installments populated with student details (including batch)
    const installmentQuery: any = {};
    if (studentIdFilter) {
      installmentQuery.student_id = studentIdFilter;
    }

    const rawInstallments = await Installment.find(installmentQuery)
      .populate({
        path: 'student_id',
        select:
          'name student_no mobile passport_no trade_name batch destination_country total_paid total_due fee_snapshot status',
      })
      .sort({ due_date: 1, installment_no: 1 })
      .lean();

    // 3. Filter out orphaned installments and compute metrics + filter facets
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

    const formattedList = rawInstallments
      .filter((inst: any) => inst.student_id)
      .map((inst: any) => {
        const dueDate = new Date(inst.due_date);
        const remainingDue = Math.max(0, (inst.amount || 0) - (inst.paid_amount || 0));
        const isPaid = inst.status === 'Paid' || remainingDue === 0;
        const isOverdue = !isPaid && dueDate < now;
        const isDueThisMonth = !isPaid && dueDate >= startOfMonth && dueDate <= endOfMonth;

        // Collect filter facets
        if (inst.student_id.batch) batchSet.add(inst.student_id.batch);
        if (inst.student_id.trade_name) tradeSet.add(inst.student_id.trade_name);
        if (!isNaN(dueDate.getTime())) {
          const ym = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
          monthSet.add(ym);
        }

        // Effective status
        let effectiveStatus: 'Paid' | 'Partial' | 'Pending' | 'Overdue' = inst.status;
        if (isPaid) {
          effectiveStatus = 'Paid';
        } else if (isOverdue) {
          effectiveStatus = 'Overdue';
        } else if (inst.paid_amount > 0) {
          effectiveStatus = 'Partial';
        } else {
          effectiveStatus = 'Pending';
        }

        // Global stats aggregation
        if (!isPaid) {
          totalOutstandingDue += remainingDue;
        }
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
          paidAmount += inst.amount;
        }

        return {
          _id: inst._id.toString(),
          student: {
            _id: inst.student_id._id.toString(),
            name: inst.student_id.name,
            student_no: inst.student_id.student_no,
            mobile: inst.student_id.mobile,
            passport_no: inst.student_id.passport_no,
            trade_name: inst.student_id.trade_name,
            batch: inst.student_id.batch || '',
            destination_country: inst.student_id.destination_country,
            total_paid: inst.student_id.total_paid,
            total_due: inst.student_id.total_due,
            status: inst.student_id.status,
          },
          installment_no: inst.installment_no,
          due_date: inst.due_date,
          amount: inst.amount,
          paid_amount: inst.paid_amount || 0,
          remaining_due: remainingDue,
          paid_on: inst.paid_on || null,
          status: effectiveStatus,
          isOverdue,
          isDueThisMonth,
        };
      });

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

    if (timeframe !== 'all') {
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

    // 5. Sort filtered list
    filteredList.sort((a, b) => {
      if (sortBy === 'due_desc') {
        return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
      }
      if (sortBy === 'amount_desc') {
        return b.remaining_due - a.remaining_due;
      }
      if (sortBy === 'total_due_desc') {
        return b.student.total_due - a.student.total_due;
      }
      if (sortBy === 'batch_asc') {
        const cmp = (a.student.batch || '').localeCompare(b.student.batch || '');
        return cmp !== 0 ? cmp : new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      if (sortBy === 'trade_asc') {
        const cmp = (a.student.trade_name || '').localeCompare(b.student.trade_name || '');
        return cmp !== 0 ? cmp : new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      // Default: 'due_asc' (nearest due date first)
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
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

