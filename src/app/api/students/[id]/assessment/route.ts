import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Student } from '@/models/Student';
import { Batch } from '@/models/Batch';
import { BatchAssessment } from '@/models/BatchAssessment';

// GET /api/students/[id]/assessment - Get student assessment
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    await connectDB();

    const student = await Student.findById(id).select('name student_no batch trade_name status');
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    const assessment = await BatchAssessment.findOne({ student_id: id }).populate('batch_id', 'name batch_code trade_name exam_date');

    return NextResponse.json({
      success: true,
      assessment,
      student,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch assessment' },
      { status: 500 }
    );
  }
}

// PUT /api/students/[id]/assessment - Update individual exam result, pass/fail status & certificate
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    const body = await req.json();

    await connectDB();
    const student = await Student.findById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    // Find the batch for this student (matching student's batch or trade only — never an unrelated trade's batch)
    let batch = null;
    if (body.batch_id) {
      batch = await Batch.findById(body.batch_id);
      if (batch && batch.trade_id?.toString() !== student.trade_id?.toString()) {
        return NextResponse.json(
          {
            success: false,
            message: `Selected batch (${batch.batch_code}) belongs to trade ${batch.trade_name}, not ${student.trade_name}.`,
          },
          { status: 400 }
        );
      }
    } else if (student.batch) {
      batch = await Batch.findOne({
        $or: [{ batch_code: student.batch }, { name: student.batch }],
      });
    }

    if (!batch && student.trade_id) {
      batch = await Batch.findOne({ trade_id: student.trade_id }).sort({ start_date: -1 });
    }

    if (!batch) {
      return NextResponse.json(
        {
          success: false,
          message: `No training batch exists for trade "${student.trade_name}". Please create or assign a batch for this trade before grading.`,
        },
        { status: 400 }
      );
    }

    // Align student batch string if it wasn't matching a real batch yet
    if (student.batch !== batch.batch_code && (!student.batch || student.batch.startsWith('B-'))) {
      student.batch = batch.batch_code;
    }

    // Compute theory and practical scores
    const theoryScore =
      body.theory_score !== undefined && body.theory_score !== '' && body.theory_score !== null
        ? Number(body.theory_score)
        : null;

    const practicalScore =
      body.practical_score !== undefined && body.practical_score !== '' && body.practical_score !== null
        ? Number(body.practical_score)
        : null;

    let totalScore = null;
    if (theoryScore !== null && practicalScore !== null) {
      totalScore = Math.round((theoryScore + practicalScore) / 2);
    } else if (body.total_score !== undefined && body.total_score !== null && body.total_score !== '') {
      totalScore = Number(body.total_score);
    }

    // Determine result status
    let resultStatus = body.result_status || 'Pending';
    if (!body.result_status) {
      if (theoryScore !== null && practicalScore !== null) {
        resultStatus = theoryScore >= 40 && practicalScore >= 40 ? 'Passed' : 'Failed';
      }
    }

    // Upsert BatchAssessment
    let assessment = await BatchAssessment.findOne({ student_id: id });
    const isNew = !assessment;

    if (!assessment) {
      assessment = new BatchAssessment({
        batch_id: batch._id,
        student_id: student._id,
      });
    } else if (batch) {
      assessment.batch_id = batch._id;
    }

    assessment.exam_date = body.exam_date ? new Date(body.exam_date) : (batch.exam_date || null);
    assessment.theory_score = theoryScore;
    assessment.practical_score = practicalScore;
    assessment.total_score = totalScore;
    assessment.result_status = resultStatus;

    if (body.certificate_no !== undefined) assessment.certificate_no = body.certificate_no.trim();
    if (body.certificate_url !== undefined) assessment.certificate_url = body.certificate_url.trim();
    if (body.certificate_issue_date !== undefined) {
      assessment.certificate_issue_date = body.certificate_issue_date
        ? new Date(body.certificate_issue_date)
        : null;
    }
    if (body.remarks !== undefined) assessment.remarks = body.remarks.trim();
    if (body.evaluated_by !== undefined) {
      assessment.evaluated_by = body.evaluated_by ? body.evaluated_by.trim() : auth.user.name;
    } else if (!assessment.evaluated_by) {
      assessment.evaluated_by = auth.user.name;
    }

    await assessment.save();

    // Sync result status back to student profile cleanly (including reverting Pending -> Active)
    if (body.sync_student_status !== false) {
      if (resultStatus === 'Passed') {
        student.status = 'Passed';
      } else if (resultStatus === 'Failed') {
        student.status = 'Failed';
      } else if (
        resultStatus === 'Pending' &&
        (student.status === 'Passed' || student.status === 'Failed')
      ) {
        student.status = 'Active';
      }
      await student.save();
    }

    await createAuditLog({
      user: auth.user,
      action: isNew ? 'STUDENT_ASSESSMENT_CREATED' : 'STUDENT_ASSESSMENT_UPDATED',
      entity: 'BatchAssessment',
      entityId: assessment._id.toString(),
      newValues: {
        student_no: student.student_no,
        result_status: assessment.result_status,
        theory_score: assessment.theory_score,
        practical_score: assessment.practical_score,
        total_score: assessment.total_score,
        certificate_no: assessment.certificate_no,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Student exam result & certificate saved successfully',
      assessment,
      studentStatus: student.status,
    });
  } catch (error: any) {
    console.error('Error updating assessment:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update assessment' },
      { status: 500 }
    );
  }
}

