import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILoan extends Document {
  loanNo: string;
  lenderName: string;
  loanType: 'Bank' | 'Other';
  principalPaisa: number;
  receivedDate: Date;
  outstandingPaisa: number;
  interestNote: string;
  depositMethod: 'Cash' | 'Bank' | 'Cheque' | 'bKash' | 'Nagad';
  attachmentUrl?: string;
  receiptEntryId: mongoose.Types.ObjectId;
  status: 'Active' | 'Settled' | 'Reversed';
  createdBy: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LoanSchema = new Schema<ILoan>(
  {
    loanNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    lenderName: { type: String, required: true, trim: true },
    loanType: { type: String, enum: ['Bank', 'Other'], default: 'Bank', required: true },
    principalPaisa: { type: Number, required: true, min: 1 },
    receivedDate: { type: Date, required: true, index: true },
    outstandingPaisa: { type: Number, required: true, min: 0 },
    interestNote: { type: String, default: '', trim: true },
    depositMethod: {
      type: String,
      enum: ['Cash', 'Bank', 'Cheque', 'bKash', 'Nagad'],
      default: 'Bank',
      required: true,
    },
    attachmentUrl: { type: String, default: '', trim: true },
    receiptEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
    status: {
      type: String,
      enum: ['Active', 'Settled', 'Reversed'],
      default: 'Active',
      required: true,
    },
    createdBy: { type: String, default: 'System' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

LoanSchema.pre('validate', function () {
  if (!Number.isInteger(this.principalPaisa) || !Number.isInteger(this.outstandingPaisa)) {
    throw new Error('Loan principalPaisa and outstandingPaisa must be integer paisa.');
  }
});

export const Loan: Model<ILoan> =
  mongoose.models.Loan || mongoose.model<ILoan>('Loan', LoanSchema);

