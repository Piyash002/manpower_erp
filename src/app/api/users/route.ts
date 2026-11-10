import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { hashPassword } from '@/lib/jwt';

// GET /api/users - Admin only
export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const users = await User.find({})
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST /api/users - Admin creates user
export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { name, username, password, role } = await req.json();

    if (!name || !username || !password || !role) {
      return NextResponse.json(
        { success: false, message: 'All fields (name, username, password, role) are required' },
        { status: 400 }
      );
    }

    if (password.length < 10) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 10 characters long' },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();
    await connectDB();

    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Username "${cleanUsername}" is already taken` },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const newUser = await User.create({
      name: name.trim(),
      username: cleanUsername,
      passwordHash,
      role,
      active: true,
      mustChangePassword: false,
    });

    await createAuditLog({
      user: auth.user,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: newUser._id.toString(),
      newValues: { name: newUser.name, username: newUser.username, role: newUser.role },
    });

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      user: {
        _id: newUser._id,
        name: newUser.name,
        username: newUser.username,
        role: newUser.role,
        active: newUser.active,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}

