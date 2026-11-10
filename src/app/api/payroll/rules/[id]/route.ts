import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { SalaryRule } from '@/models/SalaryRule';
import { evaluatePayrollFormula } from '@/lib/payroll-engine';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    await connectDB();

    const rule = await SalaryRule.findById(id);
    if (!rule) {
      return NextResponse.json({ success: false, message: 'Salary rule not found' }, { status: 404 });
    }

    if (body.type === 'formula' && body.formula) {
      evaluatePayrollFormula(body.formula, {
        BASIC: 20000,
        ALLOWANCES: 10000,
        GROSS: 30000,
        DEDUCTIONS: 1000,
        NET: 29000,
        PRESENT_DAYS: 26,
        ABSENT_DAYS: 0,
        LATE_DAYS: 0,
        HALF_DAYS: 0,
        PAID_LEAVE_DAYS: 0,
        UNPAID_LEAVE_DAYS: 0,
        BONUS: 0,
        OVERTIME_HOURS: 0,
        OVERTIME_RATE: 0,
        LOAN_INSTALLMENT: 0,
        MANUAL_DEDUCTION: 0,
      });
    }

    const oldValues = {
      name: rule.name,
      category: rule.category,
      type: rule.type,
      amount_or_percentage: rule.amount_or_percentage,
      formula: rule.formula,
      sequence: rule.sequence,
      active: rule.active,
    };

    if (body.name !== undefined) rule.name = body.name.trim();
    if (body.code !== undefined) rule.code = body.code.trim().toUpperCase();
    if (body.category !== undefined) rule.category = body.category;
    if (body.type !== undefined) rule.type = body.type;
    if (body.amount_or_percentage !== undefined) {
      rule.amount_or_percentage = Number(body.amount_or_percentage) || 0;
    }
    if (body.formula !== undefined) rule.formula = body.formula.trim();
    if (body.sequence !== undefined) rule.sequence = Number(body.sequence) || 10;
    if (body.active !== undefined) rule.active = Boolean(body.active);

    await rule.save();

    await createAuditLog({
      user: auth.user,
      action: 'SALARY_RULE_UPDATED',
      entity: 'SalaryRule',
      entityId: rule._id.toString(),
      oldValues,
      newValues: {
        name: rule.name,
        code: rule.code,
        type: rule.type,
        amount_or_percentage: rule.amount_or_percentage,
        active: rule.active,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Salary rule updated.',
      data: rule,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update salary rule' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const rule = await SalaryRule.findByIdAndDelete(id);
    if (!rule) {
      return NextResponse.json({ success: false, message: 'Salary rule not found' }, { status: 404 });
    }

    await createAuditLog({
      user: auth.user,
      action: 'SALARY_RULE_DELETED',
      entity: 'SalaryRule',
      entityId: id,
      oldValues: { code: rule.code, name: rule.name },
    });

    return NextResponse.json({
      success: true,
      message: `Rule "${rule.name}" deleted.`,
      data: { _id: id },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete salary rule' },
      { status: 500 }
    );
  }
}

