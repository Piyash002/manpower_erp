import mongoose, { Schema, Document, Model } from 'mongoose';
import type { PaymentMethod } from './Payment';

export type RefundRuleCode =
  | 'VISA_REJECTED'
  | 'MEDICAL_UNFIT'
  | 'CANDIDATE_WITHDREW'
  | 'PACKAGE_DOWNGRADE'
  | 'OVERPAYMENT'
  | 'OTHER';

export type RefundKind = 'Refund' | 'CreditNote';
export type RefundApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface IFeeRefund extends Document {
  refundNo: string;
  kind: RefundKind;
  studentId: mongoose.Types.ObjectId;
  feePlanId: mongoose.Types.ObjectId;
  amountPaisa: number;
  refundRule: RefundRuleCode;
  reason: string;
  method?: PaymentMethod | '';
  payoutAccountId?: mongoose.Types.ObjectId | null;
  reference?: string;
  refundDate: Date;
  status: RefundApprovalStatus;
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: Date | null;
  rejectedBy?: string;
  rejectedAt?: Date | null;
  rejectionReason?: string;
  journalEntryId?: mongoose.Types.ObjectId | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FeeRefundSchema = new Schema<IFeeRefund>(
  {
    refundNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    kind: { type: String, enum: ['Refund', 'CreditNote'], required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    feePlanId: { type: Schema.Types.ObjectId, ref: 'StudentFeePlan', required: true, index: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    refundRule: {
      type: String,
      enum: [
        'VISA_REJECTED',
        'MEDICAL_UNFIT',
        'CANDIDATE_WITHDREW',
        'PACKAGE_DOWNGRADE',
        'OVERPAYMENT',
        'OTHER',
      ],
      required: true,
    },
    reason: { type: String, required: true, trim: true },
    method: {
      type: String,
      enum: ['', 'Cash', 'bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Cheque', 'Card'],
      default: '',
    },
    payoutAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    reference: { type: String, default: '', trim: true },
    refundDate: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    requestedBy: { type: String, required: true },
    approvedBy: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: String, default: '' },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const FeeRefund: Model<IFeeRefund> =
  mongoose.models.FeeRefund || mongoose.model<IFeeRefund>('FeeRefund', FeeRefundSchema);

