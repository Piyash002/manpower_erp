import { NextRequest, NextResponse } from 'next/server';
import { ACCOUNTS_READ_ROLES, badRequestResponse, requireAccountsAuth } from '@/lib/accounts-auth';
import { getAccountLedger } from '@/lib/accounts-engine';
import { paisaToTaka } from '@/lib/accounts-money';
import { buildCsvString, buildXlsxBuffer } from '@/lib/export-utils';
import { formatDateDMY } from '@/lib/formatters';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId')?.trim();
    const startDate = searchParams.get('startDate')?.trim() || undefined;
    const endDate = searchParams.get('endDate')?.trim() || undefined;
    const branch = searchParams.get('branch')?.trim() || 'all';
    const department = searchParams.get('department')?.trim() || 'all';
    const exportFmt = searchParams.get('export');

    if (!accountId) {
      return badRequestResponse('accountId query parameter is required.');
    }

    const ledger = await getAccountLedger({ accountId, startDate, endDate, branch, department });

    if (exportFmt === 'csv' || exportFmt === 'xlsx') {
      const headers = [
        'Date',
        'Voucher No',
        'Type',
        'Branch',
        'Department',
        'Description',
        'Debit (BDT)',
        'Credit (BDT)',
        'Running Balance (BDT)',
      ];
      const rows = [
        [
          startDate ? formatDateDMY(startDate) : '-',
          'OPENING',
          '-',
          branch === 'all' ? 'All' : branch,
          department === 'all' ? 'All' : department,
          'Opening Balance',
          0,
          0,
          paisaToTaka(ledger.openingBalancePaisa),
        ],
        ...ledger.rows.map((r) => [
          formatDateDMY(r.entryDate),
          r.voucherNo,
          r.journalType,
          r.branch,
          r.department,
          r.description,
          paisaToTaka(r.debitPaisa),
          paisaToTaka(r.creditPaisa),
          paisaToTaka(r.runningBalancePaisa),
        ]),
      ];

      if (exportFmt === 'xlsx') {
        const xlsx = buildXlsxBuffer(`GL ${ledger.account.code}`, headers, rows);
        return new NextResponse(new Uint8Array(xlsx), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="Ledger_${ledger.account.code}.xlsx"`,
          },
        });
      }

      const csv = buildCsvString(headers, rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Ledger_${ledger.account.code}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: ledger });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load General Ledger' },
      { status: 500 }
    );
  }
}

