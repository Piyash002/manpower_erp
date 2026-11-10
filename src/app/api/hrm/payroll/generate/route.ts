import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { Student } from '@/models/Student';
import { Payment } from '@/models/Payment';
import { Payroll } from '@/models/Payroll';

interface GeneratePayrollBody {
  month: number;
  year: number;
  defaultCommissionPercent?: number;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as GeneratePayrollBody;
    const month = Number(body.month);
    const year = Number(body.year);
    const defaultPercent =
      body.defaultCommissionPercent !== undefined
        ? Math.max(0, Math.min(100, Number(body.defaultCommissionPercent)))
        : 5;

    if (!month || month < 1 || month > 12 || !year || year < 2020 || year > 2100) {
      return NextResponse.json(
        { success: false, message: 'Valid month (1-12) and year are required.' },
        { status: 400 }
      );
    }

    await connectDB();

    // Month window in UTC/inclusive range
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    // 1. Cross-module Agent Commission lookup:
    //    Find all students referred by an Employee agent
    const referredStudents = await Student.find({
      referred_by_agent: { $ne: null },
    })
      .select('_id referred_by_agent')
      .lean();

    const studentAgentMap = new Map<string, string>();
    const referredStudentIds: any[] = [];
    for (const st of referredStudents) {
      if (st.referred_by_agent) {
        studentAgentMap.set(st._id.toString(), st.referred_by_agent.toString());
        referredStudentIds.push(st._id);
      }
    }

    // 2. Query Payment.ts for payments collected in this month for those referred students
    const agentCollectionMap = new Map<string, number>();
    if (referredStudentIds.length > 0) {
      const monthPayments = await Payment.find({
        student_id: { $in: referredStudentIds },
        payment_date: { $gte: monthStart, $lte: monthEnd },
      })
        .select('student_id amount')
        .lean();

      for (const pmt of monthPayments) {
        const agentId = studentAgentMap.get(pmt.student_id.toString());
        if (agentId) {
          agentCollectionMap.set(
            agentId,
            (agentCollectionMap.get(agentId) || 0) + (pmt.amount || 0)
          );
        }
      }
    }

    // 3. Process all active/on-leave employees
    const employees = await Employee.find({
      status: { $in: ['Active', 'On Leave'] },
    }).lean();

    let generatedCount = 0;
    let skippedPaidCount = 0;

    for (const emp of employees) {
      const empId = emp._id.toString();
      const existing = await Payroll.findOne({ employee_id: emp._id, month, year });

      // Never overwrite an already Paid payroll slip
      if (existing && existing.status === 'Paid') {
        skippedPaidCount++;
        continue;
      }

      const basicSalary = Math.round(emp.basic_salary || 0);
      const collectedTotal = Math.round(agentCollectionMap.get(empId) || 0);
      const appliedRate =
        emp.commission_rate && emp.commission_rate > 0
          ? emp.commission_rate
          : emp.department === 'Agent'
            ? defaultPercent
            : 0;

      const commissionEarned = Math.round((collectedTotal * appliedRate) / 100);
      const deductions = existing ? Math.round(existing.deductions || 0) : 0;
      const netPayable = Math.max(0, basicSalary + commissionEarned - deductions);

      if (existing) {
        existing.basic_salary = basicSalary;
        existing.commission_earned = commissionEarned;
        existing.commission_rate_applied = appliedRate;
        existing.referred_collections_total = collectedTotal;
        existing.net_payable = netPayable;
        existing.generated_by = auth.user.name;
        await existing.save();
      } else {
        await Payroll.create({
          employee_id: emp._id,
          month,
          year,
          basic_salary: basicSalary,
          deductions: 0,
          commission_earned: commissionEarned,
          commission_rate_applied: appliedRate,
          referred_collections_total: collectedTotal,
          net_payable: netPayable,
          status: 'Draft',
          generated_by: auth.user.name,
        });
      }
      generatedCount++;
    }

    await createAuditLog({
      user: auth.user,
      action: 'PAYROLL_GENERATED',
      entity: 'Payroll',
      newValues: {
        month,
        year,
        generatedCount,
        skippedPaidCount,
        defaultCommissionPercent: defaultPercent,
      },
    });

    const records = await Payroll.find({ month, year })
      .populate('employee_id', 'employee_id firstName lastName phone department designation commission_rate')
      .sort({ net_payable: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      message: `Payroll generated for ${generatedCount} staff member(s)${skippedPaidCount ? ` (${skippedPaidCount} already paid skipped)` : ''}.`,
      data: {
        month,
        year,
        generatedCount,
        skippedPaidCount,
        records,
      },
    });
  } catch (error: any) {
    console.error('POST /api/hrm/payroll/generate error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate payroll' },
      { status: 500 }
    );
  }
}

