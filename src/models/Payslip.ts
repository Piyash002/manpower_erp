import mongoose, { Schema, Document, Model } from 'mongoose';
import { SalaryRuleCategory } from './SalaryRule';

export type PayslipStatus = 'Draft' | 'Confirmed' | 'Paid' | 'Cancelled';

export interface IPayslipLine {
  rule_id?: mongoose.Types.ObjectId | null;
  name: string;
  code: string;
  category: SalaryRuleCategory;
  sequence: number;
  amount: number;
}

export interface IPayslip extends Document {
  payslip_no: string;
  employee_id: mongoose.Types.ObjectId;
  contract_id: mongoose.Types.ObjectId;
  structure_id: mongoose.Types.ObjectId;
  batch_id?: mongoose.Types.ObjectId | null;
  month: number;
  year: number;
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
    overtime_hours: number;
    overtime_rate: number;
    loan_installment: number;
    manual_deduction: number;
  };
  lines: IPayslipLine[];
  basic_pay: number;
  total_allowances: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  status: PayslipStatus;
  notes?: string;
  confirmed_at?: Date | null;
  paid_at?: Date | null;
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
      overtime_hours: { type: Number, default: 0 },
      overtime_rate: { type: Number, default: 0 },
      loan_installment: { type: Number, default: 0 },
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
        },
      ],
      default: [],
    },
    basic_pay: { type: Number, required: true, default: 0 },
    total_allowances: { type: Number, required: true, default: 0 },
    gross_pay: { type: Number, required: true, default: 0 },
    total_deductions: { type: Number, required: true, default: 0 },
    net_pay: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ['Draft', 'Confirmed', 'Paid', 'Cancelled'],
      default: 'Draft',
      index: true,
    },
    notes: { type: String, default: '', trim: true },
    confirmed_at: { type: Date, default: null },
    paid_at: { type: Date, default: null },
    created_by: { type: String, default: 'System' },
  },
  { timestamps: true }
);

PayslipSchema.index({ month: 1, year: 1, status: 1 });

export const Payslip: Model<IPayslip> =
  mongoose.models.Payslip || mongoose.model<IPayslip>('Payslip', PayslipSchema);

