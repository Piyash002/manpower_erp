import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { PayslipBatch, DaysBasis, ISkippedEmployeeEntry } from '@/models/PayslipBatch';
import { Payslip } from '@/models/Payslip';
import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryStructure } from '@/models/SalaryStructure';
import { DailyAttendance } from '@/models/DailyAttendance';
import { getNextSequence } from '@/models/Counter';
import { ensurePayrollSeeded } from '@/lib/payroll-seed';
import {
  computeEmployeePayslipData,
  computePercentChange,
  detectRunWarnings,
  generateNextPayslipNo,
} from '@/lib/payroll-engine';

interface CreateRunBody {
  previewOnly?: boolean;
  name?: string;
  month: number;
  year: number;
  branch?: string;
  department?: string;
  days_basis?: DaysBasis;
  overtime_multiplier?: number;
  include_no_attendance?: boolean;
}

function getPreviousMonthYear(month: number, year: number): { prevMonth: number; prevYear: number } {
  if (month === 1) return { prevMonth: 12, prevYear: year - 1 };
  return { prevMonth: month - 1, prevYear: year };
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensurePayrollSeeded();

    const batches = await PayslipBatch.find({}).sort({ year: -1, month: -1, createdAt: -1 }).lean();

    // Map active/non-reversed runs by key "YYYY-M-branch" for prior-month comparison
    const runLookup = new Map<string, any>();
    for (const b of batches) {
      if (b.is_reversal || b.status === 'Reversed' || b.status === 'Cancelled') continue;
      const key = `${b.year}-${b.month}-${b.branch || 'Main'}`;
      if (!runLookup.has(key)) runLookup.set(key, b);
    }

    const enriched = batches.map((b: any) => {
      const { prevMonth, prevYear } = getPreviousMonthYear(b.month, b.year);
      const prevRun = runLookup.get(`${prevYear}-${prevMonth}-${b.branch || 'Main'}`) || null;
      return {
        ...b,
        previous_run: prevRun
          ? {
              _id: prevRun._id,
              batch_code: prevRun.batch_code,
              month: prevRun.month,
              year: prevRun.year,
              payslip_count: prevRun.payslip_count,
              total_gross_pay: prevRun.total_gross_pay,
              total_deductions: prevRun.total_deductions,
              total_net_pay: prevRun.total_net_pay,
            }
          : null,
        deltas: prevRun
          ? {
              countPct: computePercentChange(b.payslip_count || 0, prevRun.payslip_count || 0),
              grossPct: computePercentChange(b.total_gross_pay || 0, prevRun.total_gross_pay || 0),
              deductionsPct: computePercentChange(b.total_deductions || 0, prevRun.total_deductions || 0),
              netPct: computePercentChange(b.total_net_pay || 0, prevRun.total_net_pay || 0),
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch payroll runs' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as CreateRunBody;
    const month = Number(body.month);
    const year = Number(body.year);
    const branch = body.branch?.trim() || 'Main';
    const department = body.department?.trim() || 'all';
    const daysBasis: DaysBasis = body.days_basis === '30' ? '30' : 'calendar';
    const overtimeMultiplier = Number(body.overtime_multiplier) > 0 ? Number(body.overtime_multiplier) : 2;
    const includeNoAttendance = Boolean(body.include_no_attendance);
    const previewOnly = Boolean(body.previewOnly);

    if (!month || month < 1 || month > 12 || !year) {
      return NextResponse.json(
        { success: false, message: 'Valid month (1-12) and year are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    await ensurePayrollSeeded();

    // Check uniqueness: one active run per (month, year, branch)
    const existingRun = await PayslipBatch.findOne({
      month,
      year,
      branch,
      is_reversal: { $ne: true },
      status: { $in: ['Draft', 'Verified', 'Confirmed', 'Paid'] },
    }).lean();

    if (existingRun && !previewOnly) {
      return NextResponse.json(
        {
          success: false,
          message: `Payroll run ${existingRun.batch_code} already exists for ${month}/${year} (${branch} branch). Duplicate runs are not allowed.`,
        },
        { status: 409 }
      );
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const empFilter: Record<string, any> = {
      is_deleted: { $ne: true },
      status: { $in: ['Active', 'On Leave'] },
    };
    if (department !== 'all') empFilter.department = department;
    if (branch !== 'All') {
      empFilter.$or =
        branch === 'Main'
          ? [{ branch: 'Main' }, { branch: { $exists: false } }, { branch: '' }, { branch: null }]
          : [{ branch }];
    }

    const employees = await Employee.find(empFilter).sort({ employee_id: 1 }).lean();

    // Preload existing payslips, contracts, attendance existence for month
    const empIds = employees.map((e: any) => e._id);
    const [existingPayslips, activeContracts, attendanceCounts, structures] = await Promise.all([
      Payslip.find({
        employee_id: { $in: empIds },
        month,
        year,
        is_reversal: { $ne: true },
        status: { $nin: ['Cancelled', 'Reversed'] },
      }).lean(),
      EmployeeContract.find({
        employee_id: { $in: empIds },
        status: 'Active',
        start_date: { $lte: monthEnd },
        $or: [{ end_date: null }, { end_date: { $gte: monthStart } }],
      })
        .sort({ start_date: -1 })
        .lean(),
      DailyAttendance.aggregate([
        { $match: { employee_id: { $in: empIds }, date: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: '$employee_id', count: { $sum: 1 } } },
      ]),
      SalaryStructure.find({}).select('_id active').lean(),
    ]);

    const payslipByEmp = new Map<string, any>();
    for (const p of existingPayslips) payslipByEmp.set(p.employee_id.toString(), p);

    const contractByEmp = new Map<string, any>();
    for (const c of activeContracts) {
      if (!contractByEmp.has(c.employee_id.toString())) {
        contractByEmp.set(c.employee_id.toString(), c);
      }
    }

    const attCountByEmp = new Map<string, number>();
    for (const a of attendanceCounts) attCountByEmp.set(a._id.toString(), a.count || 0);

    const structureMap = new Map<string, any>();
    for (const s of structures) structureMap.set(s._id.toString(), s);

    const skippedEmployees: ISkippedEmployeeEntry[] = [];
    const eligibleEmployees: any[] = [];

    for (const emp of employees as any[]) {
      const empId = emp._id.toString();
      const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();

      const dupSlip = payslipByEmp.get(empId);
      if (dupSlip) {
        skippedEmployees.push({
          employee_id: emp._id,
          employee_code: emp.employee_id || '',
          name: empName,
          department: emp.department || '',
          reason_code: 'already_confirmed',
          reason:
            dupSlip.status === 'Confirmed' || dupSlip.status === 'Paid'
              ? `Already in a ${dupSlip.status} run (${dupSlip.payslip_no})`
              : `Payslip ${dupSlip.payslip_no} already exists (${dupSlip.status})`,
        });
        continue;
      }

      const contract = contractByEmp.get(empId);
      if (!contract) {
        skippedEmployees.push({
          employee_id: emp._id,
          employee_code: emp.employee_id || '',
          name: empName,
          department: emp.department || '',
          reason_code: 'no_contract',
          reason: 'No active payroll contract covering this month',
        });
        continue;
      }

      const struct = structureMap.get(contract.structure_id?.toString());
      if (!struct || struct.active === false) {
        skippedEmployees.push({
          employee_id: emp._id,
          employee_code: emp.employee_id || '',
          name: empName,
          department: emp.department || '',
          reason_code: 'no_structure',
          reason: 'Assigned salary structure is missing or inactive',
        });
        continue;
      }

      const attCount = attCountByEmp.get(empId) || 0;
      if (!includeNoAttendance && attCount === 0) {
        skippedEmployees.push({
          employee_id: emp._id,
          employee_code: emp.employee_id || '',
          name: empName,
          department: emp.department || '',
          reason_code: 'no_attendance',
          reason: 'No attendance data recorded for this month',
        });
        continue;
      }

      eligibleEmployees.push(emp);
    }

    if (previewOnly) {
      return NextResponse.json({
        success: true,
        data: {
          eligibleCount: eligibleEmployees.length,
          skippedCount: skippedEmployees.length,
          totalScanned: employees.length,
          existingRun: existingRun
            ? { _id: existingRun._id, batch_code: existingRun.batch_code, status: existingRun.status }
            : null,
          skippedPreview: skippedEmployees,
        },
      });
    }

    if (eligibleEmployees.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `No eligible employees found (${skippedEmployees.length} skipped). Review contract, structure, and attendance requirements.`,
          data: { skipped_employees: skippedEmployees },
        },
        { status: 400 }
      );
    }

    // Generate run code PR-YYYYMM-01
    const ym = `${year}${String(month).padStart(2, '0')}`;
    const seq = await getNextSequence(`payslip_batch_${ym}_${branch}`);
    const batchCode = `PR-${ym}-${String(seq).padStart(2, '0')}`;
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });

    const batch = await PayslipBatch.create({
      name:
        body.name?.trim() ||
        `${monthLabel} Payroll (${branch}${department === 'all' ? '' : ` · ${department}`})`,
      batch_code: batchCode,
      month,
      year,
      branch,
      department,
      status: 'Draft',
      days_basis: daysBasis,
      overtime_multiplier: overtimeMultiplier,
      include_no_attendance: includeNoAttendance,
      skipped_count: skippedEmployees.length,
      skipped_employees: skippedEmployees,
      created_by: auth.user.name,
    });

    // Load previous month's net pay map for anomaly detection
    const { prevMonth, prevYear } = getPreviousMonthYear(month, year);
    const prevSlips = await Payslip.find({
      employee_id: { $in: eligibleEmployees.map((e: any) => e._id) },
      month: prevMonth,
      year: prevYear,
      is_reversal: { $ne: true },
      status: { $in: ['Draft', 'Verified', 'Confirmed', 'Paid'] },
    }).lean();
    const prevNetMap = new Map<string, number>();
    for (const ps of prevSlips) prevNetMap.set(ps.employee_id.toString(), ps.net_pay || 0);

    let createdCount = 0;
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    const computedForWarnings: any[] = [];

    for (const emp of eligibleEmployees) {
      const empId = emp._id.toString();
      const computed = await computeEmployeePayslipData({
        employeeId: empId,
        month,
        year,
        daysBasis,
        overtimeMultiplier,
      });

      const payslipNo = await generateNextPayslipNo(month, year);

      await Payslip.create({
        payslip_no: payslipNo,
        employee_id: computed.employee._id,
        contract_id: computed.contract._id,
        structure_id: computed.structure._id,
        batch_id: batch._id,
        month,
        year,
        branch,
        days_basis: computed.days_basis,
        days_in_month: computed.days_in_month,
        prorated_days: computed.prorated_days,
        per_day_rate: computed.per_day_rate,
        overtime_multiplier: computed.overtime_multiplier,
        attendance_summary: computed.attendance_summary,
        inputs_snapshot: computed.inputs_snapshot,
        lines: computed.lines,
        basic_pay: computed.basic_pay,
        total_allowances: computed.total_allowances,
        gross_pay: computed.gross_pay,
        total_deductions: computed.total_deductions,
        net_pay: computed.net_pay,
        amount_in_words: computed.amount_in_words,
        payment_method: emp.payment_method || 'Bank',
        status: 'Draft',
        created_by: auth.user.name,
      });

      createdCount++;
      totalGross += computed.gross_pay;
      totalDeductions += computed.total_deductions;
      totalNet += computed.net_pay;
      computedForWarnings.push(computed);
    }

    const warnings = detectRunWarnings(computedForWarnings, prevNetMap);

    batch.payslip_count = createdCount;
    batch.skipped_count = skippedEmployees.length;
    batch.total_gross_pay = totalGross;
    batch.total_deductions = totalDeductions;
    batch.total_net_pay = totalNet;
    batch.warnings = warnings as any;
    await batch.save();

    await createAuditLog({
      user: auth.user,
      action: 'PAYROLL_RUN_GENERATED',
      entity: 'PayslipBatch',
      entityId: batch._id.toString(),
      newValues: {
        batch_code: batch.batch_code,
        month,
        year,
        branch,
        days_basis: daysBasis,
        createdCount,
        skippedCount: skippedEmployees.length,
        warningCount: warnings.length,
        totalNet,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `${batch.batch_code}: ${createdCount} payslips created, ${skippedEmployees.length} skipped.`,
        data: batch,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const status = error?.code === 11000 ? 409 : 500;
    const message =
      error?.code === 11000
        ? 'A payroll run already exists for this month, year, and branch.'
        : error.message || 'Failed to generate payroll run';
    return NextResponse.json({ success: false, message }, { status });
  }
}
