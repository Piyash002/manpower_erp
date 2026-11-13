import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { Student } from '@/models/Student';
import { AuditLog } from '@/models/AuditLog';
import { PayslipBatch } from '@/models/PayslipBatch';
import { DailyAttendance } from '@/models/DailyAttendance';
import { AttendanceCorrection } from '@/models/AttendanceCorrection';
import { Leave } from '@/models/Leave';
import { JournalEntry } from '@/models/JournalEntry';
import { MoneyReceipt } from '@/models/MoneyReceipt';
import { formatPaisaBDT } from '@/lib/accounts-money';
import { formatDateDMY } from '@/lib/formatters';
import { rememberCache } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();

    const cacheKey = `notifications:${auth.user.role}`;

    const payload = await rememberCache(cacheKey, 15, async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setDate(sixMonthsFromNow.getDate() + 180);

    const notifications: Array<{
      id: string;
      title: string;
      message: string;
      category: 'salary' | 'attendance' | 'entries' | 'fee' | 'passport' | 'discount';
      level: 'danger' | 'warning' | 'info' | 'success';
      href: string;
      count?: number;
      timestamp: string;
      badgeText?: string;
    }> = [];

    // ==========================================
    // 1. SALARY & PAYROLL NOTIFICATIONS
    // ==========================================
    // Check confirmed payroll batches waiting for disbursement in Accounts
    const confirmedPayrollBatches = await PayslipBatch.find({
      status: 'Confirmed',
    })
      .select('name batch_code month year status net_payable_paisa')
      .lean();

    for (const batch of confirmedPayrollBatches) {
      notifications.push({
        id: `payroll-confirmed-${batch._id}`,
        title: `Salary Disbursement Pending: ${batch.batch_code}`,
        message: `Payroll run "${batch.name || batch.batch_code}" is confirmed and awaiting disbursement payment voucher in Accounts.`,
        category: 'salary',
        level: 'warning',
        href: '/accounts/payroll',
        timestamp: new Date().toISOString(),
        badgeText: 'Disbursement Due',
      });
    }

    // Check draft payroll runs waiting for verification
    const draftPayrollBatches = await PayslipBatch.find({
      status: 'Draft',
    })
      .select('name batch_code')
      .lean();

    if (draftPayrollBatches.length > 0) {
      notifications.push({
        id: 'payroll-drafts',
        title: 'Draft Payroll Runs',
        message: `${draftPayrollBatches.length} draft payroll run(s) awaiting verification and approval in HRM.`,
        category: 'salary',
        level: 'info',
        href: '/payroll',
        count: draftPayrollBatches.length,
        timestamp: new Date().toISOString(),
        badgeText: 'HRM Payroll',
      });
    }

    // ==========================================
    // 2. ATTENDANCE & ABSENCES NOTIFICATIONS
    // ==========================================
    // Check today's absent staff
    const todayAbsences = await DailyAttendance.find({
      date: { $gte: today, $lt: tomorrow },
      status: 'Absent',
    })
      .populate('employee_id', 'firstName lastName employee_id')
      .lean();

    if (todayAbsences.length > 0) {
      const absentNames = todayAbsences
        .map((a: any) => `${a.employee_id?.firstName || ''} ${a.employee_id?.lastName || ''}`.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');

      notifications.push({
        id: 'today-absences',
        title: 'Staff Absences Today',
        message: `${todayAbsences.length} employee(s) marked Absent today${absentNames ? ` (${absentNames}${todayAbsences.length > 2 ? '...' : ''})` : ''}.`,
        category: 'attendance',
        level: 'warning',
        href: '/attendance',
        count: todayAbsences.length,
        timestamp: new Date().toISOString(),
        badgeText: `${todayAbsences.length} Absent`,
      });
    }

    // Check pending attendance corrections
    const pendingCorrections = await AttendanceCorrection.find({
      status: 'Pending',
    })
      .populate('employee_id', 'firstName lastName')
      .lean();

    if (pendingCorrections.length > 0) {
      notifications.push({
        id: 'attendance-corrections',
        title: 'Attendance Correction Requests',
        message: `${pendingCorrections.length} attendance punch correction request(s) awaiting review.`,
        category: 'attendance',
        level: 'info',
        href: '/attendance',
        count: pendingCorrections.length,
        timestamp: new Date().toISOString(),
        badgeText: 'Review Needed',
      });
    }

    // Check pending leaves
    const pendingLeaves = await Leave.find({
      status: 'Pending',
    })
      .populate('employee_id', 'firstName lastName')
      .lean();

    if (pendingLeaves.length > 0) {
      notifications.push({
        id: 'pending-leaves',
        title: 'Leave Applications Pending',
        message: `${pendingLeaves.length} leave application(s) awaiting approval in HRM.`,
        category: 'attendance',
        level: 'info',
        href: '/hrm/employees',
        count: pendingLeaves.length,
        timestamp: new Date().toISOString(),
        badgeText: 'Leave Approval',
      });
    }

    // ==========================================
    // 3. OVERDUE DUES & FEES NOTIFICATIONS
    // ==========================================
    const overduePlans = await StudentFeePlan.find({
      isDeleted: { $ne: true },
      totalDuePaisa: { $gt: 0 },
      'stages.dueDate': { $lt: today },
      'stages.status': { $ne: 'Paid' },
    })
      .select('planNo studentNo studentId stages totalDuePaisa')
      .populate('studentId', 'name student_no')
      .lean();

    let totalOverduePaisa = 0;
    for (const p of overduePlans) {
      for (const st of p.stages || []) {
        if (st.status !== 'Paid' && st.dueDate && new Date(st.dueDate) < today) {
          totalOverduePaisa += Math.max(0, (st.amountPaisa || 0) - (st.paidPaisa || 0));
        }
      }
    }

    if (overduePlans.length > 0) {
      notifications.push({
        id: 'overdue-fees',
        title: 'Overdue Fee Installments',
        message: `${overduePlans.length} candidate(s) past scheduled due date (${formatPaisaBDT(totalOverduePaisa)} total overdue). Immediate follow-up required.`,
        category: 'fee',
        level: 'danger',
        href: '/accounts/student-fees?status=Overdue',
        count: overduePlans.length,
        timestamp: new Date().toISOString(),
        badgeText: 'Overdue Alert',
      });
    }

    // ==========================================
    // 4. LATEST ENTRIES & ACCOUNTING TRANSACTIONS
    // ==========================================
    // Latest Journal Vouchers posted
    const latestEntries = await JournalEntry.find({
      status: 'Posted',
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(2)
      .lean();

    for (const entry of latestEntries) {
      notifications.push({
        id: `entry-${entry._id}`,
        title: `Latest Entry: ${entry.voucherNo}`,
        message: `${entry.sourceModule || 'Journal'} entry posted for BDT ${formatPaisaBDT(entry.totalDebitPaisa || 0)} (${entry.description || 'Posted entry'}).`,
        category: 'entries',
        level: 'info',
        href: '/accounts/vouchers',
        timestamp: entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString(),
        badgeText: entry.journalType || 'JV',
      });
    }

    // Latest Money Receipts collected
    const latestReceipt = await MoneyReceipt.findOne({
      status: 'Posted',
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .populate('studentId', 'name')
      .lean();

    if (latestReceipt) {
      notifications.push({
        id: `receipt-${latestReceipt._id}`,
        title: `Latest Money Receipt: ${latestReceipt.receiptNo}`,
        message: `Collected ${formatPaisaBDT(latestReceipt.amountPaisa)} from ${(latestReceipt.studentId as any)?.name || 'Candidate'} via ${latestReceipt.method || 'Cash'}.`,
        category: 'entries',
        level: 'success',
        href: '/accounts/receipts',
        timestamp: latestReceipt.createdAt ? new Date(latestReceipt.createdAt).toISOString() : new Date().toISOString(),
        badgeText: 'Collected',
      });
    }

    // Recent Student Admission
    const latestStudent = await Student.findOne({
      status: 'Active',
    })
      .sort({ createdAt: -1 })
      .select('name student_no trade_name createdAt')
      .lean();

    if (latestStudent) {
      notifications.push({
        id: `student-${latestStudent._id}`,
        title: `New Admission: ${latestStudent.name}`,
        message: `Candidate ${latestStudent.student_no} enrolled into trade "${latestStudent.trade_name}".`,
        category: 'entries',
        level: 'info',
        href: `/students/${latestStudent._id}`,
        timestamp: latestStudent.createdAt ? new Date(latestStudent.createdAt).toISOString() : new Date().toISOString(),
        badgeText: 'Admission',
      });
    }

    // ==========================================
    // 5. PENDING DISCOUNTS & PASSPORT EXPIRIES
    // ==========================================
    const pendingDiscounts = await StudentFeePlan.find({
      isDeleted: { $ne: true },
      discountStatus: 'Pending',
      pendingDiscountPaisa: { $gt: 0 },
    })
      .select('planNo studentId pendingDiscountPaisa')
      .populate('studentId', 'name')
      .lean();

    if (pendingDiscounts.length > 0) {
      const pendingTotal = pendingDiscounts.reduce((sum, p) => sum + (p.pendingDiscountPaisa || 0), 0);
      notifications.push({
        id: 'pending-discounts',
        title: 'Fee Waiver Requests',
        message: `${pendingDiscounts.length} waiver request(s) awaiting Admin approval (${formatPaisaBDT(pendingTotal)}).`,
        category: 'discount',
        level: 'warning',
        href: '/accounts/student-fees',
        count: pendingDiscounts.length,
        timestamp: new Date().toISOString(),
        badgeText: 'Approval Req',
      });
    }

    const expiringPassportsCount = await Student.countDocuments({
      status: 'Active',
      passport_expiry_date: { $gte: today, $lte: sixMonthsFromNow },
    });

    if (expiringPassportsCount > 0) {
      notifications.push({
        id: 'expiring-passports',
        title: 'Passport Expiry Warnings',
        message: `${expiringPassportsCount} candidate(s) have passports expiring within 6 months. Review needed for visa processing.`,
        category: 'passport',
        level: 'warning',
        href: '/students',
        count: expiringPassportsCount,
        timestamp: new Date().toISOString(),
        badgeText: 'Action Needed',
      });
    }

    // Calculate urgent unread count
    const urgentCount =
      (overduePlans.length > 0 ? 1 : 0) +
      (confirmedPayrollBatches.length > 0 ? 1 : 0) +
      (todayAbsences.length > 0 ? 1 : 0) +
      (pendingDiscounts.length > 0 ? 1 : 0) +
      (expiringPassportsCount > 0 ? 1 : 0);

    return {
      success: true,
      unreadCount: urgentCount,
      totalAlerts: notifications.length,
      stats: {
        overdueCount: overduePlans.length,
        totalOverduePaisa,
        confirmedPayrollCount: confirmedPayrollBatches.length,
        todayAbsenceCount: todayAbsences.length,
        pendingDiscountCount: pendingDiscounts.length,
        expiringPassportsCount,
      },
      notifications,
    };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
