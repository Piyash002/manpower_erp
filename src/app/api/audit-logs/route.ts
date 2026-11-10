import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { AuditLog } from '@/models/AuditLog';

// GET /api/audit-logs - Admin and Counselor/all authorized
export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const entity = searchParams.get('entity');

    const filter: any = {};
    if (entity) filter.entity = entity;

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}

