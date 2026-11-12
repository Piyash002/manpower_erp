import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { CountryCost } from '@/models/CountryCost';
import { Trade } from '@/models/Trade';

// GET /api/country-costs
export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const tradeId = searchParams.get('trade_id');

    const filter: any = {};
    if (tradeId) {
      filter.trade_id = tradeId;
    }

    const countryCosts = await CountryCost.find(filter)
      .populate('trade_id', 'name')
      .sort({ country: 1 });

    return NextResponse.json({
      success: true,
      countryCosts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch country costs' },
      { status: 500 }
    );
  }
}

// POST /api/country-costs - Admin only
export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { country, trade_id, visa_days, visa_cost, govt_fee, contract_years } =
      await req.json();

    if (!country || !trade_id || visa_days === undefined) {
      return NextResponse.json(
        { success: false, message: 'Country, trade_id, and visa_days are required' },
        { status: 400 }
      );
    }

    const vCost = Math.max(0, Math.round(Number(visa_cost || 0)));
    const gFee = Math.max(0, Math.round(Number(govt_fee || 0)));
    const total = vCost + gFee;

    await connectDB();
    const tradeExists = await Trade.findById(trade_id).select('_id name').lean();
    if (!tradeExists) {
      return NextResponse.json(
        { success: false, message: 'Selected trade was not found.' },
        { status: 404 }
      );
    }

    const cleanCountry = country.trim();
    const duplicate = await CountryCost.findOne({
      trade_id,
      country: { $regex: new RegExp(`^${cleanCountry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).lean();
    if (duplicate) {
      return NextResponse.json(
        {
          success: false,
          message: `Destination "${cleanCountry}" is already configured for trade "${tradeExists.name}". Edit the existing entry instead.`,
        },
        { status: 409 }
      );
    }

    const countryCost = await CountryCost.create({
      country: cleanCountry,
      trade_id,
      visa_days: Number(visa_days),
      visa_cost: vCost,
      govt_fee: gFee,
      contract_years: Number(contract_years || 2),
      total,
    });

    await countryCost.populate('trade_id', 'name');

    await createAuditLog({
      user: auth.user,
      action: 'COUNTRY_COST_CREATED',
      entity: 'CountryCost',
      entityId: countryCost._id.toString(),
      newValues: countryCost.toJSON(),
    });

    return NextResponse.json({
      success: true,
      message: 'Country cost created successfully',
      countryCost,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create country cost' },
      { status: 500 }
    );
  }
}

