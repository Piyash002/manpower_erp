import { NextRequest, NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { FiscalYear } from '@/models/FiscalYear';
import { ensureAccountsSeeded, ensureFiscalYearWithPeriods } from '@/lib/accounts-seed';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_READ_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { createFiscalYearSchema } from '@/lib/accounts-validators';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    const years = await FiscalYear.find({ isDeleted: { $ne: true } })
      .sort({ startDate: -1 })
      .lean();
    return NextResponse.json({ success: true, data: years });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load fiscal years' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_ADMIN_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const raw = await req.json();
    const parsed = createFiscalYearSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Valid year required');
    }

    await connectDB();
    await ensureAccountsSeeded();

    const existing = await FiscalYear.findOne({
      code: `FY${parsed.data.year}`,
      isDeleted: { $ne: true },
    }).lean();
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Fiscal Year FY${parsed.data.year} already exists.` },
        { status: 409 }
      );
    }

    const fy = await ensureFiscalYearWithPeriods(parsed.data.year, auth.user.name);

    await createAuditLog({
      user: auth.user,
      action: 'FISCAL_YEAR_CREATED',
      entity: 'FiscalYear',
      entityId: fy._id.toString(),
      newValues: { code: fy.code, name: fy.name, status: fy.status },
    });

    return NextResponse.json(
      { success: true, message: `Fiscal Year ${fy.code} with 12 monthly periods created.`, data: fy },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create fiscal year' },
      { status: 500 }
    );
  }
}

