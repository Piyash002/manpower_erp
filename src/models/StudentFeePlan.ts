import mongoose, { Schema, Document, Model } from 'mongoose';
import type { FeeStageCode } from './FeeTemplate';

export type FeeStageStatus = 'Pending' | 'Partial' | 'Paid' | 'Overdue';
export type FeePlanStatus = 'Active' | 'Paid' | 'Refunded' | 'Cancelled';

export interface IStudentFeeStage {
  stageNo: number;
  stageCode: FeeStageCode;
  label: string;
  dueDate: Date;
  amountPaisa: number;
  paidPaisa: number;
  status: FeeStageStatus;
  paidAt?: Date | null;
}

export interface IStudentFeePlan extends Document {
  planNo: string;
  studentId: mongoose.Types.ObjectId;
  studentNo: string;
  templateId?: mongoose.Types.ObjectId | null;
  tradeName: string;
  destinationCountry: string;
  branch: string;
  department: string;
  totalBilledPaisa: number;
  discountPaisa: number;
  discountReason?: string;
  discountApprovedBy?: string;
  pendingDiscountPaisa?: number;
  pendingDiscountReason?: string;
  pendingDiscountRequestedBy?: string;
  discountStatus?: 'None' | 'Pending' | 'Approved' | 'Rejected';
  discountJournalEntryId?: mongoose.Types.ObjectId | null;
  creditNotePaisa?: number;
  netPayablePaisa: number;
  totalPaidPaisa: number;
  totalRefundedPaisa: number;
  totalDuePaisa: number;
  status: FeePlanStatus;
  stages: IStudentFeeStage[];
  invoiceJournalEntryId?: mongoose.Types.ObjectId | null;
  isDeleted: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentFeeStageSchema = new Schema<IStudentFeeStage>(
  {
    stageNo: { type: Number, required: true, min: 1 },
    stageCode: {
      type: String,
      enum: [
        'BOOKING',
        'MEDICAL_TRAINING',
        'VISA_PROCESSING',
        'TICKET',
        'SERVICE_CHARGE',
        'FINAL',
        'OTHER',
      ],
      default: 'OTHER',
    },
    label: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true, index: true },
    amountPaisa: { type: Number, required: true, min: 0 },
    paidPaisa: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Partial', 'Paid', 'Overdue'],
      default: 'Pending',
    },
    paidAt: { type: Date, default: null },
  },
  { _id: false }
);

const StudentFeePlanSchema = new Schema<IStudentFeePlan>(
  {
    planNo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    studentNo: { type: String, required: true, trim: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'FeeTemplate', default: null },
    tradeName: { type: String, default: '', trim: true },
    destinationCountry: { type: String, default: 'Not decided yet', trim: true },
    branch: { type: String, default: 'Main', trim: true },
    department: { type: String, default: 'Counseling', trim: true },
    totalBilledPaisa: { type: Number, required: true, min: 0 },
    discountPaisa: { type: Number, default: 0, min: 0 },
    discountReason: { type: String, default: '' },
    discountApprovedBy: { type: String, default: '' },
    pendingDiscountPaisa: { type: Number, default: 0, min: 0 },
    pendingDiscountReason: { type: String, default: '' },
    pendingDiscountRequestedBy: { type: String, default: '' },
    discountStatus: {
      type: String,
      enum: ['None', 'Pending', 'Approved', 'Rejected'],
      default: 'None',
    },
    discountJournalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    creditNotePaisa: { type: Number, default: 0, min: 0 },
    netPayablePaisa: { type: Number, required: true, min: 0 },
    totalPaidPaisa: { type: Number, default: 0, min: 0 },
    totalRefundedPaisa: { type: Number, default: 0, min: 0 },
    totalDuePaisa: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['Active', 'Paid', 'Refunded', 'Cancelled'],
      default: 'Active',
      index: true,
    },
    stages: { type: [StudentFeeStageSchema], default: [] },
    invoiceJournalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: String, default: 'System' },
  },
  { timestamps: true }
);

StudentFeePlanSchema.index(
  { studentId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

export const StudentFeePlan: Model<IStudentFeePlan> =
  mongoose.models.StudentFeePlan ||
  mongoose.model<IStudentFeePlan>('StudentFeePlan', StudentFeePlanSchema);
