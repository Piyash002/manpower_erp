import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Batch } from '@/models/Batch';
import { Trade } from '@/models/Trade';
import { Student } from '@/models/Student';
import { BatchAssessment } from '@/models/BatchAssessment';
import { Employee } from '@/models/Employee';
import { rememberCache, delCachePattern } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim() || 'all';
    const trade_id = searchParams.get('trade_id')?.trim() || 'all';

    const cacheKey = `master:batches:${status}:${trade_id}:${search}`;

    const enrichedBatches = await rememberCache(cacheKey, 60, async () => {
      const query: any = {};
      if (status !== 'all') {
        query.status = status;
      }
      if (trade_id !== 'all') {
        query.trade_id = trade_id;
      }
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [{ name: searchRegex }, { batch_code: searchRegex }, { instructor: searchRegex }];
      }

      const batches = await Batch.find(query)
        .populate('instructor_id', 'employee_id firstName lastName designation department')
        .sort({ start_date: -1 })
        .lean();

      // Enrich each batch with deduplicated, synchronized trainee statistics
      return await Promise.all(
        batches.map(async (batch: any) => {
          const batchId = batch._id;

          const [assessments, studentsByBatch] = await Promise.all([
            BatchAssessment.find({ batch_id: batchId }).lean(),
            Student.find({
              $or: [{ batch: batch.batch_code }, { batch: batch.name }],
            })
              .select('_id status')
              .lean(),
          ]);

          const enrolledIds = new Set<string>();
          const assessmentByStudent = new Map<string, any>();

          for (const s of studentsByBatch) {
            enrolledIds.add(s._id.toString());
          }
          for (const a of assessments) {
            const sid = a.student_id?.toString();
            if (sid) {
              assessmentByStudent.set(sid, a);
              enrolledIds.add(sid);
            }
          }

          // Verify all IDs in assessmentByStudent exist in Student collection (skip orphaned rows)
          if (assessmentByStudent.size > 0) {
            const validStudentRows = await Student.find({
              _id: { $in: Array.from(enrolledIds) },
            })
              .select('_id')
              .lean();
            const validSet = new Set(validStudentRows.map((v) => v._id.toString()));
            for (const sid of Array.from(enrolledIds)) {
              if (!validSet.has(sid)) enrolledIds.delete(sid);
            }
          }

          let passedCount = 0;
          let failedCount = 0;
          let certificatesCount = 0;
          for (const sid of enrolledIds) {
            const a = assessmentByStudent.get(sid);
            if (a?.result_status === 'Passed') passedCount++;
            else if (a?.result_status === 'Failed') failedCount++;
            if (a?.certificate_url) certificatesCount++;
          }
          const totalEnrolled = enrolledIds.size;

          return {
            ...batch,
            _id: batch._id.toString(),
            stats: {
              totalEnrolled,
              passedCount,
              failedCount,
              pendingCount: Math.max(0, totalEnrolled - passedCount - failedCount),
              certificatesCount,
            },
          };
        })
      );
    });

    return NextResponse.json({
      success: true,
      batches: enrichedBatches,
    });
  } catch (error: any) {
    console.error('Error fetching batches:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch batches' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const {
      name,
      batch_code,
      trade_id,
      start_date,
      end_date,
      exam_date,
      instructor_id,
      instructor,
      capacity,
      status,
      notes,
    } = body;

    if (!name || !batch_code || !trade_id || !start_date || !end_date) {
      return NextResponse.json(
        {
          success: false,
          message: 'Batch Name, Batch Code, Trade, Start Date, and End Date are required.',
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Check duplicate batch_code
    const cleanCode = batch_code.trim().toUpperCase();
    const existing = await Batch.findOne({ batch_code: cleanCode });
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Batch Code "${cleanCode}" already exists. Please choose another code.` },
        { status: 400 }
      );
    }

    // Verify Trade
    const trade = await Trade.findById(trade_id);
    if (!trade) {
      return NextResponse.json({ success: false, message: 'Selected trade was not found.' }, { status: 404 });
    }

    let resolvedInstructorId: any = null;
    let resolvedInstructorName = instructor ? instructor.trim() : '';
    if (instructor_id && instructor_id !== '') {
      const emp = await Employee.findById(instructor_id).select('firstName lastName');
      if (emp) {
        resolvedInstructorId = emp._id;
        resolvedInstructorName = `${emp.firstName} ${emp.lastName}`;
      }
    }

    const newBatch = await Batch.create({
      name: name.trim(),
      batch_code: cleanCode,
      trade_id: trade._id,
      trade_name: trade.name,
      start_date: new Date(start_date),
      end_date: new Date(end_date),
      exam_date: exam_date ? new Date(exam_date) : null,
      instructor_id: resolvedInstructorId,
      instructor: resolvedInstructorName,
      capacity: capacity ? Number(capacity) : 30,
      status: status || 'Upcoming',
      notes: notes ? notes.trim() : '',
      created_by: auth.user.name,
    });

    await createAuditLog({
      user: auth.user,
      action: 'BATCH_CREATED',
      entity: 'Batch',
      entityId: newBatch._id.toString(),
      newValues: {
        name: newBatch.name,
        batch_code: newBatch.batch_code,
        trade_name: trade.name,
        start_date: newBatch.start_date,
        end_date: newBatch.end_date,
      },
    });

    await delCachePattern('master:batches*');

    return NextResponse.json({
      success: true,
      message: `Batch "${newBatch.name}" (${newBatch.batch_code}) created successfully.`,
      batch: newBatch,
    });
  } catch (error: any) {
    console.error('Error creating batch:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create batch' },
      { status: 500 }
    );
  }
}

