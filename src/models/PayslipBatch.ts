import mongoose, { Schema, Document, Model } from 'mongoose';
import type { PaymentMethodType } from './Employee';

export type PayslipBatchStatus =
  | 'Draft'
  | 'Verified'
  | 'Confirmed'
  | 'Paid'
  | 'Reversed'
  | 'Cancelled';

export type DaysBasis = 'calendar' | '30';

export interface ISkippedEmployeeEntry {
  employee_id?: mongoose.Types.ObjectId | null;
  employee_code: string;
  name: string;
  department: string;
  reason_code: 'no_contract' | 'no_structure' | 'no_attendance' | 'already_confirmed';
  reason: string;
}

export interface IPayrollRunWarning {
  employee_id?: mongoose.Types.ObjectId | null;
  employee_code: string;
  name: string;
  code: 'NET_SWING_30_PCT' | 'NET_ZERO_OR_NEGATIVE' | 'MISSING_PAYMENT_DETAILS' | 'HIGH_OVERTIME';
  severity: 'warning' | 'critical';
  message: string;
  prev_net?: number;
  current_net?: number;
}

export interface IPayslipBatch extends Document {
  name: string;
  batch_code: string;
  month: number;
  year: number;
  branch: string;
  department: string; // 'all' or specific department name
  status: PayslipBatchStatus;
  days_basis: DaysBasis;
  overtime_multiplier: number;
  include_no_attendance: boolean;
  payslip_count: number;
  skipped_count: number;
  total_gross_pay: number;
  total_deductions: number;
  total_net_pay: number;
  skipped_employees: ISkippedEmployeeEntry[];
  warnings: IPayrollRunWarning[];
  created_by: string;
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
  createdAt: Date;
  updatedAt: Date;
}

const PayslipBatchSchema = new Schema<IPayslipBatch>(
  {
    name: { type: String, required: true, trim: true },
    batch_code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020, max: 2100 },
    branch: { type: String, default: 'Main', trim: true, index: true },
    department: { type: String, default: 'all', trim: true },
    status: {
      type: String,
      enum: ['Draft', 'Verified', 'Confirmed', 'Paid', 'Reversed', 'Cancelled'],
      default: 'Draft',
      index: true,
    },
    days_basis: {
      type: String,
      enum: ['calendar', '30'],
      default: 'calendar',
    },
    overtime_multiplier: { type: Number, default: 2, min: 1, max: 5 },
    include_no_attendance: { type: Boolean, default: false },
    payslip_count: { type: Number, default: 0, min: 0 },
    skipped_count: { type: Number, default: 0, min: 0 },
    total_gross_pay: { type: Number, default: 0 },
    total_deductions: { type: Number, default: 0 },
    total_net_pay: { type: Number, default: 0 },
    skipped_employees: {
      type: [
        {
          employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
          employee_code: { type: String, default: '' },
          name: { type: String, default: '' },
          department: { type: String, default: '' },
          reason_code: {
            type: String,
            enum: ['no_contract', 'no_structure', 'no_attendance', 'already_confirmed'],
            default: 'no_contract',
          },
          reason: { type: String, default: '' },
        },
      ],
      default: [],
    },
    warnings: {
      type: [
        {
          employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
          employee_code: { type: String, default: '' },
          name: { type: String, default: '' },
          code: {
            type: String,
            enum: ['NET_SWING_30_PCT', 'NET_ZERO_OR_NEGATIVE', 'MISSING_PAYMENT_DETAILS', 'HIGH_OVERTIME'],
            default: 'NET_SWING_30_PCT',
          },
          severity: { type: String, enum: ['warning', 'critical'], default: 'warning' },
          message: { type: String, default: '' },
          prev_net: { type: Number },
          current_net: { type: Number },
        },
      ],
      default: [],
    },
    created_by: { type: String, default: 'System' },
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
    reversal_of_id: { type: Schema.Types.ObjectId, ref: 'PayslipBatch', default: null },
    is_reversal: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

PayslipBatchSchema.index(
  { month: 1, year: 1, branch: 1 },
  {
    unique: true,
    partialFilterExpression: {
      is_reversal: false,
      status: { $in: ['Draft', 'Verified', 'Confirmed', 'Paid'] },
    },
  }
);

export const PayslipBatch: Model<IPayslipBatch> =
  mongoose.models.PayslipBatch ||
  mongoose.model<IPayslipBatch>('PayslipBatch', PayslipBatchSchema);

