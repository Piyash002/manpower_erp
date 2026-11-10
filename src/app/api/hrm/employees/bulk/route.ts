import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee, EmployeeStatus } from '@/models/Employee';

const VALID_STATUSES: EmployeeStatus[] = [
  'Active',
  'On Leave',
  'Inactive',
  'Resigned',
  'Terminated',
];

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as {
      ids: string[];
      status: EmployeeStatus;
      reason?: string;
    };

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Select at least one employee.' },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { success: false, message: `Invalid status "${body.status}".` },
        { status: 400 }
      );
    }

    await connectDB();

    const updateSet: Record<string, unknown> = { status: body.status };
    if (body.status === 'Resigned') {
      updateSet.resignation_date = new Date();
    }

    const res = await Employee.updateMany(
      { _id: { $in: body.ids }, is_deleted: { $ne: true } },
      { $set: updateSet }
    );

    await createAuditLog({
      user: auth.user,
      action: 'EMPLOYEE_BULK_STATUS_UPDATE',
      entity: 'Employee',
      newValues: {
        count: res.modifiedCount,
        status: body.status,
        reason: body.reason?.trim() || 'Bulk directory status change',
        ids: body.ids.slice(0, 50),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Updated ${res.modifiedCount} employee(s) to "${body.status}".`,
      data: { modifiedCount: res.modifiedCount },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bulk status update failed';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

