import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { CountryCost } from '@/models/CountryCost';

// PUT /api/country-costs/[id] - Admin only
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    const body = await req.json();
    const { country, trade_id, visa_days, visa_cost, govt_fee, contract_years } = body;

    await connectDB();
    const item = await CountryCost.findById(id);
    if (!item) {
      return NextResponse.json({ success: false, message: 'Country cost not found' }, { status: 404 });
    }

    const oldValues = item.toJSON();

    if (country) item.country = country.trim();
    if (trade_id) item.trade_id = trade_id;
    if (visa_days !== undefined) item.visa_days = Number(visa_days);
    if (visa_cost !== undefined) item.visa_cost = Math.round(Number(visa_cost));
    if (govt_fee !== undefined) item.govt_fee = Math.round(Number(govt_fee));
    if (contract_years !== undefined) item.contract_years = Number(contract_years);

    item.total = item.visa_cost + item.govt_fee;
    await item.save();
    await item.populate('trade_id', 'name');

    await createAuditLog({
      user: auth.user,
      action: 'COUNTRY_COST_UPDATED',
      entity: 'CountryCost',
      entityId: item._id.toString(),
      oldValues,
      newValues: item.toJSON(),
    });

    return NextResponse.json({
      success: true,
      message: 'Country cost updated successfully',
      countryCost: item,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update country cost' },
      { status: 500 }
    );
  }
}

// DELETE /api/country-costs/[id] - Admin only
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    await connectDB();

    const item = await CountryCost.findById(id);
    if (!item) {
      return NextResponse.json({ success: false, message: 'Country cost not found' }, { status: 404 });
    }

    await CountryCost.findByIdAndDelete(id);

    await createAuditLog({
      user: auth.user,
      action: 'COUNTRY_COST_DELETED',
      entity: 'CountryCost',
      entityId: id,
      oldValues: item.toJSON(),
    });

    return NextResponse.json({
      success: true,
      message: 'Country cost deleted successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete country cost' },
      { status: 500 }
    );
  }
}

