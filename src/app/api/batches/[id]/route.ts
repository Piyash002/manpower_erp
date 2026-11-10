import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Batch } from '@/models/Batch';
import { Trade } from '@/models/Trade';
import { Student } from '@/models/Student';
import { BatchAssessment } from '@/models/BatchAssessment';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const batch = await Batch.findById(id).lean();
    if (!batch) {
      return NextResponse.json({ success: false, message: 'Batch not found' }, { status: 404 });
    }

    // 1. Fetch assessments for this batch
    const assessments = await BatchAssessment.find({ batch_id: id })
      .populate('student_id', 'name student_no mobile passport_no status trade_name destination_country')
      .lean();

    // 2. Also find students assigned by batch code who might not have an assessment document yet
    const studentsWithBatchCode = await Student.find({
      $or: [{ batch: batch.batch_code }, { batch: batch.name }],
    })
      .select('name student_no mobile passport_no status trade_name destination_country')
      .lean();

    // Merge students & ensure assessment records exist
    const enrolledMap = new Map<string, any>();

    for (const a of assessments) {
      if (a.student_id) {
        const studentObj: any = a.student_id;
        enrolledMap.set(studentObj._id.toString(), {
          _id: a._id.toString(),
          student: {
            _id: studentObj._id.toString(),
            name: studentObj.name,
            student_no: studentObj.student_no,
            mobile: studentObj.mobile,
            passport_no: studentObj.passport_no,
            status: studentObj.status,
            trade_name: studentObj.trade_name,
            destination_country: studentObj.destination_country,
          },
          exam_date: a.exam_date,
          theory_score: a.theory_score,
          practical_score: a.practical_score,
          total_score: a.total_score,
          result_status: a.result_status || 'Pending',
          certificate_no: a.certificate_no || '',
          certificate_url: a.certificate_url || '',
          certificate_issue_date: a.certificate_issue_date || null,
          remarks: a.remarks || '',
          evaluated_by: a.evaluated_by || '',
        });
      }
    }

    for (const s of studentsWithBatchCode) {
      const sId = s._id.toString();
      if (!enrolledMap.has(sId)) {
        // Create an assessment record for this student so it's consistent
        const newAssessment = await BatchAssessment.create({
          batch_id: batch._id,
          student_id: s._id,
          result_status: s.status === 'Passed' ? 'Passed' : s.status === 'Failed' ? 'Failed' : 'Pending',
        });

        enrolledMap.set(sId, {
          _id: newAssessment._id.toString(),
          student: {
            _id: s._id.toString(),
            name: s.name,
            student_no: s.student_no,
            mobile: s.mobile,
            passport_no: s.passport_no,
            status: s.status,
            trade_name: s.trade_name,
            destination_country: s.destination_country,
          },
          exam_date: null,
          theory_score: null,
          practical_score: null,
          total_score: null,
          result_status: newAssessment.result_status,
          certificate_no: '',
          certificate_url: '',
          certificate_issue_date: null,
          remarks: '',
          evaluated_by: '',
        });
      }
    }

    const trainees = Array.from(enrolledMap.values());

    // 3. Find other students enrolled in this Trade who are NOT yet in this batch (for Quick Enrollment)
    const enrolledStudentIds = Array.from(enrolledMap.keys());
    const availableTradeStudents = await Student.find({
      trade_id: batch.trade_id,
      _id: { $nin: enrolledStudentIds },
    })
      .select('name student_no mobile passport_no trade_name status batch')
      .limit(50)
      .lean();

    return NextResponse.json({
      success: true,
      batch: {
        ...batch,
        _id: batch._id.toString(),
      },
      trainees,
      availableTradeStudents,
      stats: {
        totalEnrolled: trainees.length,
        passed: trainees.filter((t) => t.result_status === 'Passed').length,
        failed: trainees.filter((t) => t.result_status === 'Failed').length,
        pending: trainees.filter((t) => t.result_status === 'Pending').length,
        certificatesIssued: trainees.filter((t) => Boolean(t.certificate_url)).length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching batch detail:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load batch detail' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, start_date, end_date, exam_date, instructor, capacity, status, notes } = body;

    await connectDB();
    const batch = await Batch.findById(id);
    if (!batch) {
      return NextResponse.json({ success: false, message: 'Batch not found' }, { status: 404 });
    }

    if (name) batch.name = name.trim();
    if (start_date) batch.start_date = new Date(start_date);
    if (end_date) batch.end_date = new Date(end_date);
    if (exam_date !== undefined) batch.exam_date = exam_date ? new Date(exam_date) : null;
    if (instructor !== undefined) batch.instructor = instructor.trim();
    if (capacity !== undefined) batch.capacity = Number(capacity);
    if (status) batch.status = status;
    if (notes !== undefined) batch.notes = notes.trim();

    await batch.save();

    await createAuditLog({
      user: auth.user,
      action: 'BATCH_UPDATED',
      entity: 'Batch',
      entityId: batch._id.toString(),
      newValues: {
        name: batch.name,
        status: batch.status,
        exam_date: batch.exam_date,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Batch updated successfully',
      batch,
    });
  } catch (error: any) {
    console.error('Error updating batch:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update batch' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const batch = await Batch.findById(id);
    if (!batch) {
      return NextResponse.json({ success: false, message: 'Batch not found' }, { status: 404 });
    }

    // Check if students are enrolled
    const assessmentCount = await BatchAssessment.countDocuments({ batch_id: id });
    if (assessmentCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete batch with ${assessmentCount} enrolled student assessments. Archive the batch instead.`,
        },
        { status: 400 }
      );
    }

    await Batch.findByIdAndDelete(id);

    await createAuditLog({
      user: auth.user,
      action: 'BATCH_DELETED',
      entity: 'Batch',
      entityId: id,
      newValues: { name: batch.name, batch_code: batch.batch_code },
    });

    return NextResponse.json({
      success: true,
      message: `Batch "${batch.name}" deleted successfully.`,
    });
  } catch (error: any) {
    console.error('Error deleting batch:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete batch' },
      { status: 500 }
    );
  }
}

