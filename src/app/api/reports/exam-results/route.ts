import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Student } from '@/models/Student';
import { Batch } from '@/models/Batch';
import { BatchAssessment } from '@/models/BatchAssessment';
import { formatDate } from '@/lib/formatters';

function csvEscape(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// GET /api/reports/exam-results - Download Batch, Trade, Country-wise Exam Results CSV
export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q')?.trim();
    const tradeId = searchParams.get('trade_id');
    const batch = searchParams.get('batch');
    const batchId = searchParams.get('batch_id');
    const country = searchParams.get('country');
    const status = searchParams.get('status');
    const sort = searchParams.get('sort') || 'batch_asc';
    const format = searchParams.get('format') || 'csv';

    const filter: any = {};
    let resolvedBatchCode = batch && batch !== 'all' ? batch : '';

    if (batchId && batchId !== 'all') {
      const batchDoc: any = await Batch.findById(batchId).lean();
      if (!batchDoc) {
        return NextResponse.json({ success: false, message: 'Batch not found' }, { status: 404 });
      }
      resolvedBatchCode = batchDoc.batch_code || batchDoc.name;
      const linkedAssessments = await BatchAssessment.find({ batch_id: batchId })
        .select('student_id')
        .lean();
      const linkedIds = linkedAssessments.map((a: any) => a.student_id);

      filter.$or = [
        { _id: { $in: linkedIds } },
        { batch: batchDoc.batch_code },
        { batch: batchDoc.name },
      ];
    } else if (batch && batch !== 'all') {
      filter.batch = batch;
    }

    if (q) {
      const searchCond = [
        { name: { $regex: q, $options: 'i' } },
        { student_no: { $regex: q, $options: 'i' } },
        { mobile: { $regex: q, $options: 'i' } },
        { passport_no: { $regex: q, $options: 'i' } },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchCond }];
        delete filter.$or;
      } else {
        filter.$or = searchCond;
      }
    }

    if (tradeId && tradeId !== 'all') filter.trade_id = tradeId;
    if (country && country !== 'all') filter.destination_country = country;
    if (status && status !== 'all') filter.status = status;

    let sortObj: any = { batch: 1, trade_name: 1, student_no: 1 };
    if (sort === 'batch_desc') sortObj = { batch: -1, student_no: 1 };
    else if (sort === 'name_asc') sortObj = { name: 1 };
    else if (sort === 'student_no_asc') sortObj = { student_no: 1 };
    else if (sort === 'newest') sortObj = { createdAt: -1 };

    const students = await Student.find(filter)
      .sort(sortObj)
      .lean();

    const studentIds = students.map((s: any) => s._id);
    const assessQuery: any = { student_id: { $in: studentIds } };
    if (batchId && batchId !== 'all') {
      assessQuery.batch_id = batchId;
    }
    const assessments = await BatchAssessment.find(assessQuery).lean();

    const assessmentMap = new Map<string, any>();
    for (const a of assessments) {
      assessmentMap.set(a.student_id.toString(), a);
    }

    const rows = students.map((st: any) => {
      const assess = assessmentMap.get(st._id.toString());
      const resultStatus =
        assess?.result_status ||
        (st.status === 'Passed' ? 'Passed' : st.status === 'Failed' ? 'Failed' : 'Pending');

      return {
        student_no: st.student_no,
        name: st.name,
        father_name: st.father_name || '',
        mobile: st.mobile,
        passport_no: st.passport_no,
        trade_name: st.trade_name,
        batch: st.batch || 'Unassigned',
        destination_country: st.destination_country,
        student_status: st.status,
        result_status: resultStatus,
        theory_score: assess?.theory_score ?? '',
        practical_score: assess?.practical_score ?? '',
        total_score: assess?.total_score ?? '',
        certificate_no: assess?.certificate_no || '',
        certificate_uploaded: assess?.certificate_url ? 'Yes' : 'No',
        exam_date: assess?.exam_date ? formatDate(assess.exam_date) : '',
        certificate_issue_date: assess?.certificate_issue_date
          ? formatDate(assess.certificate_issue_date)
          : '',
        evaluated_by: assess?.evaluated_by || '',
        remarks: assess?.remarks || '',
      };
    });

    if (format === 'json') {
      return NextResponse.json({ success: true, count: rows.length, results: rows });
    }

    const headers = [
      'Student Roll',
      'Candidate Name',
      'Father Name',
      'Mobile',
      'Passport No',
      'Trade',
      'Batch',
      'Destination Country',
      'Student Status',
      'Exam Result',
      'Theory Score',
      'Practical Score',
      'Total Score',
      'Certificate No',
      'Certificate Uploaded',
      'Exam Date',
      'Certificate Issue Date',
      'Evaluated By',
      'Remarks',
    ];

    const csvLines = [
      headers.map(csvEscape).join(','),
      ...rows.map((r) =>
        [
          csvEscape(r.student_no),
          csvEscape(r.name),
          csvEscape(r.father_name),
          csvEscape(r.mobile),
          csvEscape(r.passport_no),
          csvEscape(r.trade_name),
          csvEscape(r.batch),
          csvEscape(r.destination_country),
          csvEscape(r.student_status),
          csvEscape(r.result_status),
          csvEscape(r.theory_score),
          csvEscape(r.practical_score),
          csvEscape(r.total_score),
          csvEscape(r.certificate_no),
          csvEscape(r.certificate_uploaded),
          csvEscape(r.exam_date),
          csvEscape(r.certificate_issue_date),
          csvEscape(r.evaluated_by),
          csvEscape(r.remarks),
        ].join(',')
      ),
    ];

    const csvContent = '\uFEFF' + csvLines.join('\n');
    const batchLabel = resolvedBatchCode ? resolvedBatchCode.replace(/[^a-zA-Z0-9-_]/g, '') : 'AllBatches';
    const countryLabel = country && country !== 'all' ? country.replace(/[^a-zA-Z0-9]/g, '') : 'AllCountries';
    const filename = `Exam_Results_${batchLabel}_${countryLabel}_${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Exam result export error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate exam result report' },
      { status: 500 }
    );
  }
}

