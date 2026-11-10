import { NextRequest, NextResponse } from 'next/server';
import net from 'net';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { BiometricDevice } from '@/models/BiometricDevice';
import { DeviceSyncLog } from '@/models/DeviceSyncLog';
import { Employee } from '@/models/Employee';
import { AttendanceLog } from '@/models/AttendanceLog';
import {
  getDhakaDateString,
  normalizeDhakaDate,
  recomputeDailyAttendance,
} from '@/lib/attendance-engine';

function checkTcpReachable(host: string, port: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      settled = true;
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.on('error', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.connect(port, host);
  });
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    if (!body.device_id) {
      return NextResponse.json({ success: false, message: 'device_id is required.' }, { status: 400 });
    }

    await connectDB();
    const device = await BiometricDevice.findById(body.device_id);
    if (!device) {
      return NextResponse.json({ success: false, message: 'Biometric device not found' }, { status: 404 });
    }

    const errors: string[] = [];
    let fetched = 0;
    let matched = 0;
    let unmatched = 0;

    // 1. If device has an HTTP pull_url configured, attempt live HTTP JSON pull
    let pulledLogs: Array<{ biometric_id: string; timestamp: string; punch_type?: string }> = [];
    if (device.pull_url) {
      try {
        const resp = await fetch(device.pull_url, {
          headers: { 'x-device-token': device.device_token },
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} from device pull endpoint`);
        }
        const json = await resp.json();
        if (Array.isArray(json.logs)) {
          pulledLogs = json.logs;
        } else if (Array.isArray(json)) {
          pulledLogs = json;
        }
      } catch (e: any) {
        errors.push(`Pull URL unreachable: ${e.message}`);
      }
    } else {
      // Otherwise probe raw TCP socket on ZKTeco/Hikvision IP:Port
      const reachable = await checkTcpReachable(device.ip_address, device.port || 4370);
      if (!reachable) {
        device.status = 'Offline';
        await device.save();
        errors.push(
          `Device ${device.ip_address}:${device.port} is unreachable from server network. Use Push Endpoint (/api/attendance/biometric) or USB CSV/.dat Import if device is on a local LAN.`
        );
      }
    }

    const impacted = new Set<string>();
    for (const item of pulledLogs) {
      fetched++;
      const bioCode = String(item.biometric_id || '').trim().toUpperCase();
      const ts = new Date(item.timestamp);
      if (!bioCode || isNaN(ts.getTime())) {
        errors.push(`Invalid log entry: ${JSON.stringify(item)}`);
        continue;
      }

      const emp = await Employee.findOne({
        $or: [{ biometric_id: bioCode }, { employee_id: bioCode }],
      }).lean();

      const dateStr = getDhakaDateString(ts);
      const { dateObj } = normalizeDhakaDate(dateStr);

      await AttendanceLog.create({
        employee_id: emp ? emp._id : null,
        biometric_id: bioCode,
        device_id: device._id,
        matched: Boolean(emp),
        date: dateObj,
        timestamp: ts,
        punch_type: item.punch_type?.toUpperCase() === 'OUT' ? 'OUT' : 'IN',
        source: 'Biometric',
        location: device.location || device.name,
        reason: `Pulled from ${device.name}`,
        recorded_by: auth.user.name,
      });

      if (emp) {
        matched++;
        impacted.add(`${emp._id.toString()}|${dateStr}`);
      } else {
        unmatched++;
      }
    }

    for (const pair of impacted) {
      const [empId, dateStr] = pair.split('|');
      await recomputeDailyAttendance(empId, dateStr, { preferredSource: 'Biometric' }).catch((e) =>
        errors.push(e.message)
      );
    }

    device.last_sync_at = new Date();
    if (errors.length === 0) device.status = 'Active';
    await device.save();

    const syncLog = await DeviceSyncLog.create({
      device_id: device._id,
      device_name: device.name,
      sync_type: 'pull',
      records_fetched: fetched,
      records_matched: matched,
      unmatched_count: unmatched,
      errors,
      status: errors.length > 0 && fetched === 0 ? 'Failed' : errors.length > 0 ? 'Partial' : 'Success',
      triggered_by: auth.user.name,
    });

    await createAuditLog({
      user: auth.user,
      action: 'BIOMETRIC_DEVICE_PULL',
      entity: 'DeviceSyncLog',
      entityId: syncLog._id.toString(),
      newValues: { device: device.name, fetched, matched, unmatched, errorsCount: errors.length },
    });

    return NextResponse.json({
      success: errors.length === 0 || fetched > 0,
      message:
        errors.length > 0 && fetched === 0
          ? errors[0]
          : `Sync completed: ${fetched} fetched, ${matched} matched, ${unmatched} unmatched.`,
      data: syncLog,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Device pull failed' },
      { status: 500 }
    );
  }
}

