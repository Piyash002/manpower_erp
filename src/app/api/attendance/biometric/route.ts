import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { AttendanceLog, PunchType } from '@/models/AttendanceLog';
import {
  getDhakaDateString,
  normalizeDhakaDate,
  recomputeDailyAttendance,
} from '@/lib/attendance-engine';

interface BiometricPushBody {
  device_id?: string;
  logs: Array<{
    employee_id: string; // e.g., EMP-0001
    timestamp: string;
    punch_type: PunchType;
  }>;
}

export async function POST(req: NextRequest) {
  const deviceSecret = req.headers.get('x-biometric-secret');
  const expectedSecret = process.env.BIOMETRIC_SECRET || 'dreams-erp-biometric-2026';
  const user = getCurrentUser(req);

  const authorized =
    (deviceSecret && deviceSecret === expectedSecret) || (user && user.role === 'Admin');

  if (!authorized) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized biometric device push.' },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as BiometricPushBody;
    if (!Array.isArray(body.logs) || body.logs.length === 0) {
      return NextResponse.json({ success: false, message: 'logs array is required.' }, { status: 400 });
    }

    await connectDB();

    let accepted = 0;
    const impacted = new Set<string>();
    const errors: string[] = [];

    for (const entry of body.logs) {
      const emp = await Employee.findOne({ employee_id: entry.employee_id?.toUpperCase() }).lean();
      if (!emp) {
        errors.push(`Unknown employee_id: ${entry.employee_id}`);
        continue;
      }

      const ts = new Date(entry.timestamp);
      if (isNaN(ts.getTime())) {
        errors.push(`Invalid timestamp for ${entry.employee_id}`);
        continue;
      }

      const dateStr = getDhakaDateString(ts);
      const { dateObj } = normalizeDhakaDate(dateStr);

      await AttendanceLog.create({
        employee_id: emp._id,
        date: dateObj,
        timestamp: ts,
        punch_type: entry.punch_type === 'OUT' ? 'OUT' : 'IN',
        source: 'biometric',
        location: body.device_id ? `Device: ${body.device_id}` : 'Biometric Terminal',
        reason: 'Biometric device push',
        recorded_by: user?.name || body.device_id || 'Biometric Device',
      });

      accepted++;
      impacted.add(`${emp._id.toString()}|${dateStr}`);
    }

    for (const pair of impacted) {
      const [empId, dateStr] = pair.split('|');
      await recomputeDailyAttendance(empId, dateStr).catch((e) => errors.push(e.message));
    }

    await createAuditLog({
      user,
      action: 'ATTENDANCE_BIOMETRIC_PUSH',
      entity: 'AttendanceLog',
      newValues: { device_id: body.device_id || 'ZKTeco', accepted, errors: errors.length },
    });

    return NextResponse.json({
      success: true,
      message: `Processed ${accepted} biometric log(s).`,
      data: { accepted, recomputedDays: impacted.size, errors },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Biometric push failed' },
      { status: 500 }
    );
  }
}

