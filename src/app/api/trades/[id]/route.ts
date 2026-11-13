import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Trade } from '@/models/Trade';
import { Student } from '@/models/Student';
import { CountryCost } from '@/models/CountryCost';
import { Batch } from '@/models/Batch';
import { FeeTemplate } from '@/models/FeeTemplate';
import { delCachePattern } from '@/lib/redis';

// PUT /api/trades/[id] - Admin only
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, course_days, admission_fee, course_fee, active } = body;

    await connectDB();
    const trade = await Trade.findById(id);
    if (!trade) {
      return NextResponse.json({ success: false, message: 'Trade not found' }, { status: 404 });
    }

    const oldValues = trade.toJSON();
    const prevName = trade.name;

    if (name) trade.name = name.trim();
    if (course_days !== undefined) trade.course_days = Number(course_days);
    if (admission_fee !== undefined) trade.admission_fee = Math.round(Number(admission_fee));
    if (course_fee !== undefined) trade.course_fee = Math.round(Number(course_fee));
    if (active !== undefined) trade.active = Boolean(active);

    await trade.save();

    // Cascade trade rename across Batches, FeeTemplates, and Students so names never desync
    if (trade.name !== prevName) {
      await Promise.all([
        Batch.updateMany({ trade_id: id }, { $set: { trade_name: trade.name } }),
        FeeTemplate.updateMany({ tradeId: id }, { $set: { tradeName: trade.name } }),
        Student.updateMany({ trade_id: id }, { $set: { trade_name: trade.name } }),
      ]);
    }

    await createAuditLog({
      user: auth.user,
      action: 'TRADE_UPDATED',
      entity: 'Trade',
      entityId: trade._id.toString(),
      oldValues,
      newValues: trade.toJSON(),
    });

    await delCachePattern('master:trades*');

    return NextResponse.json({
      success: true,
      message: 'Trade updated successfully',
      trade,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update trade' },
      { status: 500 }
    );
  }
}

// DELETE /api/trades/[id] - Admin only
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    await connectDB();

    // PRD Section 4.2 Requirement:
    // A trade used by any student, batch, or fee template cannot be deleted.
    const [studentUsingTrade, batchUsingTrade, tplUsingTrade] = await Promise.all([
      Student.findOne({ trade_id: id }).select('student_no name').lean(),
      Batch.findOne({ trade_id: id }).select('batch_code name').lean(),
      FeeTemplate.findOne({ tradeId: id, isDeleted: { $ne: true } }).select('code name').lean(),
    ]);
    if (studentUsingTrade) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete trade. It is currently assigned to student ${studentUsingTrade.student_no} (${studentUsingTrade.name}). You can deactivate it instead.`,
        },
        { status: 400 }
      );
    }
    if (batchUsingTrade) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete trade. It is linked to training batch ${batchUsingTrade.batch_code} (${batchUsingTrade.name}). You can deactivate it instead.`,
        },
        { status: 400 }
      );
    }
    if (tplUsingTrade) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete trade. It is linked to Accounts Fee Template ${tplUsingTrade.code}. You can deactivate the trade instead.`,
        },
        { status: 400 }
      );
    }

    const trade = await Trade.findById(id);
    if (!trade) {
      return NextResponse.json({ success: false, message: 'Trade not found' }, { status: 404 });
    }

    // Also remove associated country costs
    await CountryCost.deleteMany({ trade_id: id });
    await Trade.findByIdAndDelete(id);

    await createAuditLog({
      user: auth.user,
      action: 'TRADE_DELETED',
      entity: 'Trade',
      entityId: id,
      oldValues: trade.toJSON(),
    });

    await delCachePattern('master:trades*');

    return NextResponse.json({
      success: true,
      message: `Trade "${trade.name}" deleted successfully`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete trade' },
      { status: 500 }
    );
  }
}

