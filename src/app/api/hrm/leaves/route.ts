import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Leave, LeaveStatus, LeaveType } from '@/models/Leave';
import { Employee } from '@/models/Employee';

interface LeavePostBody {
  employee_id?: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason?: string;
}

interface LeavePutBody {
  leave_id: string;
  status: LeaveStatus;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const filter: Record<string, any> = {};
    if (status && status !== 'all') filter.status = status;

    if (auth.user.role !== 'Admin') {
      const myEmp = await Employee.findOne({ userId: auth.user.userId }).select('_id').lean();
      if (!myEmp) {
        return NextResponse.json({ success: true, data: [] });
      }
      filter.employee_id = myEmp._id;
    }

    const leaves = await Leave.find(filter)
      .populate('employee_id', 'employee_id firstName lastName department designation')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: leaves,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch leave requests' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as LeavePostBody;
    await connectDB();

    const targetEmployee =
      body.employee_id && auth.user.role === 'Admin'
        ? await Employee.findById(body.employee_id)
        : await Employee.findOne({ userId: auth.user.userId });

    if (!targetEmployee) {
      return NextResponse.json(
        {
          success: false,
          message: 'No linked Employee record found for this user.',
        },
        { status: 404 }
      );
    }

    if (!body.start_date || !body.end_date || !body.leave_type) {
      return NextResponse.json(
        { success: false, message: 'Leave type, start date, and end date are required.' },
        { status: 400 }
      );
    }

    const start = new Date(body.start_date);
    const end = new Date(body.end_date);
    if (end < start) {
      return NextResponse.json(
        { success: false, message: 'End date cannot be earlier than start date.' },
        { status: 400 }
      );
    }

    const leave = await Leave.create({
      employee_id: targetEmployee._id,
      leave_type: body.leave_type,
      start_date: start,
      end_date: end,
      reason: body.reason?.trim() || '',
      status: 'Pending',
    });

    await createAuditLog({
      user: auth.user,
      action: 'LEAVE_REQUESTED',
      entity: 'Leave',
      entityId: leave._id.toString(),
      newValues: {
        employee_id: targetEmployee.employee_id,
        leave_type: leave.leave_type,
        start_date: leave.start_date,
        end_date: leave.end_date,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Leave request submitted successfully.',
        data: leave,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to submit leave request' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as LeavePutBody;
    if (!body.leave_id || !['Pending', 'Approved', 'Rejected'].includes(body.status)) {
      return NextResponse.json(
        { success: false, message: 'Valid leave_id and status are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    const leave = await Leave.findById(body.leave_id);
    if (!leave) {
      return NextResponse.json({ success: false, message: 'Leave record not found.' }, { status: 404 });
    }

    const oldStatus = leave.status;
    leave.status = body.status;
    leave.reviewed_by = auth.user.name;
    leave.reviewed_at = new Date();
    await leave.save();

    await createAuditLog({
      user: auth.user,
      action: 'LEAVE_STATUS_UPDATED',
      entity: 'Leave',
      entityId: leave._id.toString(),
      oldValues: { status: oldStatus },
      newValues: { status: leave.status, reviewed_by: leave.reviewed_by },
    });

    return NextResponse.json({
      success: true,
      message: `Leave request marked as ${leave.status}.`,
      data: leave,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update leave status' },
      { status: 500 }
    );
  }
}

