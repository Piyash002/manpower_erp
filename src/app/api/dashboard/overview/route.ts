import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { getAllowedDashboards } from '@/lib/dashboard-helpers';
import { Student } from '@/models/Student';
import { Batch } from '@/models/Batch';
import { Employee } from '@/models/Employee';
import { DailyAttendance } from '@/models/DailyAttendance';
import { PayslipBatch } from '@/models/PayslipBatch';
import { Account } from '@/models/Account';
import { JournalLine } from '@/models/JournalLine';
import { MoneyReceipt } from '@/models/MoneyReceipt';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { paisaToTaka } from '@/lib/accounts-money';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const allowed = getAllowedDashboards(auth.user.role);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    const result: Record<string, any> = {};

    if (allowed.includes('admission')) {
      const [totalCandidates, newThisMonth, activeBatches] = await Promise.all([
        Student.countDocuments({}),
        Student.countDocuments({ admission_date: { $gte: monthStart, $lte: now } }),
        Batch.countDocuments({ status: { $in: ['Upcoming', 'In Training'] } }),
      ]);
      result.admission = {
        href: '/admission/dashboard',
        metrics: [
          { label: 'Total Candidates', value: totalCandidates },
          { label: 'New This Month', value: newThisMonth },
          { label: 'Active Batches', value: activeBatches },
        ],
      };
    }

    if (allowed.includes('hrm')) {
      const [totalEmployees, presentToday, latestBatch] = await Promise.all([
        Employee.countDocuments({ is_deleted: { $ne: true }, status: { $in: ['Active', 'On Leave'] } }),
        DailyAttendance.countDocuments({
          date: { $gte: todayStart, $lte: todayEnd },
          status: { $in: ['Present', 'Late', 'Half-day'] },
        }),
        PayslipBatch.findOne({ status: { $ne: 'Cancelled' } })
          .sort({ year: -1, month: -1, createdAt: -1 })
          .select('status batch_code')
          .lean(),
      ]);
      result.hrm = {
        href: '/hrm/dashboard',
        metrics: [
          { label: 'Active Employees', value: totalEmployees },
          { label: 'Present Today', value: presentToday },
          { label: 'Latest Payroll', value: (latestBatch as any)?.status || 'No Runs' },
        ],
      };
    }

    if (allowed.includes('accounts')) {
      const [cashAccounts, collectionsAgg, dueAgg] = await Promise.all([
        Account.find({
          code: { $in: ['1110', '1120', '1130', '1140', '1150', '1210'] },
          isGroup: false,
          isDeleted: { $ne: true },
        })
          .select('_id code')
          .lean(),
        MoneyReceipt.aggregate<{ totalPaisa: number }>([
          {
            $match: {
              status: 'Posted',
              isDeleted: { $ne: true },
              receiptDate: { $gte: monthStart, $lte: now },
            },
          },
          { $group: { _id: null, totalPaisa: { $sum: '$amountPaisa' } } },
        ]),
        StudentFeePlan.aggregate<{ totalDuePaisa: number }>([
          { $match: { isDeleted: { $ne: true }, totalDuePaisa: { $gt: 0 } } },
          { $group: { _id: null, totalDuePaisa: { $sum: '$totalDuePaisa' } } },
        ]),
      ]);

      const cashIds = cashAccounts.filter((a: any) => a.code !== '1210').map((a: any) => a._id);
      const cashAgg = cashIds.length
        ? await JournalLine.aggregate<{ netPaisa: number }>([
            {
              $lookup: {
                from: 'journalentries',
                localField: 'entryId',
                foreignField: '_id',
                as: 'entry',
              },
            },
            { $unwind: '$entry' },
            {
              $match: {
                accountId: { $in: cashIds },
                'entry.status': 'Posted',
                'entry.isDeleted': false,
              },
            },
            {
              $group: {
                _id: null,
                netPaisa: { $sum: { $subtract: ['$debitPaisa', '$creditPaisa'] } },
              },
            },
          ])
        : [];

      result.accounts = {
        href: '/accounts/dashboard',
        metrics: [
          {
            label: 'Cash & Bank',
            valueBDT: paisaToTaka(cashAgg[0]?.netPaisa || 0),
          },
          {
            label: 'Collections (Month)',
            valueBDT: paisaToTaka(collectionsAgg[0]?.totalPaisa || 0),
          },
          {
            label: 'Student Dues',
            valueBDT: paisaToTaka(dueAgg[0]?.totalDuePaisa || 0),
          },
        ],
      };
    }

    return NextResponse.json({
      success: true,
      allowed,
      sections: result,
    });
  } catch (error: any) {
    console.error('Overview dashboard API error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to load overview' },
      { status: 500 }
    );
  }
}

