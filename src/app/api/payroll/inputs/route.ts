import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { PayrollInput } from '@/models/PayrollInput';
import { Employee } from '@/models/Employee';

interface UpsertInputBody {
  employee_id: string;
  month: number;
  year: number;
  bonus?: number;
  overtime_hours?: number;
  overtime_rate?: number;
  loan_installment?: number;
  manual_deduction?: number;
  notes?: string;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);

    const [employees, inputs] = await Promise.all([
      Employee.find({ status: { $in: ['Active', 'On Leave'] } })
        .select('employee_id firstName lastName department designation basic_salary')
        .sort({ firstName: 1 })
        .lean(),
      PayrollInput.find({ month, year }).lean(),
    ]);

    const inputMap = new Map<string, any>();
    for (const inp of inputs) {
      inputMap.set(inp.employee_id.toString(), inp);
    }

    const rows = employees.map((emp: any) => {
      const inp = inputMap.get(emp._id.toString());
      return {
        employee: { ...emp, _id: emp._id.toString() },
        input: inp
          ? {
              _id: inp._id.toString(),
              bonus: inp.bonus || 0,
              overtime_hours: inp.overtime_hours || 0,
              overtime_rate: inp.overtime_rate || 0,
              loan_installment: inp.loan_installment || 0,
              manual_deduction: inp.manual_deduction || 0,
              notes: inp.notes || '',
            }
          : {
              _id: null,
              bonus: 0,
              overtime_hours: 0,
              overtime_rate: 0,
              loan_installment: 0,
              manual_deduction: 0,
              notes: '',
            },
      };
    });

    return NextResponse.json({
      success: true,
      data: { month, year, rows },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch monthly inputs' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as UpsertInputBody;
    const month = Number(body.month);
    const year = Number(body.year);

    if (!body.employee_id || !month || month < 1 || month > 12 || !year) {
      return NextResponse.json(
        { success: false, message: 'employee_id, valid month, and year are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    const emp = await Employee.findById(body.employee_id);
    if (!emp) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const updated = await PayrollInput.findOneAndUpdate(
      { employee_id: body.employee_id, month, year },
      {
        $set: {
          bonus: Math.max(0, Math.round(Number(body.bonus) || 0)),
          overtime_hours: Math.max(0, Number(body.overtime_hours) || 0),
          overtime_rate: Math.max(0, Math.round(Number(body.overtime_rate) || 0)),
          loan_installment: Math.max(0, Math.round(Number(body.loan_installment) || 0)),
          manual_deduction: Math.max(0, Math.round(Number(body.manual_deduction) || 0)),
          notes: body.notes?.trim() || '',
          updated_by: auth.user.name,
        },
      },
      { upsert: true, new: true }
    );

    await createAuditLog({
      user: auth.user,
      action: 'PAYROLL_INPUT_SAVED',
      entity: 'PayrollInput',
      entityId: updated._id.toString(),
      newValues: {
        employee_id: emp.employee_id,
        month,
        year,
        bonus: updated.bonus,
        overtime_hours: updated.overtime_hours,
        loan_installment: updated.loan_installment,
        manual_deduction: updated.manual_deduction,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Monthly inputs saved for ${emp.firstName} ${emp.lastName}.`,
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save monthly inputs' },
      { status: 500 }
    );
  }
}

