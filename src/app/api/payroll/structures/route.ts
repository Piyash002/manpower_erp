import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { SalaryStructure } from '@/models/SalaryStructure';
import { SalaryRule } from '@/models/SalaryRule';
import { ensurePayrollSeeded, seedDefaultRulesForStructure } from '@/lib/payroll-seed';

interface CreateStructureBody {
  name: string;
  code: string;
  description?: string;
  active?: boolean;
  seedDefaultRules?: boolean;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant', 'Viewer', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensurePayrollSeeded();

    const structures = await SalaryStructure.find({}).sort({ createdAt: 1 }).lean();
    const rules = await SalaryRule.find({}).sort({ sequence: 1, createdAt: 1 }).lean();

    const rulesByStructure = new Map<string, any[]>();
    for (const r of rules) {
      const sid = r.structure_id.toString();
      const arr = rulesByStructure.get(sid);
      if (arr) arr.push(r);
      else rulesByStructure.set(sid, [r]);
    }

    const enriched = structures.map((s: any) => ({
      ...s,
      _id: s._id.toString(),
      rules: rulesByStructure.get(s._id.toString()) || [],
    }));

    return NextResponse.json({
      success: true,
      data: enriched,
    });
  } catch (error: any) {
    console.error('GET /api/payroll/structures error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load salary structures' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as CreateStructureBody;
    if (!body.name?.trim() || !body.code?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Structure name and code are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    const cleanCode = body.code.trim().toUpperCase();
    const existing = await SalaryStructure.findOne({ code: cleanCode });
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Structure code "${cleanCode}" already exists.` },
        { status: 409 }
      );
    }

    const structure = await SalaryStructure.create({
      name: body.name.trim(),
      code: cleanCode,
      description: body.description?.trim() || '',
      active: body.active !== undefined ? Boolean(body.active) : true,
    });

    if (body.seedDefaultRules !== false) {
      await seedDefaultRulesForStructure(structure._id);
    }

    await createAuditLog({
      user: auth.user,
      action: 'SALARY_STRUCTURE_CREATED',
      entity: 'SalaryStructure',
      entityId: structure._id.toString(),
      newValues: { name: structure.name, code: structure.code },
    });

    const rules = await SalaryRule.find({ structure_id: structure._id }).sort({ sequence: 1 }).lean();

    return NextResponse.json(
      {
        success: true,
        message: `Salary Structure "${structure.name}" created successfully.`,
        data: { ...structure.toObject(), rules },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create salary structure' },
      { status: 500 }
    );
  }
}

