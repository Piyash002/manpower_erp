import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { BiometricDevice } from '@/models/BiometricDevice';
import { DeviceSyncLog } from '@/models/DeviceSyncLog';
import { AttendanceLog, PunchType } from '@/models/AttendanceLog';
import {
  getDhakaDateString,
  normalizeDhakaDate,
  recomputeDailyAttendance,
} from '@/lib/attendance-engine';

interface BiometricPushBody {
  device_id?: string;
  logs: Array<{
    biometric_id?: string;
    employee_id?: string;
    timestamp: string;
    punch_type: PunchType;
  }>;
}

export async function POST(req: NextRequest) {
  await connectDB();

  const deviceToken = req.headers.get('x-device-token');
  const deviceSecret = req.headers.get('x-biometric-secret');
  const expectedSecret = process.env.BIOMETRIC_SECRET || 'dreams-erp-biometric-2026';
  const user = getCurrentUser(req);

  let matchedDevice: any = null;
  if (deviceToken) {
    matchedDevice = await BiometricDevice.findOne({ device_token: deviceToken, status: { $ne: 'Inactive' } });
  }

  const authorized =
    Boolean(matchedDevice) ||
    (deviceSecret && deviceSecret === expectedSecret) ||
    (user && user.role === 'Admin');

  if (!authorized) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized biometric push. Provide valid x-device-token or x-biometric-secret.' },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as BiometricPushBody;
    if (!Array.isArray(body.logs) || body.logs.length === 0) {
      return NextResponse.json({ success: false, message: 'logs array is required.' }, { status: 400 });
    }

    if (!matchedDevice && body.device_id) {
      matchedDevice = await BiometricDevice.findOne({
        $or: [{ serial_no: body.device_id.toUpperCase() }, { name: body.device_id }],
      });
    }

    let matchedCount = 0;
    let unmatchedCount = 0;
    const impacted = new Set<string>();
    const errors: string[] = [];

    for (const entry of body.logs) {
      const code = String(entry.biometric_id || entry.employee_id || '')
        .trim()
        .toUpperCase();
      if (!code) {
        errors.push('Missing biometric_id/employee_id in punch entry');
        continue;
      }

      const ts = new Date(entry.timestamp);
      if (isNaN(ts.getTime())) {
        errors.push(`Invalid timestamp for ${code}`);
        continue;
      }

      const emp = await Employee.findOne({
        $or: [{ biometric_id: code }, { employee_id: code }],
      }).lean();

      const dateStr = getDhakaDateString(ts);
      const { dateObj } = normalizeDhakaDate(dateStr);

      await AttendanceLog.create({
        employee_id: emp ? emp._id : null,
        biometric_id: code,
        device_id: matchedDevice ? matchedDevice._id : null,
        matched: Boolean(emp),
        date: dateObj,
        timestamp: ts,
        punch_type: entry.punch_type === 'OUT' ? 'OUT' : 'IN',
        source: 'Biometric',
        location: matchedDevice?.location || matchedDevice?.name || body.device_id || 'Biometric Terminal',
        reason: 'Biometric device push',
        recorded_by: matchedDevice?.name || user?.name || body.device_id || 'Biometric Device',
      });

      if (emp) {
        matchedCount++;
        impacted.add(`${emp._id.toString()}|${dateStr}`);
      } else {
        unmatchedCount++;
      }
    }

    for (const pair of impacted) {
      const [empId, dateStr] = pair.split('|');
      await recomputeDailyAttendance(empId, dateStr, { preferredSource: 'Biometric' }).catch((e) =>
        errors.push(e.message)
      );
    }

    if (matchedDevice) {
      matchedDevice.last_sync_at = new Date();
      matchedDevice.status = 'Active';
      await matchedDevice.save();
    }

    await DeviceSyncLog.create({
      device_id: matchedDevice?._id || null,
      device_name: matchedDevice?.name || body.device_id || 'Biometric Push',
      sync_type: 'push',
      records_fetched: body.logs.length,
      records_matched: matchedCount,
      unmatched_count: unmatchedCount,
      errors,
      status: errors.length > 0 && matchedCount === 0 ? 'Failed' : errors.length > 0 ? 'Partial' : 'Success',
      triggered_by: user?.name || matchedDevice?.name || 'Device Push',
    });

    await createAuditLog({
      user,
      action: 'ATTENDANCE_BIOMETRIC_PUSH',
      entity: 'AttendanceLog',
      newValues: {
        device: matchedDevice?.name || body.device_id || 'Biometric Push',
        matchedCount,
        unmatchedCount,
        errors: errors.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Processed ${matchedCount} matched and ${unmatchedCount} unmatched biometric punch(es).`,
      data: { matchedCount, unmatchedCount, recomputedDays: impacted.size, errors },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Biometric push failed' },
      { status: 500 }
    );
  }
}
