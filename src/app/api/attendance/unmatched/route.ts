import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { AttendanceLog } from '@/models/AttendanceLog';
import { Employee } from '@/models/Employee';
import { BiometricDevice } from '@/models/BiometricDevice';
import { getDhakaDateString, recomputeDailyAttendance } from '@/lib/attendance-engine';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    void BiometricDevice;

    const unmatchedLogs = await AttendanceLog.find({ matched: false })
      .populate('device_id', 'name brand serial_no')
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();

    // Group summary by biometric_id
    const groupedMap = new Map<
      string,
      { biometric_id: string; count: number; latestTimestamp: Date; deviceName: string }
    >();

    for (const log of unmatchedLogs as any[]) {
      const bioId = log.biometric_id || 'UNKNOWN';
      const existing = groupedMap.get(bioId);
      if (existing) {
        existing.count++;
      } else {
        groupedMap.set(bioId, {
          biometric_id: bioId,
          count: 1,
          latestTimestamp: log.timestamp,
          deviceName: log.device_id?.name || 'Import / Device',
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        groups: Array.from(groupedMap.values()),
        logs: unmatchedLogs,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch unmatched logs' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const bioId = String(body.biometric_id || '').trim().toUpperCase();
    const employeeId = body.employee_id;

    if (!bioId || !employeeId) {
      return NextResponse.json(
        { success: false, message: 'biometric_id and employee_id are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    const emp = await Employee.findById(employeeId);
    if (!emp) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    // Check if another employee already holds this biometric_id
    const conflict = await Employee.findOne({ biometric_id: bioId, _id: { $ne: employeeId } });
    if (conflict) {
      return NextResponse.json(
        {
          success: false,
          message: `Biometric ID "${bioId}" is already mapped to ${conflict.employee_id}.`,
        },
        { status: 409 }
      );
    }

    emp.biometric_id = bioId;
    await emp.save();

    const waitingLogs = await AttendanceLog.find({
      biometric_id: bioId,
      matched: false,
    }).lean();

    await AttendanceLog.updateMany(
      { biometric_id: bioId, matched: false },
      { $set: { employee_id: emp._id, matched: true } }
    );

    const uniqueDates = new Set<string>();
    for (const l of waitingLogs) {
      uniqueDates.add(getDhakaDateString(new Date(l.timestamp)));
    }

    for (const dateStr of uniqueDates) {
      await recomputeDailyAttendance(emp._id.toString(), dateStr, {
        preferredSource: 'Biometric',
      });
    }

    await createAuditLog({
      user: auth.user,
      action: 'BIOMETRIC_ID_MAPPED',
      entity: 'Employee',
      entityId: emp._id.toString(),
      newValues: {
        employee_id: emp.employee_id,
        biometric_id: bioId,
        reprocessedLogs: waitingLogs.length,
        recomputedDays: uniqueDates.size,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Mapped "${bioId}" to ${emp.firstName} ${emp.lastName} and processed ${waitingLogs.length} pending punch(es).`,
      data: {
        reprocessedLogs: waitingLogs.length,
        recomputedDays: uniqueDates.size,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Mapping failed' },
      { status: 500 }
    );
  }
}

