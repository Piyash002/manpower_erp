import mongoose, { Schema, Document, Model } from 'mongoose';
import type { LeaveType } from './Leave';

export type AbsenceDeductionBasis = 'gross' | 'basic' | 'selected_components';
export type PayrollDaysBasis = 'fixed_30' | 'calendar' | 'working_days' | '30';
export type OvertimeBasis = 'basic' | 'gross';
export type RoundingMode = 'nearest_taka' | 'exact_paisa';

export interface PayrollSettingsSnapshot {
  version: number;
  effective_from_month: number;
  effective_from_year: number;
  is_default_seeded?: boolean;
  absence_deduction_basis: AbsenceDeductionBasis;
  selected_component_codes: string[];
  days_basis: PayrollDaysBasis;
  working_days_per_month: number;
  half_day_hours_threshold: number;
  grace_minutes: number;
  late_rule_enabled: boolean;
  late_count_per_absent: number;
  extra_late_fixed_fine: number;
  sandwich_rule_enabled: boolean;
  paid_leave_types: LeaveType[];
  overtime_basis: OvertimeBasis;
  overtime_multiplier: number;
  overtime_hours_per_day: number;
  prorate_mid_month: boolean;
  rounding_mode: RoundingMode;
}

export interface IPayrollSettings extends Document, PayrollSettingsSnapshot {
  notes?: string;
  updated_by?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_PAYROLL_SETTINGS_VALUES: PayrollSettingsSnapshot = {
  version: 1,
  effective_from_month: 1,
  effective_from_year: 2026,
  is_default_seeded: true,
  absence_deduction_basis: 'gross',
  selected_component_codes: ['BASIC'],
  days_basis: 'fixed_30',
  working_days_per_month: 26,
  half_day_hours_threshold: 4,
  grace_minutes: 10,
  late_rule_enabled: true,
  late_count_per_absent: 3,
  extra_late_fixed_fine: 0,
  sandwich_rule_enabled: false,
  paid_leave_types: ['Casual', 'Sick', 'Earned', 'Emergency'],
  overtime_basis: 'basic',
  overtime_multiplier: 2,
  overtime_hours_per_day: 8,
  prorate_mid_month: true,
  rounding_mode: 'nearest_taka',
};

const PayrollSettingsSchema = new Schema<IPayrollSettings>(
  {
    version: { type: Number, required: true, unique: true, index: true },
    effective_from_month: { type: Number, required: true, min: 1, max: 12 },
    effective_from_year: { type: Number, required: true, min: 2020, max: 2100 },
    is_default_seeded: { type: Boolean, default: false },
    absence_deduction_basis: {
      type: String,
      enum: ['gross', 'basic', 'selected_components'],
      default: 'gross',
    },
    selected_component_codes: { type: [String], default: ['BASIC'] },
    days_basis: {
      type: String,
      enum: ['fixed_30', 'calendar', 'working_days', '30'],
      default: 'fixed_30',
    },
    working_days_per_month: { type: Number, default: 26, min: 20, max: 31 },
    half_day_hours_threshold: { type: Number, default: 4, min: 0.5 },
    grace_minutes: { type: Number, default: 10, min: 0 },
    late_rule_enabled: { type: Boolean, default: true },
    late_count_per_absent: { type: Number, default: 3, min: 1 },
    extra_late_fixed_fine: { type: Number, default: 0, min: 0 },
    sandwich_rule_enabled: { type: Boolean, default: false },
    paid_leave_types: {
      type: [String],
      default: ['Casual', 'Sick', 'Earned', 'Emergency'],
    },
    overtime_basis: {
      type: String,
      enum: ['basic', 'gross'],
      default: 'basic',
    },
    overtime_multiplier: { type: Number, default: 2, min: 0.1 },
    overtime_hours_per_day: { type: Number, default: 8, min: 1 },
    prorate_mid_month: { type: Boolean, default: true },
    rounding_mode: {
      type: String,
      enum: ['nearest_taka', 'exact_paisa'],
      default: 'nearest_taka',
    },
    notes: { type: String, default: '', trim: true },
    updated_by: { type: String, default: 'System' },
  },
  { timestamps: true }
);

PayrollSettingsSchema.index({ effective_from_year: -1, effective_from_month: -1, version: -1 });

export const PayrollSettings: Model<IPayrollSettings> =
  mongoose.models.PayrollSettings ||
  mongoose.model<IPayrollSettings>('PayrollSettings', PayrollSettingsSchema);

