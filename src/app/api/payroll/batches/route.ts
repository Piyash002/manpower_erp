import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { PayslipBatch } from '@/models/PayslipBatch';
import { Payslip } from '@/models/Payslip';
import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { getNextSequence } from '@/models/Counter';
import { ensurePayrollSeeded } from '@/lib/payroll-seed';
import { computeEmployeePayslipData, generateNextPayslipNo } from '@/lib/payroll-engine';

interface CreateBatchBody {
  name?: string;
  month: number;
  year: number;
  department?: string;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensurePayrollSeeded();

    const batches = await PayslipBatch.find({}).sort({ year: -1, month: -1, createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      data: batches,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch payslip batches' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as CreateBatchBody;
    const month = Number(body.month);
    const year = Number(body.year);
    const department = body.department?.trim() || 'all';

    if (!month || month < 1 || month > 12 || !year) {
      return NextResponse.json(
        { success: false, message: 'Valid month (1-12) and year are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    await ensurePayrollSeeded();

    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const empFilter: Record<string, any> = { status: { $in: ['Active', 'On Leave'] } };
    if (department !== 'all') empFilter.department = department;

    const employees = await Employee.find(empFilter).lean();
    if (employees.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No eligible active employees found for this filter.' },
        { status: 400 }
      );
    }

    // Generate batch code PB-YYYYMM-01
    const ym = `${year}${String(month).padStart(2, '0')}`;
    const seq = await getNextSequence(`payslip_batch_${ym}`);
    const batchCode = `PB-${ym}-${String(seq).padStart(2, '0')}`;
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });

    const batch = await PayslipBatch.create({
      name: body.name?.trim() || `${monthLabel} Payroll (${department === 'all' ? 'All Depts' : department})`,
      batch_code: batchCode,
      month,
      year,
      department,
      status: 'Draft',
      created_by: auth.user.name,
    });

    let createdCount = 0;
    let skippedNoContract = 0;
    let skippedDuplicate = 0;
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const emp of employees) {
      const empId = emp._id.toString();

      // Check existing non-cancelled payslip for employee + month + year
      const duplicate = await Payslip.findOne({
        employee_id: empId,
        month,
        year,
        status: { $ne: 'Cancelled' },
      }).lean();
      if (duplicate) {
        skippedDuplicate++;
        continue;
      }

      // Verify Active contract exists covering month
      const hasContract = await EmployeeContract.exists({
        employee_id: empId,
        status: 'Active',
        start_date: { $lte: monthEnd },
        $or: [{ end_date: null }, { end_date: { $gte: monthStart } }],
      });
      if (!hasContract) {
        skippedNoContract++;
        continue;
      }

      const computed = await computeEmployeePayslipData({
        employeeId: empId,
        month,
        year,
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
        attendance_summary: computed.attendance_summary,
        inputs_snapshot: computed.inputs_snapshot,
        lines: computed.lines,
        basic_pay: computed.basic_pay,
        total_allowances: computed.total_allowances,
        gross_pay: computed.gross_pay,
        total_deductions: computed.total_deductions,
        net_pay: computed.net_pay,
        status: 'Draft',
        created_by: auth.user.name,
      });

      createdCount++;
      totalGross += computed.gross_pay;
      totalDeductions += computed.total_deductions;
      totalNet += computed.net_pay;
    }

    if (createdCount === 0) {
      await PayslipBatch.findByIdAndDelete(batch._id);
      return NextResponse.json(
        {
          success: false,
          message: `No payslips generated (${skippedDuplicate} duplicate(s), ${skippedNoContract} missing active contract).`,
        },
        { status: 400 }
      );
    }

    batch.payslip_count = createdCount;
    batch.total_gross_pay = totalGross;
    batch.total_deductions = totalDeductions;
    batch.total_net_pay = totalNet;
    await batch.save();

    await createAuditLog({
      user: auth.user,
      action: 'PAYSLIP_BATCH_GENERATED',
      entity: 'PayslipBatch',
      entityId: batch._id.toString(),
      newValues: {
        batch_code: batch.batch_code,
        month,
        year,
        createdCount,
        skippedDuplicate,
        skippedNoContract,
        totalNet,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Batch ${batch.batch_code}: ${createdCount} payslip(s) generated${
          skippedDuplicate || skippedNoContract
            ? ` (${skippedDuplicate} duplicate skipped, ${skippedNoContract} without contract)`
            : ''
        }.`,
        data: batch,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate payslip batch' },
      { status: 500 }
    );
  }
}

