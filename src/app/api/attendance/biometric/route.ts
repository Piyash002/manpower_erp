import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { BiometricDevice, IBiometricDevice } from '@/models/BiometricDevice';
import { DeviceSyncLog } from '@/models/DeviceSyncLog';
import { PunchType } from '@/models/AttendanceLog';
import {
  ingestRawPunches,
  normalizePunchType,
  RawPunchIngestItem,
} from '@/lib/attendance-engine';

interface BiometricPushBody {
  device_id?: string;
  logs: Array<{
    biometric_id?: string;
    employee_id?: string;
    timestamp: string;
    punch_type?: PunchType | string;
  }>;
}

export async function POST(req: NextRequest) {
  await connectDB();

  const deviceToken = req.headers.get('x-device-token');
  const deviceSecret = req.headers.get('x-biometric-secret');
  const expectedSecret = process.env.BIOMETRIC_SECRET || 'dreams-erp-biometric-2026';
  const user = getCurrentUser(req);

  let matchedDevice: IBiometricDevice | null = null;
  if (deviceToken) {
    matchedDevice = await BiometricDevice.findOne({
      device_token: deviceToken,
      status: { $ne: 'Inactive' },
    });
  }

  const authorized =
    Boolean(matchedDevice) ||
    (deviceSecret && deviceSecret === expectedSecret) ||
    (user && user.role === 'Admin');

  if (!authorized) {
    return NextResponse.json(
      {
        success: false,
        message: 'Unauthorized biometric push. Provide valid x-device-token or x-biometric-secret.',
      },
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

    const errors: string[] = [];
    const validItems: RawPunchIngestItem[] = [];
    const deviceLabel =
      matchedDevice?.location || matchedDevice?.name || body.device_id || 'Biometric Terminal';
    const recorder = matchedDevice?.name || user?.name || body.device_id || 'Biometric Device';

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

      validItems.push({
        code,
        timestamp: ts,
        punchType: normalizePunchType(entry.punch_type),
        source: 'Biometric',
        location: deviceLabel,
        reason: 'Biometric device push',
        recordedBy: recorder,
        deviceId: matchedDevice ? matchedDevice._id : null,
      });
    }

    const ingestResult = await ingestRawPunches(validItems);
    const allErrors = [...errors, ...ingestResult.errors];

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
      records_matched: ingestResult.matchedCount,
      unmatched_count: ingestResult.unmatchedCount,
      errors: allErrors,
      status:
        allErrors.length > 0 && ingestResult.matchedCount === 0
          ? 'Failed'
          : allErrors.length > 0
          ? 'Partial'
          : 'Success',
      triggered_by: user?.name || matchedDevice?.name || 'Device Push',
    });

    await createAuditLog({
      user,
      action: 'ATTENDANCE_BIOMETRIC_PUSH',
      entity: 'AttendanceLog',
      newValues: {
        device: matchedDevice?.name || body.device_id || 'Biometric Push',
        matchedCount: ingestResult.matchedCount,
        unmatchedCount: ingestResult.unmatchedCount,
        skippedDuplicates: ingestResult.skippedDuplicates,
        errors: allErrors.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Processed ${ingestResult.matchedCount} matched, ${ingestResult.unmatchedCount} unmatched biometric punch(es)${
        ingestResult.skippedDuplicates ? `, skipped ${ingestResult.skippedDuplicates} duplicate(s)` : ''
      }.`,
      data: {
        matchedCount: ingestResult.matchedCount,
        unmatchedCount: ingestResult.unmatchedCount,
        skippedDuplicates: ingestResult.skippedDuplicates,
        recomputedDays: ingestResult.recomputedDays,
        errors: allErrors,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Biometric push failed';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
