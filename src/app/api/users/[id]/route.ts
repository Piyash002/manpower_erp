import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { hashPassword } from '@/lib/jwt';

// PUT /api/users/[id] - Update user or reset password
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, role, active, newPassword } = body;

    await connectDB();
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const oldValues = {
      name: user.name,
      role: user.role,
      active: user.active,
    };

    if (name) user.name = name.trim();
    if (role) user.role = role;
    if (typeof active === 'boolean') user.active = active;

    if (newPassword) {
      if (newPassword.length < 10) {
        return NextResponse.json(
          { success: false, message: 'New password must be at least 10 characters long' },
          { status: 400 }
        );
      }
      user.passwordHash = await hashPassword(newPassword);
    }

    await user.save();

    await createAuditLog({
      user: auth.user,
      action: newPassword ? 'USER_PASSWORD_RESET' : 'USER_UPDATED',
      entity: 'User',
      entityId: user._id.toString(),
      oldValues,
      newValues: {
        name: user.name,
        role: user.role,
        active: user.active,
        passwordReset: !!newPassword,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        active: user.active,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id] - Delete user (Cannot delete self)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;

    // Check if trying to delete self
    if (auth.user.userId === id) {
      return NextResponse.json(
        { success: false, message: 'Security restriction: An Admin cannot delete their own account.' },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    await User.findByIdAndDelete(id);

    await createAuditLog({
      user: auth.user,
      action: 'USER_DELETED',
      entity: 'User',
      entityId: id,
      oldValues: { name: user.name, username: user.username, role: user.role },
    });

    return NextResponse.json({
      success: true,
      message: `User ${user.username} deleted successfully`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}

