import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Student } from '@/models/Student';
import { Batch } from '@/models/Batch';
import { Trade } from '@/models/Trade';
import { BatchAssessment } from '@/models/BatchAssessment';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { ADMISSION_DASHBOARD_ROLES, resolveDateRange } from '@/lib/dashboard-helpers';
import { paisaToTaka } from '@/lib/accounts-money';
import { rememberCache } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ADMISSION_DASHBOARD_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const range = resolveDateRange(
      searchParams.get('range'),
      searchParams.get('startDate'),
      searchParams.get('endDate')
    );
    const trade = searchParams.get('trade')?.trim() || 'all';
    const batch = searchParams.get('batch')?.trim() || 'all';
    const search = searchParams.get('search')?.trim() || '';

    const cacheKey = `dashboard:admission:${range.preset}:${range.startIso}:${range.endIso}:${trade}:${batch}:${search}`;

    const payload = await rememberCache(cacheKey, 30, async () => {
      const baseStudentMatch: Record<string, any> = {};
      if (trade !== 'all') baseStudentMatch.trade_name = trade;
      if (batch !== 'all') baseStudentMatch.batch = batch;
      if (search) {
        baseStudentMatch.$or = [
          { name: { $regex: search, $options: 'i' } },
          { student_no: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } },
          { passport_no: { $regex: search, $options: 'i' } },
        ];
      }

    const rangedStudentMatch: Record<string, any> = {
      ...baseStudentMatch,
      admission_date: { $gte: range.startDate, $lte: range.endDate },
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const thirtyDaysLater = new Date(todayStart.getTime() + 30 * 86400000);
    const currentYear = now.getFullYear();
    const yearStart = new Date(currentYear, 0, 1, 0, 0, 0, 0);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const [
      totalCandidates,
      newAdmissionsCount,
      activeBatchesCount,
      upcomingBatches,
      recentAdmissions,
      tradeBreakdownAgg,
      countryBreakdownAgg,
      monthlyAgg,
      assessmentAgg,
      feePlanDueAgg,
      studentDueFallbackAgg,
      tradesList,
      batchesList,
    ] = await Promise.all([
      Student.countDocuments(baseStudentMatch),
      Student.countDocuments(rangedStudentMatch),
      Batch.countDocuments({ status: { $in: ['In Training', 'Upcoming'] } }),
      Batch.find({
        status: { $in: ['Upcoming', 'In Training'] },
        start_date: { $gte: todayStart, $lte: thirtyDaysLater },
      })
        .sort({ start_date: 1 })
        .limit(5)
        .select('name batch_code trade_name start_date capacity status')
        .lean(),
      Student.find(rangedStudentMatch)
        .sort({ admission_date: -1, createdAt: -1 })
        .limit(5)
        .select('student_no name trade_name batch destination_country admission_date status')
        .lean(),
      Student.aggregate<{ _id: string; count: number }>([
        { $match: baseStudentMatch },
        { $group: { _id: { $ifNull: ['$trade_name', 'Unspecified'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Student.aggregate<{ _id: string; count: number }>([
        { $match: baseStudentMatch },
        { $group: { _id: { $ifNull: ['$destination_country', 'Unspecified'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      Student.aggregate<{ _id: number; count: number }>([
        {
          $match: {
            ...baseStudentMatch,
            admission_date: { $gte: yearStart, $lte: yearEnd },
          },
        },
        { $group: { _id: { $month: '$admission_date' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      BatchAssessment.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$result_status', count: { $sum: 1 } } },
      ]),
      StudentFeePlan.aggregate<{ totalDuePaisa: number }>([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: null, totalDuePaisa: { $sum: '$totalDuePaisa' } } },
      ]),
      Student.aggregate<{ totalDue: number }>([
        { $group: { _id: null, totalDue: { $sum: { $ifNull: ['$total_due', 0] } } } },
      ]),
      Trade.find({ active: true }).select('name').sort({ name: 1 }).lean(),
      Batch.find({}).select('name batch_code trade_name').sort({ createdAt: -1 }).lean(),
    ]);

    // Count enrolled students for upcoming batches
    const upcomingBatchNames = upcomingBatches.map((b: any) => b.name);
    const enrolledAgg = upcomingBatchNames.length
      ? await Student.aggregate<{ _id: string; enrolled: number }>([
          { $match: { batch: { $in: upcomingBatchNames } } },
          { $group: { _id: '$batch', enrolled: { $sum: 1 } } },
        ])
      : [];
    const enrolledMap = new Map(enrolledAgg.map((e) => [e._id, e.enrolled]));

    const batchesStartingSoon = upcomingBatches.map((b: any) => ({
      _id: String(b._id),
      batchCode: b.batch_code,
      name: b.name,
      tradeName: b.trade_name,
      startDate: b.start_date,
      capacity: b.capacity || 30,
      enrolled: enrolledMap.get(b.name) || 0,
      status: b.status,
    }));

    // Top 5 trades, group remaining as Other
    const topTrades = tradeBreakdownAgg.slice(0, 5).map((t) => ({
      label: t._id || 'Unspecified',
      value: t.count,
    }));
    const otherTradesCount = tradeBreakdownAgg
      .slice(5)
      .reduce((sum, t) => sum + t.count, 0);
    if (otherTradesCount > 0) {
      topTrades.push({ label: 'Other Trades', value: otherTradesCount });
    }

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthMap = new Map(monthlyAgg.map((m) => [m._id, m.count]));
    const admissionsTrend = monthLabels.map((label, idx) => ({
      label,
      primary: monthMap.get(idx + 1) || 0,
    }));

    const totalDueBDT =
      feePlanDueAgg.length > 0
        ? paisaToTaka(feePlanDueAgg[0].totalDuePaisa || 0)
        : studentDueFallbackAgg[0]?.totalDue || 0;

    return {
      success: true,
      range: {
        preset: range.preset,
        label: range.label,
        startIso: range.startIso,
        endIso: range.endIso,
      },
      kpis: {
        totalCandidates,
        newAdmissions: newAdmissionsCount,
        activeBatches: activeBatchesCount,
        upcomingStarts: upcomingBatches.length,
      },
      duesAtAGlance: {
        totalDueBDT,
      },
      charts: {
        admissionsTrend,
        candidatesByTrade: topTrades,
      },
      tables: {
        recentAdmissions: recentAdmissions.map((s: any) => ({
          _id: String(s._id),
          studentNo: s.student_no,
          name: s.name,
          tradeName: s.trade_name,
          batch: s.batch,
          destinationCountry: s.destination_country,
          admissionDate: s.admission_date,
          status: s.status,
        })),
        batchesStartingSoon,
      },
      optional: {
        byCountry: countryBreakdownAgg.map((c) => ({
          country: c._id || 'Unspecified',
          count: c.count,
        })),
        assessments: assessmentAgg.map((a) => ({
          status: a._id,
          count: a.count,
        })),
      },
      filterOptions: {
        trades: tradesList.map((t: any) => t.name),
        batches: batchesList.map((b: any) => ({
          name: b.name,
          code: b.batch_code,
          trade: b.trade_name,
        })),
      },
    };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Admission dashboard API error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to load admission dashboard' },
      { status: 500 }
    );
  }
}

