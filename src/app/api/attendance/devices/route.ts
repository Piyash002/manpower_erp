import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { BiometricDevice } from '@/models/BiometricDevice';
import { DeviceSyncLog } from '@/models/DeviceSyncLog';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const [devices, syncLogs] = await Promise.all([
      BiometricDevice.find({}).sort({ createdAt: -1 }).lean(),
      DeviceSyncLog.find({}).sort({ synced_at: -1 }).limit(50).lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: { devices, syncLogs },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch devices' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    if (!body.name?.trim() || !body.ip_address?.trim() || !body.serial_no?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Device Name, IP Address, and Serial Number are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    const cleanSerial = body.serial_no.trim().toUpperCase();
    const dup = await BiometricDevice.findOne({ serial_no: cleanSerial });
    if (dup) {
      return NextResponse.json(
        { success: false, message: `Device with serial "${cleanSerial}" already exists.` },
        { status: 409 }
      );
    }

    const token = `BIO_${crypto.randomBytes(12).toString('hex')}`;
    const device = await BiometricDevice.create({
      name: body.name.trim(),
      brand: body.brand || 'ZKTeco',
      ip_address: body.ip_address.trim(),
      port: Number(body.port) || 4370,
      serial_no: cleanSerial,
      location: body.location?.trim() || '',
      pull_url: body.pull_url?.trim() || '',
      device_token: token,
      status: body.status || 'Active',
    });

    await createAuditLog({
      user: auth.user,
      action: 'BIOMETRIC_DEVICE_ADDED',
      entity: 'BiometricDevice',
      entityId: device._id.toString(),
      newValues: { name: device.name, brand: device.brand, serial_no: device.serial_no },
    });

    return NextResponse.json(
      { success: true, message: `Device "${device.name}" registered.`, data: device },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to add biometric device' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    if (!body._id) {
      return NextResponse.json({ success: false, message: '_id is required' }, { status: 400 });
    }
    await connectDB();

    const updated = await BiometricDevice.findByIdAndUpdate(
      body._id,
      {
        $set: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.brand !== undefined ? { brand: body.brand } : {}),
          ...(body.ip_address !== undefined ? { ip_address: body.ip_address.trim() } : {}),
          ...(body.port !== undefined ? { port: Number(body.port) } : {}),
          ...(body.location !== undefined ? { location: body.location.trim() } : {}),
          ...(body.pull_url !== undefined ? { pull_url: body.pull_url.trim() } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return NextResponse.json({ success: false, message: 'Device not found' }, { status: 404 });
    }

    await createAuditLog({
      user: auth.user,
      action: 'BIOMETRIC_DEVICE_UPDATED',
      entity: 'BiometricDevice',
      entityId: updated._id.toString(),
      newValues: { name: updated.name, status: updated.status },
    });

    return NextResponse.json({
      success: true,
      message: `Device "${updated.name}" updated.`,
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update device' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });

    await connectDB();
    await BiometricDevice.findByIdAndDelete(id);
    await createAuditLog({
      user: auth.user,
      action: 'BIOMETRIC_DEVICE_DELETED',
      entity: 'BiometricDevice',
      entityId: id,
    });
    return NextResponse.json({ success: true, message: 'Device removed.', data: { _id: id } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete device' },
      { status: 500 }
    );
  }
}

