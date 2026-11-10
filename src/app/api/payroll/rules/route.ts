import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { SalaryRule, SalaryRuleCategory, SalaryRuleType } from '@/models/SalaryRule';
import { SalaryStructure } from '@/models/SalaryStructure';
import { evaluatePayrollFormula } from '@/lib/payroll-engine';

interface CreateRuleBody {
  structure_id: string;
  name: string;
  code: string;
  category: SalaryRuleCategory;
  type: SalaryRuleType;
  amount_or_percentage?: number;
  formula?: string;
  sequence?: number;
  active?: boolean;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const structureId = searchParams.get('structure_id');

    const filter: Record<string, any> = {};
    if (structureId) filter.structure_id = structureId;

    const rules = await SalaryRule.find(filter).sort({ sequence: 1, createdAt: 1 }).lean();

    return NextResponse.json({
      success: true,
      data: rules,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch salary rules' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as CreateRuleBody;
    if (!body.structure_id || !body.name?.trim() || !body.code?.trim() || !body.category || !body.type) {
      return NextResponse.json(
        { success: false, message: 'structure_id, name, code, category, and type are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    const structure = await SalaryStructure.findById(body.structure_id);
    if (!structure) {
      return NextResponse.json({ success: false, message: 'Salary Structure not found' }, { status: 404 });
    }

    const cleanCode = body.code.trim().toUpperCase();
    const duplicate = await SalaryRule.findOne({ structure_id: body.structure_id, code: cleanCode });
    if (duplicate) {
      return NextResponse.json(
        { success: false, message: `Rule code "${cleanCode}" already exists in this structure.` },
        { status: 409 }
      );
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

    const rule = await SalaryRule.create({
      structure_id: body.structure_id,
      name: body.name.trim(),
      code: cleanCode,
      category: body.category,
      type: body.type,
      amount_or_percentage: Number(body.amount_or_percentage) || 0,
      formula: body.formula?.trim() || '',
      sequence: Number(body.sequence) || 50,
      active: body.active !== undefined ? Boolean(body.active) : true,
    });

    await createAuditLog({
      user: auth.user,
      action: 'SALARY_RULE_CREATED',
      entity: 'SalaryRule',
      entityId: rule._id.toString(),
      newValues: { code: rule.code, name: rule.name, category: rule.category, type: rule.type },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Salary rule "${rule.name}" added.`,
        data: rule,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create salary rule' },
      { status: 400 }
    );
  }
}

