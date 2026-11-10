import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { AttendanceLog } from '@/models/AttendanceLog';
import { BiometricDevice } from '@/models/BiometricDevice';
import { Employee } from '@/models/Employee';
import { normalizeDhakaDate } from '@/lib/attendance-engine';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    void BiometricDevice;
    void Employee;

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const sourceParam = searchParams.get('source');
    const matchedParam = searchParams.get('matched');
    const limit = Math.min(200, parseInt(searchParams.get('limit') || '100', 10));

    const filter: Record<string, any> = {};
    if (dateParam) {
      filter.date = normalizeDhakaDate(dateParam).dateObj;
    }
    if (sourceParam && sourceParam !== 'all') {
      filter.source = sourceParam;
    }
    if (matchedParam === 'true') filter.matched = true;
    else if (matchedParam === 'false') filter.matched = false;

    const logs = await AttendanceLog.find(filter)
      .populate('employee_id', 'employee_id firstName lastName department')
      .populate('device_id', 'name brand serial_no')
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load raw punch logs' },
      { status: 500 }
    );
  }
}

