import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

export async function GET(req: NextRequest) {
  try {
    const userSession = getCurrentUser(req);
    if (!userSession) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();
    const user = await User.findById(userSession.userId).select('-passwordHash');
    if (!user || !user.active) {
      return NextResponse.json(
        { success: false, message: 'User account not found or deactivated' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        userId: user._id.toString(),
        name: user.name,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Error fetching user profile' },
      { status: 500 }
    );
  }
}

