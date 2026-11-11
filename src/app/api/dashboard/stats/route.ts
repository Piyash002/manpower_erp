import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Student } from '@/models/Student';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { Installment } from '@/models/Installment';
import { AuditLog } from '@/models/AuditLog';
import { Trade } from '@/models/Trade';
import { Batch } from '@/models/Batch';
import { seedDatabase } from '@/lib/seed';
import { paisaToTaka } from '@/lib/accounts-money';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await seedDatabase();

    const { searchParams } = new URL(req.url);
    const trade = searchParams.get('trade');
    const batch = searchParams.get('batch');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    // Build dynamic student filter
    const studentFilter: any = {};

    if (trade && trade !== 'all') {
      studentFilter.trade_name = trade;
    }

    if (batch && batch !== 'all') {
      studentFilter.batch = batch;
    }

    if (startDate || endDate) {
      studentFilter.admission_date = {};
      if (startDate) studentFilter.admission_date.$gte = new Date(startDate);
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        studentFilter.admission_date.$lte = eDate;
      }
    }

    if (status === 'due') {
      studentFilter.total_due = { $gt: 0 };
    } else if (status === 'paid') {
      studentFilter.total_due = { $lte: 0 };
    }

    if (search && search.trim()) {
      const q = search.trim();
      studentFilter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { student_no: { $regex: q, $options: 'i' } },
        { mobile: { $regex: q, $options: 'i' } },
        { passport_no: { $regex: q, $options: 'i' } },
      ];
    }

    // Parallel fetch: Filtered students, distinct lists, and aggregates
    const [
      filteredStudents,
      allTrades,
      allBatches,
      recentActivities,
    ] = await Promise.all([
      Student.find(studentFilter)
        .select(
          'student_no name mobile passport_no passport_expiry_date trade_name batch destination_country total_fee total_paid total_due admission_date status fee_snapshot'
        )
        .sort({ admission_date: -1, createdAt: -1 })
        .limit(100),

      Trade.find({ active: true }).select('name').sort({ name: 1 }),
      Batch.find({}).select('name batch_code trade_name status').sort({ createdAt: -1 }),
      AuditLog.find({}).sort({ timestamp: -1 }).limit(6),
    ]);

    // Aggregate statistics across filtered students
    let totalStudents = filteredStudents.length;
    let totalPayable = 0;
    let totalCollected = 0;
    let totalDue = 0;
    let passportsExpiringSoonCount = 0;

    const studentIds = filteredStudents.map((s) => s._id);

    // Fetch authoritative Accounts Fee Plans (fallback to legacy Installments only if a student has no plan)
    const [feePlans, legacyInstallments] = await Promise.all([
      StudentFeePlan.find({
        studentId: { $in: studentIds },
        isDeleted: { $ne: true },
      }).lean(),
      Installment.find({
        student_id: { $in: studentIds },
      }).sort({ due_date: 1 }).lean(),
    ]);

    const planByStudent = new Map<string, any>();
    for (const p of feePlans) {
      planByStudent.set(p.studentId.toString(), p);
    }

    const installmentsByStudent: Record<string, any[]> = {};
    let overdueInstallmentsCount = 0;

    legacyInstallments.forEach((inst) => {
      const sid = inst.student_id.toString();
      if (!installmentsByStudent[sid]) installmentsByStudent[sid] = [];
      installmentsByStudent[sid].push(inst);
    });

    // Build enhanced candidates list sourced from Accounts StudentFeePlan
    const candidateDuesSummary = filteredStudents.map((st) => {
      const sid = st._id.toString();
      const plan = planByStudent.get(sid);

      const studentTotalFee = plan
        ? paisaToTaka(plan.netPayablePaisa)
        : st.fee_snapshot?.total_payable || ((st.total_paid || 0) + (st.total_due || 0));
      const studentPaid = plan
        ? paisaToTaka(Math.max(0, plan.totalPaidPaisa - (plan.totalRefundedPaisa || 0)))
        : (st.total_paid || 0);
      const studentDue = plan ? paisaToTaka(plan.totalDuePaisa) : (st.total_due || 0);

      const studentHasDue = studentDue > 0;
      totalPayable += studentTotalFee;
      totalCollected += studentPaid;
      totalDue += studentDue;

      if (
        st.passport_expiry_date &&
        new Date(st.passport_expiry_date) >= now &&
        new Date(st.passport_expiry_date) <= sixMonthsFromNow
      ) {
        passportsExpiringSoonCount++;
      }

      let pendingInst: any = null;
      let hasOverdue = false;

      if (plan) {
        const stages = [...(plan.stages || [])].sort((a, b) => a.stageNo - b.stageNo);
        const nextStage = studentHasDue
          ? stages.find((s) => (s.amountPaisa || 0) - (s.paidPaisa || 0) > 0)
          : null;
        if (nextStage) {
          pendingInst = {
            installment_no: nextStage.stageNo,
            due_date: nextStage.dueDate,
            amount: paisaToTaka(nextStage.amountPaisa),
            paid_amount: paisaToTaka(nextStage.paidPaisa),
            remaining: paisaToTaka((nextStage.amountPaisa || 0) - (nextStage.paidPaisa || 0)),
            isOverdue: new Date(nextStage.dueDate) < startOfToday,
          };
        }
        if (studentHasDue) {
          for (const s of stages) {
            if (
              (s.amountPaisa || 0) - (s.paidPaisa || 0) > 0 &&
              new Date(s.dueDate) < startOfToday
            ) {
              hasOverdue = true;
              overdueInstallmentsCount++;
            }
          }
        }
      } else {
        const stInstallments = installmentsByStudent[sid] || [];
        const rawPending = studentHasDue
          ? stInstallments.find(
              (i) => i.status !== 'Paid' && (i.amount - (i.paid_amount || 0)) > 0
            )
          : null;
        if (rawPending) {
          pendingInst = {
            installment_no: rawPending.installment_no,
            due_date: rawPending.due_date,
            amount: rawPending.amount,
            paid_amount: rawPending.paid_amount,
            remaining: rawPending.amount - (rawPending.paid_amount || 0),
            isOverdue: new Date(rawPending.due_date) < startOfToday,
          };
        }
        if (studentHasDue) {
          for (const inst of stInstallments) {
            if (
              inst.status !== 'Paid' &&
              new Date(inst.due_date) < startOfToday &&
              (inst.amount - (inst.paid_amount || 0)) > 0
            ) {
              hasOverdue = true;
              overdueInstallmentsCount++;
            }
          }
        }
      }

      return {
        _id: st._id,
        student_no: st.student_no,
        name: st.name,
        mobile: st.mobile,
        passport_no: st.passport_no,
        trade_name: st.trade_name,
        batch: st.batch,
        destination_country: st.destination_country,
        total_fee: studentTotalFee,
        total_paid: studentPaid,
        total_due: studentDue,
        admission_date: st.admission_date,
        status: st.status,
        hasOverdue,
        nextInstallment: pendingInst,
      };
    });

    // Filter by 'overdue' if requested
    let finalCandidateList = candidateDuesSummary;
    if (status === 'overdue') {
      finalCandidateList = candidateDuesSummary.filter((c) => c.hasOverdue);
      totalStudents = finalCandidateList.length;
    }

    // Trade category distribution dynamic to filtered candidates
    const tradeCounts: Record<string, number> = {};
    finalCandidateList.forEach((st) => {
      const t = st.trade_name || 'General';
      tradeCounts[t] = (tradeCounts[t] || 0) + 1;
    });

    const categoryDistribution = Object.entries(tradeCounts).map(([name, count]) => ({
      name,
      count,
      percentage: totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    // Monthly admissions trend for current year
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyAdmissions = months.map((m, idx) => {
      const count = finalCandidateList.filter((s) => {
        if (!s.admission_date) return false;
        const d = new Date(s.admission_date);
        return d.getMonth() === idx;
      }).length;
      return {
        month: m,
        candidates: count,
        height: `${Math.max(15, Math.min(100, count * 20))}%`,
      };
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalStudents,
        totalPayable,
        totalCollected,
        totalDue,
        overdueInstallmentsCount,
        passportsExpiringSoonCount,
        activeBatchesCount: allBatches.filter((b) => b.status === 'In Training' || b.status === 'Upcoming').length,
      },
      candidateDuesSummary: finalCandidateList,
      categoryDistribution,
      monthlyAdmissions,
      recentActivities,
      availableTrades: allTrades.map((t) => t.name),
      availableBatches: allBatches.map((b) => ({
        code: b.batch_code,
        name: b.name,
        trade: b.trade_name,
      })),
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
