import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { FeeTemplate } from '@/models/FeeTemplate';
import { StudentFeePlan } from '@/models/StudentFeePlan';
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

const patchTemplateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  tradeId: z.string().trim().nullable().optional(),
  tradeName: z.string().trim().optional(),
  country: z.string().trim().optional(),
  active: z.boolean().optional(),
  stages: z.array(stageSchema).min(1).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const raw = await req.json();
    const parsed = patchTemplateSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid update payload');
    }

    await connectDB();
    await ensureAccountsSeeded();

    const tpl = await FeeTemplate.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!tpl) {
      return NextResponse.json({ success: false, message: 'Fee template not found' }, { status: 404 });
    }

    const oldSnap = {
      name: tpl.name,
      tradeName: tpl.tradeName,
      country: tpl.country,
      active: tpl.active,
      totalAmountPaisa: tpl.totalAmountPaisa,
    };

    const d = parsed.data;
    if (d.name !== undefined) tpl.name = d.name;
    if (d.tradeId !== undefined) {
      const cleanTradeId = d.tradeId ? d.tradeId.trim() : null;
      if (cleanTradeId) {
        const tr = await Trade.findById(cleanTradeId).select('name').lean();
        if (!tr) return badRequestResponse('Linked Trade not found.');
        tpl.tradeId = tr._id as any;
        tpl.tradeName = tr.name;
      } else {
        tpl.tradeId = null;
        tpl.tradeName = 'General';
      }
    } else if (d.tradeName !== undefined) {
      tpl.tradeName = d.tradeName;
    }
    if (d.country !== undefined) {
      tpl.country = !d.country || d.country.trim().toLowerCase() === 'all' ? 'All' : d.country.trim();
    }
    if (d.active !== undefined) tpl.active = d.active;
    if (d.stages !== undefined) {
      const normalized = d.stages.map((s, idx) => ({ ...s, stageOrder: idx + 1 }));
      tpl.stages = normalized;
      tpl.totalAmountPaisa = normalized.reduce((sum, s) => sum + s.amountPaisa, 0);
    }

    await tpl.save();

    await createAuditLog({
      user: auth.user,
      action: 'FEE_TEMPLATE_UPDATED',
      entity: 'FeeTemplate',
      entityId: tpl._id.toString(),
      oldValues: oldSnap,
      newValues: {
        name: tpl.name,
        tradeName: tpl.tradeName,
        country: tpl.country,
        active: tpl.active,
        totalAmountPaisa: tpl.totalAmountPaisa,
      },
    });

    return NextResponse.json({ success: true, data: tpl, message: 'Fee template updated.' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update fee template' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const tpl = await FeeTemplate.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!tpl) {
      return NextResponse.json({ success: false, message: 'Fee template not found' }, { status: 404 });
    }

    const inUse = await StudentFeePlan.countDocuments({ templateId: id, isDeleted: { $ne: true } });
    if (inUse > 0 && tpl.active) {
      // Soft-deactivate instead of breaking active historical references; allow soft-archive on repeated call or explicitly mark isDeleted
    }

    tpl.isDeleted = true;
    tpl.active = false;
    await tpl.save();

    await createAuditLog({
      user: auth.user,
      action: 'FEE_TEMPLATE_ARCHIVED',
      entity: 'FeeTemplate',
      entityId: tpl._id.toString(),
      oldValues: { code: tpl.code, name: tpl.name },
      newValues: { isDeleted: true, active: false, linkedPlans: inUse },
    });

    return NextResponse.json({ success: true, message: `Fee template ${tpl.code} archived.` });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to archive fee template' },
      { status: 500 }
    );
  }
}

