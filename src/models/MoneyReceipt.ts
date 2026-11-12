import mongoose, { Schema, Document, Model } from 'mongoose';
import type { PaymentMethod } from './Payment';

export interface IReceiptAllocation {
  stageNo: number;
  label: string;
  amountPaisa: number;
}

export interface IMoneyReceipt extends Document {
  receiptNo: string;
  studentId: mongoose.Types.ObjectId;
  feePlanId: mongoose.Types.ObjectId;
  amountPaisa: number;
  method: PaymentMethod;
  depositAccountId: mongoose.Types.ObjectId;
  reference?: string;
  bankName?: string;
  chequeNo?: string;
  chequeDate?: Date | null;
  proofUrl?: string;
  receiptDate: Date;
  note?: string;
  branch: string;
  department: string;
  allocations: IReceiptAllocation[];
  journalEntryId: mongoose.Types.ObjectId;
  legacyPaymentId?: mongoose.Types.ObjectId | null;
  status: 'Posted' | 'Reversed';
  reversalJournalEntryId?: mongoose.Types.ObjectId | null;
  reversalReason?: string;
  isDeleted: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const MoneyReceiptSchema = new Schema<IMoneyReceipt>(
  {
    receiptNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    feePlanId: { type: Schema.Types.ObjectId, ref: 'StudentFeePlan', required: true, index: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    method: {
      type: String,
      enum: ['Cash', 'bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Cheque', 'Card'],
      required: true,
    },
    depositAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    reference: { type: String, default: '', trim: true },
    bankName: { type: String, default: '', trim: true },
    chequeNo: { type: String, default: '', trim: true },
    chequeDate: { type: Date, default: null },
    proofUrl: { type: String, default: '', trim: true },
    receiptDate: { type: Date, required: true, default: Date.now, index: true },
    note: { type: String, default: '', trim: true },
    branch: { type: String, default: 'Main', trim: true },
    department: { type: String, default: 'Counseling', trim: true },
    allocations: {
      type: [
        {
          stageNo: { type: Number, required: true },
          label: { type: String, required: true },
          amountPaisa: { type: Number, required: true, min: 1 },
        },
      ],
      default: [],
    },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true, index: true },
    legacyPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    status: { type: String, enum: ['Posted', 'Reversed'], default: 'Posted', index: true },
    reversalJournalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    reversalReason: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

MoneyReceiptSchema.index({ legacyPaymentId: 1 }, { unique: true, sparse: true });

export const MoneyReceipt: Model<IMoneyReceipt> =
  mongoose.models.MoneyReceipt || mongoose.model<IMoneyReceipt>('MoneyReceipt', MoneyReceiptSchema);

