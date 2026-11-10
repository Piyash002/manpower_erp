import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { AttendanceCorrection } from '@/models/AttendanceCorrection';
import { DailyAttendance } from '@/models/DailyAttendance';
import {
  getDhakaDateString,
  normalizeDhakaDate,
  parseDhakaTimeOnDate,
  recomputeDailyAttendance,
  replaceManualPunchesForDate,
} from '@/lib/attendance-engine';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const myEmp = await Employee.findOne({ userId: auth.user.userId }).lean();
    const filter: Record<string, any> = {};

    if (auth.user.role !== 'Admin') {
      if (!myEmp) {
        return NextResponse.json({ success: true, data: [] });
      }
      // Check if user is a manager of direct reports
      const team = await Employee.find({ manager_id: myEmp._id }).select('_id').lean();
      if (team.length > 0) {
        filter.employee_id = { $in: [myEmp._id, ...team.map((t) => t._id)] };
      } else {
        filter.employee_id = myEmp._id;
      }
    }

    if (status && status !== 'all') filter.status = status;

    const corrections = await AttendanceCorrection.find(filter)
      .populate('employee_id', 'employee_id firstName lastName department designation manager_id')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: corrections,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load corrections' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    await connectDB();

    const emp =
      body.employee_id && auth.user.role === 'Admin'
        ? await Employee.findById(body.employee_id)
        : await Employee.findOne({ userId: auth.user.userId });

    if (!emp) {
      return NextResponse.json(
        { success: false, message: 'No Employee profile linked to your user.' },
        { status: 404 }
      );
    }

    if (!body.date || !body.reason?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Date and reason are required.' },
        { status: 400 }
      );
    }

    const { dateObj, dateString } = normalizeDhakaDate(body.date);
    const reqIn = body.requested_in_time
      ? parseDhakaTimeOnDate(dateString, body.requested_in_time)
      : null;
    const reqOut = body.requested_out_time
      ? parseDhakaTimeOnDate(dateString, body.requested_out_time)
      : null;

    if (!reqIn && !reqOut) {
      return NextResponse.json(
        { success: false, message: 'Provide at least requested Check-In or Check-Out time.' },
        { status: 400 }
      );
    }

    const correction = await AttendanceCorrection.create({
      employee_id: emp._id,
      date: dateObj,
      requested_in: reqIn,
      requested_out: reqOut,
      reason: body.reason.trim(),
      status: 'Pending',
    });

    await createAuditLog({
      user: auth.user,
      action: 'ATTENDANCE_CORRECTION_REQUESTED',
      entity: 'AttendanceCorrection',
      entityId: correction._id.toString(),
      newValues: { employee_id: emp.employee_id, date: dateString, reason: correction.reason },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Correction request submitted for approval.',
        data: correction,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to submit correction' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    if (!body.correction_id || !['Approved', 'Rejected'].includes(body.status)) {
      return NextResponse.json(
        { success: false, message: 'correction_id and status (Approved/Rejected) are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    const correction = await AttendanceCorrection.findById(body.correction_id);
    if (!correction) {
      return NextResponse.json({ success: false, message: 'Correction request not found' }, { status: 404 });
    }

    if (auth.user.role !== 'Admin') {
      // Allow team manager if employee's manager_id matches
      const myEmp = await Employee.findOne({ userId: auth.user.userId }).lean();
      const targetEmp = await Employee.findById(correction.employee_id).lean();
      const isManager =
        myEmp && targetEmp?.manager_id && targetEmp.manager_id.toString() === myEmp._id.toString();
      if (!isManager) {
        return NextResponse.json(
          { success: false, message: 'Forbidden. Only HR/Admin or reporting Manager can review.' },
          { status: 403 }
        );
      }
    }

    if (correction.status !== 'Pending') {
      return NextResponse.json(
        { success: false, message: `Correction is already ${correction.status}.` },
        { status: 400 }
      );
    }

    if (body.status === 'Approved') {
      const dateStr = getDhakaDateString(new Date(correction.date));
      const { dateObj } = normalizeDhakaDate(dateStr);

      const existingDaily = await DailyAttendance.findOne({
        employee_id: correction.employee_id,
        date: dateObj,
      }).lean();
      if (existingDaily?.locked) {
        return NextResponse.json(
          { success: false, message: `Attendance for ${dateStr} is locked by confirmed payroll.` },
          { status: 400 }
        );
      }

      await replaceManualPunchesForDate({
        employeeId: correction.employee_id.toString(),
        dateStr,
        inTimestamp: correction.requested_in || null,
        outTimestamp: correction.requested_out || null,
        clearExistingManual: true,
        reason: `Correction approved: ${correction.reason}`,
        recordedBy: auth.user.name,
      });

      await recomputeDailyAttendance(correction.employee_id.toString(), dateStr, {
        preferredSource: 'Manual',
      });
    }

    correction.status = body.status;
    correction.reviewed_by = auth.user.name;
    correction.reviewed_at = new Date();
    correction.review_note = body.review_note?.trim() || '';
    await correction.save();

    await createAuditLog({
      user: auth.user,
      action: `ATTENDANCE_CORRECTION_${body.status.toUpperCase()}`,
      entity: 'AttendanceCorrection',
      entityId: correction._id.toString(),
      newValues: { status: correction.status, review_note: correction.review_note },
    });

    return NextResponse.json({
      success: true,
      message: `Correction request ${correction.status.toLowerCase()}.`,
      data: correction,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to review correction' },
      { status: 500 }
    );
  }
}

