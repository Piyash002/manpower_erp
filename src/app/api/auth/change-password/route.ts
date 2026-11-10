import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { hashPassword, comparePassword } from '@/lib/jwt';

export async function POST(req: NextRequest) {
  try {
    const userSession = getCurrentUser(req);
    if (!userSession) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword } = await req.json();

    if (!newPassword || newPassword.length < 10) {
      return NextResponse.json(
        { success: false, message: 'New password must be at least 10 characters long as per ERP security guidelines.' },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findById(userSession.userId);
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    // If not first-time mandatory change, check current password
    if (!user.mustChangePassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, message: 'Current password is required' },
          { status: 400 }
        );
      }
      const match = await comparePassword(currentPassword, user.passwordHash);
      if (!match) {
        return NextResponse.json(
          { success: false, message: 'Current password is incorrect' },
          { status: 400 }
        );
      }
    }

    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    await user.save();

    await createAuditLog({
      user: userSession,
      action: 'PASSWORD_CHANGED',
      entity: 'User',
      entityId: user._id.toString(),
      newValues: { mustChangePassword: false },
    });

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update password' },
      { status: 500 }
    );
  }
}

