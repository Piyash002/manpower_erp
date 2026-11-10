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
        ],
      }).select('_id');

      const matchedIds = matchingStudents.map((s) => s._id);
      studentIdFilter = { $in: matchedIds };
    }

    // 2. Fetch all installments (or matching student installments) populated with student details
    const installmentQuery: any = {};
    if (studentIdFilter) {
      installmentQuery.student_id = studentIdFilter;
    }

    const rawInstallments = await Installment.find(installmentQuery)
      .populate({
        path: 'student_id',
        select: 'name student_no mobile passport_no trade_name destination_country total_paid total_due fee_snapshot status',
      })
      .sort({ due_date: 1, installment_no: 1 })
      .lean();

    // 3. Filter out orphaned installments (if student was deleted) and calculate status & metrics
    let totalOutstandingDue = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let dueThisMonthCount = 0;
    let dueThisMonthAmount = 0;
    let paidCount = 0;
    let paidAmount = 0;

    const formattedList = rawInstallments
      .filter((inst: any) => inst.student_id)
      .map((inst: any) => {
        const dueDate = new Date(inst.due_date);
        const remainingDue = Math.max(0, (inst.amount || 0) - (inst.paid_amount || 0));
        const isPaid = inst.status === 'Paid' || remainingDue === 0;
        const isOverdue = !isPaid && dueDate < now;
        const isDueThisMonth = !isPaid && dueDate >= startOfMonth && dueDate <= endOfMonth;

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

    // 4. Apply status and timeframe filters
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

