import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { SalaryStructure } from '@/models/SalaryStructure';
import { SalaryRule } from '@/models/SalaryRule';
import { EmployeeContract } from '@/models/EmployeeContract';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const structure = await SalaryStructure.findById(id).lean();
    if (!structure) {
      return NextResponse.json({ success: false, message: 'Structure not found' }, { status: 404 });
    }

    const rules = await SalaryRule.find({ structure_id: id }).sort({ sequence: 1 }).lean();

    return NextResponse.json({
      success: true,
      data: { ...structure, rules },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load salary structure' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    await connectDB();

    const structure = await SalaryStructure.findById(id);
    if (!structure) {
      return NextResponse.json({ success: false, message: 'Structure not found' }, { status: 404 });
    }

    const oldValues = {
      name: structure.name,
      code: structure.code,
      active: structure.active,
    };

    if (body.name !== undefined) structure.name = body.name.trim();
    if (body.code !== undefined) structure.code = body.code.trim().toUpperCase();
    if (body.description !== undefined) structure.description = body.description.trim();
    if (body.active !== undefined) structure.active = Boolean(body.active);

    await structure.save();

    await createAuditLog({
      user: auth.user,
      action: 'SALARY_STRUCTURE_UPDATED',
      entity: 'SalaryStructure',
      entityId: structure._id.toString(),
      oldValues,
      newValues: {
        name: structure.name,
        code: structure.code,
        active: structure.active,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Salary Structure updated successfully.',
      data: structure,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update salary structure' },
      { status: 500 }
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
    const contractCount = await EmployeeContract.countDocuments({ structure_id: id });
    if (contractCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete structure referenced by ${contractCount} contract(s). Deactivate it instead.`,
        },
        { status: 400 }
      );
    }

    const structure = await SalaryStructure.findByIdAndDelete(id);
    if (!structure) {
      return NextResponse.json({ success: false, message: 'Structure not found' }, { status: 404 });
    }

    await SalaryRule.deleteMany({ structure_id: id });

    await createAuditLog({
      user: auth.user,
      action: 'SALARY_STRUCTURE_DELETED',
      entity: 'SalaryStructure',
      entityId: id,
      oldValues: { name: structure.name, code: structure.code },
    });

    return NextResponse.json({
      success: true,
      message: 'Salary Structure deleted.',
      data: { _id: id },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete salary structure' },
      { status: 500 }
    );
  }
}

