import { NextRequest, NextResponse } from 'next/server';
import net from 'net';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { BiometricDevice } from '@/models/BiometricDevice';
import { DeviceSyncLog } from '@/models/DeviceSyncLog';
import {
  ingestRawPunches,
  normalizePunchType,
  RawPunchIngestItem,
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
        if (Array.isArray(json.logs)) pulledLogs = json.logs;
        else if (Array.isArray(json)) pulledLogs = json;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Pull URL unreachable: ${msg}`);
      }
    } else {
      const reachable = await checkTcpReachable(device.ip_address, device.port || 4370);
      if (!reachable) {
        device.status = 'Offline';
        await device.save();
        errors.push(
          `Device ${device.ip_address}:${device.port} is unreachable from server network. Use Push Endpoint (/api/attendance/biometric) or USB CSV/.dat Import if device is on a local LAN.`
        );
      }
    }

    const validItems: RawPunchIngestItem[] = [];
    for (const item of pulledLogs) {
      const bioCode = String(item.biometric_id || '').trim().toUpperCase();
      const ts = new Date(item.timestamp);
      if (!bioCode || isNaN(ts.getTime())) {
        errors.push(`Invalid log entry: ${JSON.stringify(item)}`);
        continue;
      }
      validItems.push({
        code: bioCode,
        timestamp: ts,
        punchType: normalizePunchType(item.punch_type),
        source: 'Biometric',
        location: device.location || device.name,
        reason: `Pulled from ${device.name}`,
        recordedBy: auth.user.name,
        deviceId: device._id,
      });
    }

    const ingestResult = await ingestRawPunches(validItems);
    const allErrors = [...errors, ...ingestResult.errors];

    device.last_sync_at = new Date();
    if (allErrors.length === 0) device.status = 'Active';
    await device.save();

    const syncLog = await DeviceSyncLog.create({
      device_id: device._id,
      device_name: device.name,
      sync_type: 'pull',
      records_fetched: pulledLogs.length,
      records_matched: ingestResult.matchedCount,
      unmatched_count: ingestResult.unmatchedCount,
      errors: allErrors,
      status:
        allErrors.length > 0 && pulledLogs.length === 0
          ? 'Failed'
          : allErrors.length > 0
          ? 'Partial'
          : 'Success',
      triggered_by: auth.user.name,
    });

    await createAuditLog({
      user: auth.user,
      action: 'BIOMETRIC_DEVICE_PULL',
      entity: 'DeviceSyncLog',
      entityId: syncLog._id.toString(),
      newValues: {
        device: device.name,
        fetched: pulledLogs.length,
        matched: ingestResult.matchedCount,
        unmatched: ingestResult.unmatchedCount,
        skippedDuplicates: ingestResult.skippedDuplicates,
        errorsCount: allErrors.length,
      },
    });

    return NextResponse.json({
      success: allErrors.length === 0 || pulledLogs.length > 0,
      message:
        allErrors.length > 0 && pulledLogs.length === 0
          ? allErrors[0]
          : `Sync completed: ${pulledLogs.length} fetched, ${ingestResult.matchedCount} matched, ${ingestResult.unmatchedCount} unmatched${
              ingestResult.skippedDuplicates
                ? `, ${ingestResult.skippedDuplicates} duplicate(s) skipped`
                : ''
            }.`,
      data: syncLog,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Device pull failed';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
