import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import {
  AbsenceDeductionBasis,
  OvertimeBasis,
  PayrollDaysBasis,
  PayrollSettings,
  RoundingMode,
} from '@/models/PayrollSettings';
import { SalaryRule } from '@/models/SalaryRule';
import type { LeaveType } from '@/models/Leave';
import { ensurePayrollSeeded } from '@/lib/payroll-seed';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensurePayrollSeeded();

    const { searchParams } = new URL(req.url);
    const reqVersion = searchParams.get('version');

    const [versions, rules] = await Promise.all([
      PayrollSettings.find({}).sort({ version: -1 }).lean(),
      SalaryRule.find({ active: true, category: { $in: ['BASIC', 'ALLOWANCE'] } })
        .select('code name category')
        .sort({ sequence: 1 })
        .lean(),
    ]);

    const componentMap = new Map<string, { code: string; name: string; category: string }>();
    for (const r of rules) {
      const code = String(r.code).toUpperCase();
      if (!componentMap.has(code)) {
        componentMap.set(code, { code, name: r.name, category: r.category });
      }
    }

    const latest = versions[0] || null;
    const isDefaultInUse =
      versions.length === 1 && Boolean((versions[0] as any)?.is_default_seeded);
    const inspectedVersion = reqVersion
      ? versions.find((v: any) => String(v.version) === reqVersion || String(v._id) === reqVersion) || null
      : null;

    return NextResponse.json({
      success: true,
      data: {
        activeSettings: latest,
        inspectedVersion,
        isDefaultInUse,
        versions,
        availableComponents: Array.from(componentMap.values()),
        canEdit: auth.user.role === 'Admin',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load payroll settings' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const absenceBasis = body.absence_deduction_basis as AbsenceDeductionBasis;
    const selectedComponents: string[] = Array.isArray(body.selected_component_codes)
      ? body.selected_component_codes.map((c: any) => String(c).trim().toUpperCase()).filter(Boolean)
      : [];
    const daysBasis = body.days_basis as PayrollDaysBasis;
    const workingDays = Number(body.working_days_per_month);
    const halfDayHours = Number(body.half_day_hours_threshold);
    const graceMinutes = Number(body.grace_minutes);
    const lateRuleEnabled = Boolean(body.late_rule_enabled);
    const lateCount = Number(body.late_count_per_absent);
    const extraLateFine = Number(body.extra_late_fixed_fine || 0);
    const sandwichEnabled = Boolean(body.sandwich_rule_enabled);
    const validLeaveSet = new Set<LeaveType>(['Casual', 'Sick', 'Earned', 'Emergency', 'Unpaid']);
    const paidLeaveTypes: LeaveType[] = Array.isArray(body.paid_leave_types)
      ? body.paid_leave_types
          .map((l: any) => String(l).trim() as LeaveType)
          .filter((l: LeaveType) => validLeaveSet.has(l))
      : [];
    const overtimeBasis = (body.overtime_basis || 'basic') as OvertimeBasis;
    const overtimeMultiplier = Number(body.overtime_multiplier);
    const overtimeHoursPerDay = Number(body.overtime_hours_per_day);
    const prorateMidMonth = Boolean(body.prorate_mid_month);
    const roundingMode = (body.rounding_mode || 'nearest_taka') as RoundingMode;
    const effMonth = Number(body.effective_from_month);
    const effYear = Number(body.effective_from_year);

    // Validation
    if (!['gross', 'basic', 'selected_components'].includes(absenceBasis)) {
      return NextResponse.json(
        { success: false, message: 'Invalid absence deduction basis.' },
        { status: 400 }
      );
    }
    if (absenceBasis === 'selected_components' && selectedComponents.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Select at least one salary component when using Selected Components basis.' },
        { status: 400 }
      );
    }
    if (!['fixed_30', 'calendar', 'working_days'].includes(daysBasis)) {
      return NextResponse.json({ success: false, message: 'Invalid days basis.' }, { status: 400 });
    }
    if (!Number.isFinite(workingDays) || workingDays < 20 || workingDays > 31) {
      return NextResponse.json(
        { success: false, message: 'Working days per month must be between 20 and 31.' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(graceMinutes) || graceMinutes < 0) {
      return NextResponse.json(
        { success: false, message: 'Grace minutes must be 0 or more.' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(lateCount) || lateCount < 1) {
      return NextResponse.json(
        { success: false, message: 'Late count equal to 1 absent day must be 1 or more.' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(overtimeMultiplier) || overtimeMultiplier <= 0) {
      return NextResponse.json(
        { success: false, message: 'Overtime multiplier must be greater than 0.' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(overtimeHoursPerDay) || overtimeHoursPerDay < 1 || overtimeHoursPerDay > 24) {
      return NextResponse.json(
        { success: false, message: 'Overtime hours per day must be between 1 and 24.' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(halfDayHours) || halfDayHours < 0.5 || halfDayHours > 12) {
      return NextResponse.json(
        { success: false, message: 'Half-day worked hours threshold must be between 0.5 and 12.' },
        { status: 400 }
      );
    }
    if (!effMonth || effMonth < 1 || effMonth > 12 || !effYear || effYear < 2020) {
      return NextResponse.json(
        { success: false, message: 'Valid effective-from month and year are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    const latest = await PayrollSettings.findOne({}).sort({ version: -1 }).lean();
    const nextVersion = (latest?.version || 0) + 1;

    const created = await PayrollSettings.create({
      version: nextVersion,
      effective_from_month: effMonth,
      effective_from_year: effYear,
      is_default_seeded: false,
      absence_deduction_basis: absenceBasis,
      selected_component_codes: selectedComponents,
      days_basis: daysBasis,
      working_days_per_month: Math.round(workingDays),
      half_day_hours_threshold: halfDayHours,
      grace_minutes: Math.round(graceMinutes),
      late_rule_enabled: lateRuleEnabled,
      late_count_per_absent: Math.round(lateCount),
      extra_late_fixed_fine: Math.max(0, Math.round(extraLateFine)),
      sandwich_rule_enabled: sandwichEnabled,
      paid_leave_types: paidLeaveTypes,
      overtime_basis: overtimeBasis,
      overtime_multiplier: overtimeMultiplier,
      overtime_hours_per_day: overtimeHoursPerDay,
      prorate_mid_month: prorateMidMonth,
      rounding_mode: roundingMode,
      notes: String(body.notes || '').trim(),
      updated_by: auth.user.name,
    });

    await createAuditLog({
      user: auth.user,
      action: 'PAYROLL_SETTINGS_VERSION_SAVED',
      entity: 'PayrollSettings',
      entityId: created._id.toString(),
      oldValues: latest
        ? {
            version: latest.version,
            absence_deduction_basis: latest.absence_deduction_basis,
            days_basis: latest.days_basis,
            grace_minutes: latest.grace_minutes,
            late_count_per_absent: latest.late_count_per_absent,
            sandwich_rule_enabled: latest.sandwich_rule_enabled,
            overtime_multiplier: latest.overtime_multiplier,
          }
        : undefined,
      newValues: {
        version: created.version,
        effective_from: `${effMonth}/${effYear}`,
        absence_deduction_basis: created.absence_deduction_basis,
        selected_component_codes: created.selected_component_codes,
        days_basis: created.days_basis,
        working_days_per_month: created.working_days_per_month,
        grace_minutes: created.grace_minutes,
        late_rule_enabled: created.late_rule_enabled,
        late_count_per_absent: created.late_count_per_absent,
        sandwich_rule_enabled: created.sandwich_rule_enabled,
        overtime_basis: created.overtime_basis,
        overtime_multiplier: created.overtime_multiplier,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Saved Payroll Settings Version ${created.version} (effective ${effMonth}/${effYear}).`,
        data: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save payroll settings' },
      { status: 500 }
    );
  }
}

