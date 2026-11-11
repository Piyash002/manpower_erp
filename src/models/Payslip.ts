import mongoose, { Schema, Document, Model } from 'mongoose';
import { SalaryRuleCategory } from './SalaryRule';
import type { PaymentMethodType } from './Employee';
import type { DaysBasis } from './PayslipBatch';

export type PayslipStatus = 'Draft' | 'Verified' | 'Confirmed' | 'Paid' | 'Reversed' | 'Cancelled';
export type PayslipLineSource = 'contract' | 'attendance' | 'leave' | 'monthly_input' | 'formula';

export interface IPayslipLine {
  rule_id?: mongoose.Types.ObjectId | null;
  name: string;
  code: string;
  category: SalaryRuleCategory;
  sequence: number;
  amount: number;
  source?: PayslipLineSource;
  calculation_note?: string;
}

export interface IPayslip extends Document {
  payslip_no: string;
  employee_id: mongoose.Types.ObjectId;
  contract_id: mongoose.Types.ObjectId;
  structure_id: mongoose.Types.ObjectId;
  batch_id?: mongoose.Types.ObjectId | null;
  month: number;
  year: number;
  branch: string;
  days_basis: DaysBasis;
  days_in_month: number;
  prorated_days: number;
  per_day_rate: number;
  overtime_multiplier: number;
  attendance_summary: {
    presentDays: number;
    absentDays: number;
    lateDays: number;
    latePenaltyDays?: number;
    halfDays: number;
    paidLeaveDays: number;
    unpaidLeaveDays: number;
  };
  inputs_snapshot: {
    bonus: number;
    bonus_type?: 'festival' | 'performance' | 'other';
    bonus_festival?: number;
    bonus_performance?: number;
    bonus_other?: number;
    overtime_hours: number;
    overtime_rate: number;
    loan_installment: number;
    advance_deduction?: number;
    fine?: number;
    other_adjustment?: number;
    manual_deduction: number;
  };
  lines: IPayslipLine[];
  basic_pay: number;
  total_allowances: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  amount_in_words?: string;
  status: PayslipStatus;
  notes?: string;
  verified_by?: string;
  verified_at?: Date | null;
  confirmed_by?: string;
  confirmed_at?: Date | null;
  payment_method?: PaymentMethodType | '';
  payment_date?: Date | null;
  payment_reference?: string;
  paid_by?: string;
  paid_at?: Date | null;
  reversal_reason?: string;
  reversed_by?: string;
  reversed_at?: Date | null;
  reversal_of_id?: mongoose.Types.ObjectId | null;
  is_reversal?: boolean;
  created_by: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayslipSchema = new Schema<IPayslip>(
  {
    payslip_no: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    contract_id: {
      type: Schema.Types.ObjectId,
      ref: 'EmployeeContract',
      required: true,
    },
    structure_id: {
      type: Schema.Types.ObjectId,
      ref: 'SalaryStructure',
      required: true,
    },
    batch_id: { type: Schema.Types.ObjectId, ref: 'PayslipBatch', default: null, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020, max: 2100 },
    branch: { type: String, default: 'Main', trim: true },
    days_basis: { type: String, enum: ['calendar', '30'], default: 'calendar' },
    days_in_month: { type: Number, default: 30 },
    prorated_days: { type: Number, default: 30 },
    per_day_rate: { type: Number, default: 0 },
    overtime_multiplier: { type: Number, default: 2 },
    attendance_summary: {
      presentDays: { type: Number, default: 0 },
      absentDays: { type: Number, default: 0 },
      lateDays: { type: Number, default: 0 },
      latePenaltyDays: { type: Number, default: 0 },
      halfDays: { type: Number, default: 0 },
      paidLeaveDays: { type: Number, default: 0 },
      unpaidLeaveDays: { type: Number, default: 0 },
    },
    inputs_snapshot: {
      bonus: { type: Number, default: 0 },
      bonus_type: { type: String, enum: ['festival', 'performance', 'other'], default: 'festival' },
      bonus_festival: { type: Number, default: 0 },
      bonus_performance: { type: Number, default: 0 },
      bonus_other: { type: Number, default: 0 },
      overtime_hours: { type: Number, default: 0 },
      overtime_rate: { type: Number, default: 0 },
      loan_installment: { type: Number, default: 0 },
      advance_deduction: { type: Number, default: 0 },
      fine: { type: Number, default: 0 },
      other_adjustment: { type: Number, default: 0 },
      manual_deduction: { type: Number, default: 0 },
    },
    lines: {
      type: [
        {
          rule_id: { type: Schema.Types.ObjectId, ref: 'SalaryRule', default: null },
          name: { type: String, required: true },
          code: { type: String, required: true },
          category: {
            type: String,
            enum: ['BASIC', 'ALLOWANCE', 'GROSS', 'DEDUCTION', 'NET'],
            required: true,
          },
          sequence: { type: Number, required: true },
          amount: { type: Number, required: true },
          source: {
            type: String,
            enum: ['contract', 'attendance', 'leave', 'monthly_input', 'formula'],
            default: 'formula',
          },
          calculation_note: { type: String, default: '' },
        },
      ],
      default: [],
    },
    basic_pay: { type: Number, required: true, default: 0 },
    total_allowances: { type: Number, required: true, default: 0 },
    gross_pay: { type: Number, required: true, default: 0 },
    total_deductions: { type: Number, required: true, default: 0 },
    net_pay: { type: Number, required: true, default: 0 },
    amount_in_words: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Draft', 'Verified', 'Confirmed', 'Paid', 'Reversed', 'Cancelled'],
      default: 'Draft',
      index: true,
    },
    notes: { type: String, default: '', trim: true },
    verified_by: { type: String, default: '' },
    verified_at: { type: Date, default: null },
    confirmed_by: { type: String, default: '' },
    confirmed_at: { type: Date, default: null },
    payment_method: {
      type: String,
      enum: ['Bank', 'bKash', 'Nagad', 'Cash', ''],
      default: '',
    },
    payment_date: { type: Date, default: null },
    payment_reference: { type: String, default: '', trim: true },
    paid_by: { type: String, default: '' },
    paid_at: { type: Date, default: null },
    reversal_reason: { type: String, default: '', trim: true },
    reversed_by: { type: String, default: '' },
    reversed_at: { type: Date, default: null },
    reversal_of_id: { type: Schema.Types.ObjectId, ref: 'Payslip', default: null },
    is_reversal: { type: Boolean, default: false, index: true },
    created_by: { type: String, default: 'System' },
  },
  { timestamps: true }
);

PayslipSchema.index({ month: 1, year: 1, status: 1 });
PayslipSchema.index({ employee_id: 1, month: 1, year: 1, status: 1 });

export const Payslip: Model<IPayslip> =
  mongoose.models.Payslip || mongoose.model<IPayslip>('Payslip', PayslipSchema);

