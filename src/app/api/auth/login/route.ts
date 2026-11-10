import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { comparePassword, signAccessToken } from '@/lib/jwt';
import { createAuditLog } from '@/lib/auth';
import { seedDatabase } from '@/lib/seed';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    await seedDatabase();

    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: 'Username and password are required' },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = await User.findOne({
      $or: [
        { username: cleanUsername },
        { username: cleanUsername.replace('@gmail.com', '') },
        { username: `${cleanUsername}@gmail.com` },
      ],
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Check if account is locked
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      const waitMinutes = Math.ceil(
        (new Date(user.lockedUntil).getTime() - Date.now()) / (1000 * 60)
      );
      return NextResponse.json(
        {
          success: false,
          message: `Account is temporarily locked due to repeated failed login attempts. Please try again in ${waitMinutes} minute(s).`,
        },
        { status: 423 }
      );
    }

    // Check if active
    if (!user.active) {
      return NextResponse.json(
        { success: false, message: 'Account is deactivated. Contact an administrator.' },
        { status: 403 }
      );
    }

    // Verify password
    const isMatch = await comparePassword(password, user.passwordHash);

    if (!isMatch) {
      // Increment failed attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      // Lock if 5 consecutive failed attempts
      if (user.failedLoginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes lock
      }

      await user.save();

      const remainingAttempts = Math.max(0, 5 - user.failedLoginAttempts);
      return NextResponse.json(
        {
          success: false,
          message:
            user.failedLoginAttempts >= 5
              ? 'Account locked for 5 minutes due to too many failed attempts.'
              : `Invalid username or password. ${remainingAttempts} attempts remaining before lockout.`,
        },
        { status: 401 }
      );
    }

    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const tokenPayload = {
      userId: user._id.toString(),
      username: user.username,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    const token = signAccessToken(tokenPayload);

    // Audit log
    await createAuditLog({
      user: tokenPayload,
      action: 'SIGN_IN',
      entity: 'Auth',
      entityId: user._id.toString(),
      newValues: { username: user.username, role: user.role },
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Signed in successfully',
      token,
      user: tokenPayload,
    });

    // Set HttpOnly cookie
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

