import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Payment } from '@/models/Payment';
import { Student } from '@/models/Student';
import { formatDate } from '@/lib/formatters';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const trade = searchParams.get('trade');
    const batch = searchParams.get('batch');
    const month = searchParams.get('month'); // e.g. '01' to '12' or '2026-01'
    const year = searchParams.get('year') || '2026';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const reportType = searchParams.get('reportType') || 'transactions'; // 'transactions' | 'trade_batch_summary' | 'candidate_dues'
    const format = searchParams.get('format') || 'csv';

    // 1. Build Student Filter for Trade and Batch
    const studentFilter: any = {};
    if (trade && trade !== 'all') studentFilter.trade_name = trade;
    if (batch && batch !== 'all') studentFilter.batch = batch;

    // Fetch matching students
    const matchingStudents = await Student.find(studentFilter).select(
      'name student_no mobile passport_no trade_name batch total_fee total_paid total_due admission_date status fee_snapshot'
    ).lean();

    const studentMap = new Map();
    const studentIds: any[] = [];
    matchingStudents.forEach((st: any) => {
      studentMap.set(st._id.toString(), st);
      studentIds.push(st._id);
    });

    // 2. Build Payment Filter
    const paymentFilter: any = {
      student_id: { $in: studentIds },
    };

    if (startDate || endDate) {
      paymentFilter.payment_date = {};
      if (startDate) paymentFilter.payment_date.$gte = new Date(startDate);
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        paymentFilter.payment_date.$lte = eDate;
      }
    } else if (month && month !== 'all') {
      // Month could be '1' to '12' or '2026-05'
      let mNum = parseInt(month, 10);
      let yNum = parseInt(year, 10);
      if (month.includes('-')) {
        const parts = month.split('-');
        yNum = parseInt(parts[0], 10);
        mNum = parseInt(parts[1], 10);
      }
      const mStart = new Date(yNum, mNum - 1, 1);
      const mEnd = new Date(yNum, mNum, 0, 23, 59, 59, 999);
      paymentFilter.payment_date = { $gte: mStart, $lte: mEnd };
    } else if (year && year !== 'all') {
      const yNum = parseInt(year, 10);
      paymentFilter.payment_date = {
        $gte: new Date(yNum, 0, 1),
        $lte: new Date(yNum, 11, 31, 23, 59, 59, 999),
      };
    }

    if (reportType === 'transactions') {
      // Monthly / Periodic Payment Transactions
      const payments = await Payment.find(paymentFilter)
        .sort({ payment_date: -1 })
        .lean();

      const rows = payments.map((pmt: any) => {
        const st = studentMap.get(pmt.student_id?.toString()) || {};
        const pDate = new Date(pmt.payment_date);
        const monthYear = pDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

        return {
          receipt_no: pmt.receipt_no,
          payment_date: pDate.toISOString().split('T')[0],
          month_year: monthYear,
          student_no: st.student_no || 'N/A',
          student_name: st.name || 'N/A',
          mobile: st.mobile || 'N/A',
          trade: st.trade_name || 'N/A',
          batch: st.batch || 'N/A',
          amount: pmt.amount || 0,
          method: pmt.method || 'Cash',
          reference: pmt.reference || '',
          received_by: pmt.created_by || 'System',
          note: pmt.note || '',
        };
      });

      if (format === 'json') {
        return NextResponse.json({ success: true, count: rows.length, data: rows });
      }

      // Generate CSV
      const headers = [
        'Receipt No',
        'Payment Date',
        'Month',
        'Student ID',
        'Candidate Name',
        'Mobile',
        'Trade',
        'Batch',
        'Amount (BDT)',
        'Payment Method',
        'Reference No',
        'Received By',
        'Note',
      ];

      const csvLines = [
        headers.join(','),
        ...rows.map((r) =>
          [
            `"${r.receipt_no}"`,
            `"${r.payment_date}"`,
            `"${r.month_year}"`,
            `"${r.student_no}"`,
            `"${r.student_name}"`,
            `"${r.mobile}"`,
            `"${r.trade}"`,
            `"${r.batch}"`,
            r.amount,
            `"${r.method}"`,
            `"${r.reference}"`,
            `"${r.received_by}"`,
            `"${r.note}"`,
          ].join(',')
        ),
      ];

      const csvContent = csvLines.join('\n');
      const filename = `Monthly_Payment_Report_${trade || 'AllTrades'}_${batch || 'AllBatches'}_${Date.now()}.csv`;

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    if (reportType === 'trade_batch_summary') {
      // Group by Trade and Batch
      const summaryMap: Record<
        string,
        {
          trade: string;
          batch: string;
          candidates: number;
          totalFee: number;
          totalPaid: number;
          totalDue: number;
        }
      > = {};

      matchingStudents.forEach((st: any) => {
        const key = `${st.trade_name || 'General'}___${st.batch || 'Unassigned'}`;
        if (!summaryMap[key]) {
          summaryMap[key] = {
            trade: st.trade_name || 'General',
            batch: st.batch || 'Unassigned',
            candidates: 0,
            totalFee: 0,
            totalPaid: 0,
            totalDue: 0,
          };
        }
        const studentFee = st.fee_snapshot?.total_payable || ((st.total_paid || 0) + (st.total_due || 0));
        summaryMap[key].candidates += 1;
        summaryMap[key].totalFee += studentFee;
        summaryMap[key].totalPaid += st.total_paid || 0;
        summaryMap[key].totalDue += st.total_due || 0;
      });

      const summaryList = Object.values(summaryMap).sort((a, b) => b.totalPaid - a.totalPaid);

      if (format === 'json') {
        return NextResponse.json({ success: true, count: summaryList.length, data: summaryList });
      }

      const headers = [
        'Trade Name',
        'Batch Code',
        'Total Candidates',
        'Total Package Fee (BDT)',
        'Total Collected (BDT)',
        'Total Due Balance (BDT)',
        'Collection Rate (%)',
      ];

      const csvLines = [
        headers.join(','),
        ...summaryList.map((s) => {
          const rate = s.totalFee > 0 ? ((s.totalPaid / s.totalFee) * 100).toFixed(1) : '0.0';
          return [
            `"${s.trade}"`,
            `"${s.batch}"`,
            s.candidates,
            s.totalFee,
            s.totalPaid,
            s.totalDue,
            `"${rate}%"`,
          ].join(',');
        }),
      ];

      const csvContent = csvLines.join('\n');
      const filename = `Trade_Batch_Payment_Summary_${Date.now()}.csv`;

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid report type' }, { status: 400 });
  } catch (error: any) {
    console.error('Report error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate payment report' },
      { status: 500 }
    );
  }
}
