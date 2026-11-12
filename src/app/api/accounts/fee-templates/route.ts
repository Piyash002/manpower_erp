import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAuditLog, requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { FeeTemplate } from '@/models/FeeTemplate';
import { Trade } from '@/models/Trade';
import {
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';

const stageSchema = z.object({
  stageCode: z.enum([
    'BOOKING',
    'MEDICAL_TRAINING',
    'VISA_PROCESSING',
    'TICKET',
    'SERVICE_CHARGE',
    'FINAL',
    'OTHER',
  ]),
  label: z.string().trim().min(2).max(120),
  amountPaisa: z.number().int().min(0),
  dueOffsetDays: z.number().int().min(0).default(0),
});

const createTemplateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(150),
  tradeId: z.string().trim().nullable().optional(),
  tradeName: z.string().trim().default('General'),
  country: z.string().trim().default('All'),
  stages: z.array(stageSchema).min(1, 'At least one fee stage is required'),
});

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Accountant', 'Viewer', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    void Trade;

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('activeOnly') === '1';
    const filter: Record<string, any> = { isDeleted: { $ne: true } };
    if (activeOnly) filter.active = true;

    const templates = await FeeTemplate.find(filter)
      .populate('tradeId', 'name course_days')
      .sort({ country: 1, name: 1 })
      .lean();

    return NextResponse.json({ success: true, data: templates });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch fee templates' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const raw = await req.json();
    const parsed = createTemplateSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid fee template');
    }

    await connectDB();
    await ensureAccountsSeeded();

    const d = parsed.data;
    const cleanCode = d.code.toUpperCase();
    const existing = await FeeTemplate.findOne({ code: cleanCode, isDeleted: { $ne: true } }).lean();
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Fee template ${cleanCode} already exists.` },
        { status: 409 }
      );
    }

    let resolvedTradeId: string | null = d.tradeId ? d.tradeId.trim() : null;
    let resolvedTradeName = 'General';
    if (resolvedTradeId) {
      const tr = await Trade.findById(resolvedTradeId).select('name').lean();
      if (!tr) {
        return badRequestResponse('Linked Trade not found.');
      }
      resolvedTradeName = tr.name;
    }

    const cleanCountry =
      !d.country || d.country.trim().toLowerCase() === 'all' ? 'All' : d.country.trim();

    const stages = d.stages.map((s, idx) => ({ ...s, stageOrder: idx + 1 }));
    const totalAmountPaisa = stages.reduce((sum, s) => sum + s.amountPaisa, 0);

    const created = await FeeTemplate.create({
      code: cleanCode,
      name: d.name,
      tradeId: resolvedTradeId,
      tradeName: resolvedTradeName,
      country: cleanCountry,
      stages,
      totalAmountPaisa,
      active: true,
      isDeleted: false,
      createdBy: auth.user.name,
    });

    await createAuditLog({
      user: auth.user,
      action: 'FEE_TEMPLATE_CREATED',
      entity: 'FeeTemplate',
      entityId: created._id.toString(),
      newValues: { code: created.code, name: created.name, totalAmountPaisa },
    });

    return NextResponse.json(
      { success: true, message: `Fee template ${created.code} created.`, data: created },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create fee template' },
      { status: 500 }
    );
  }
}

