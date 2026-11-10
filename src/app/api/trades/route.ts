import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Trade } from '@/models/Trade';
import { seedDatabase } from '@/lib/seed';

// GET /api/trades
export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await seedDatabase();

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active') === 'true';

    const filter: any = {};
    if (activeOnly) {
      filter.active = true;
    }

    const trades = await Trade.find(filter).sort({ name: 1 });

    return NextResponse.json({
      success: true,
      trades,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}

// POST /api/trades - Admin only
export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { name, course_days, admission_fee, course_fee, active } = await req.json();

    if (!name || course_days === undefined || admission_fee === undefined || course_fee === undefined) {
      return NextResponse.json(
        { success: false, message: 'Missing required trade fields' },
        { status: 400 }
      );
    }

    await connectDB();

    const existing = await Trade.findOne({ name: name.trim() });
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Trade with name "${name}" already exists` },
        { status: 409 }
      );
    }

    const trade = await Trade.create({
      name: name.trim(),
      course_days: Number(course_days),
      admission_fee: Math.round(Number(admission_fee)),
      course_fee: Math.round(Number(course_fee)),
      active: active !== undefined ? Boolean(active) : true,
    });

    await createAuditLog({
      user: auth.user,
      action: 'TRADE_CREATED',
      entity: 'Trade',
      entityId: trade._id.toString(),
      newValues: trade.toJSON(),
    });

    return NextResponse.json({
      success: true,
      message: 'Trade created successfully',
      trade,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create trade' },
      { status: 500 }
    );
  }
}

