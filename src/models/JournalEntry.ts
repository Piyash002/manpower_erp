import mongoose, { Schema, Document, Model } from 'mongoose';
import type { JournalTypeCode } from './Journal';

export type JournalEntryStatus = 'Draft' | 'Posted' | 'Reversed';

export interface IJournalEntry extends Document {
  voucherNo: string;
  journalId: mongoose.Types.ObjectId;
  journalType: JournalTypeCode;
  fiscalYearId: mongoose.Types.ObjectId;
  periodId: mongoose.Types.ObjectId;
  entryDate: Date;
  description: string;
  reference?: string;
  status: JournalEntryStatus;
  isReversal: boolean;
  reversalOfId?: mongoose.Types.ObjectId | null;
  reversedById?: mongoose.Types.ObjectId | null;
  reversalReason?: string;
  sourceModule: string;
  sourceId?: string;
  idempotencyKey?: string;
  totalDebitPaisa: number;
  totalCreditPaisa: number;
  postedBy?: string;
  postedAt?: Date | null;
  reversedBy?: string;
  reversedAt?: Date | null;
  createdBy: string;
  isDeleted: boolean;
  deletedBy?: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const JournalEntrySchema = new Schema<IJournalEntry>(
  {
    voucherNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    journalId: { type: Schema.Types.ObjectId, ref: 'Journal', required: true },
    journalType: {
      type: String,
      enum: ['JV', 'RV', 'PV', 'CV'],
      required: true,
      index: true,
    },
    fiscalYearId: { type: Schema.Types.ObjectId, ref: 'FiscalYear', required: true, index: true },
    periodId: { type: Schema.Types.ObjectId, ref: 'AccountingPeriod', required: true, index: true },
    entryDate: { type: Date, required: true, index: true },
    description: { type: String, required: true, trim: true },
    reference: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['Draft', 'Posted', 'Reversed'],
      default: 'Draft',
      required: true,
      index: true,
    },
    isReversal: { type: Boolean, default: false },
    reversalOfId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    reversedById: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    reversalReason: { type: String, default: '' },
    sourceModule: { type: String, default: 'MANUAL', uppercase: true, trim: true, index: true },
    sourceId: { type: String, default: '', index: true },
    idempotencyKey: { type: String, trim: true },
    totalDebitPaisa: { type: Number, required: true, min: 0 },
    totalCreditPaisa: { type: Number, required: true, min: 0 },
    postedBy: { type: String, default: '' },
    postedAt: { type: Date, default: null },
    reversedBy: { type: String, default: '' },
    reversedAt: { type: Date, default: null },
    createdBy: { type: String, required: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedBy: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

JournalEntrySchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
JournalEntrySchema.index({ entryDate: -1, status: 1 });

JournalEntrySchema.pre('validate', function () {
  if (!Number.isInteger(this.totalDebitPaisa) || !Number.isInteger(this.totalCreditPaisa)) {
    throw new Error('Journal entry totals must be integer paisa values.');
  }
  if (this.totalDebitPaisa !== this.totalCreditPaisa) {
    throw new Error(
      `Journal entry is unbalanced: debit=${this.totalDebitPaisa} paisa, credit=${this.totalCreditPaisa} paisa.`
    );
  }
});

export const JournalEntry: Model<IJournalEntry> =
  mongoose.models.JournalEntry ||
  mongoose.model<IJournalEntry>('JournalEntry', JournalEntrySchema);

