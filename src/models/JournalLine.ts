import mongoose, { Schema, Document, Model } from 'mongoose';
import type { JournalEntryStatus } from './JournalEntry';

export interface IJournalLine extends Document {
  entryId: mongoose.Types.ObjectId;
  lineNo: number;
  accountId: mongoose.Types.ObjectId;
  description?: string;
  debitPaisa: number;
  creditPaisa: number;
  branch: string;
  department: string;
  studentId?: mongoose.Types.ObjectId | null;
  employeeId?: mongoose.Types.ObjectId | null;
  agentId?: mongoose.Types.ObjectId | null;
  vendorId?: mongoose.Types.ObjectId | null;
  entryDate: Date;
  status: JournalEntryStatus;
  reconciled: boolean;
  reconciledAt?: Date | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JournalLineSchema = new Schema<IJournalLine>(
  {
    entryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true, index: true },
    lineNo: { type: Number, required: true, min: 1 },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    description: { type: String, default: '', trim: true },
    debitPaisa: { type: Number, required: true, default: 0, min: 0 },
    creditPaisa: { type: Number, required: true, default: 0, min: 0 },
    branch: { type: String, required: true, default: 'Main', trim: true, index: true },
    department: { type: String, required: true, default: 'General', trim: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    vendorId: { type: Schema.Types.ObjectId, default: null, index: true },
    entryDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['Draft', 'Posted', 'Reversed'],
      default: 'Draft',
      required: true,
      index: true,
    },
    reconciled: { type: Boolean, default: false, index: true },
    reconciledAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

JournalLineSchema.index({ accountId: 1, status: 1, entryDate: 1 });
JournalLineSchema.index({ branch: 1, department: 1, entryDate: 1 });

JournalLineSchema.pre('validate', function () {
  if (!Number.isInteger(this.debitPaisa) || !Number.isInteger(this.creditPaisa)) {
    throw new Error('Journal line debitPaisa and creditPaisa must be integers.');
  }
  if (this.debitPaisa < 0 || this.creditPaisa < 0) {
    throw new Error('Journal line debit/credit cannot be negative.');
  }
  if (this.debitPaisa > 0 && this.creditPaisa > 0) {
    throw new Error('A single journal line cannot have both debit and credit > 0.');
  }
  if (this.debitPaisa === 0 && this.creditPaisa === 0) {
    throw new Error('A journal line must have either debitPaisa > 0 or creditPaisa > 0.');
  }
});

export const JournalLine: Model<IJournalLine> =
  mongoose.models.JournalLine || mongoose.model<IJournalLine>('JournalLine', JournalLineSchema);

