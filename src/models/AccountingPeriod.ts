import mongoose, { Schema, Document, Model } from 'mongoose';

export type PeriodStatus = 'Open' | 'Locked';

export interface IAccountingPeriod extends Document {
  fiscalYearId: mongoose.Types.ObjectId;
  month: number;
  year: number;
  name: string;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
  lockedBy?: string;
  lockedAt?: Date | null;
  unlockedBy?: string;
  unlockedAt?: Date | null;
  lockReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AccountingPeriodSchema = new Schema<IAccountingPeriod>(
  {
    fiscalYearId: { type: Schema.Types.ObjectId, ref: 'FiscalYear', required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020, max: 2100 },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ['Open', 'Locked'], default: 'Open', index: true },
    lockedBy: { type: String, default: '' },
    lockedAt: { type: Date, default: null },
    unlockedBy: { type: String, default: '' },
    unlockedAt: { type: Date, default: null },
    lockReason: { type: String, default: '' },
  },
  { timestamps: true }
);

AccountingPeriodSchema.index({ fiscalYearId: 1, year: 1, month: 1 }, { unique: true });
AccountingPeriodSchema.index({ year: 1, month: 1 }, { unique: true });

export const AccountingPeriod: Model<IAccountingPeriod> =
  mongoose.models.AccountingPeriod ||
  mongoose.model<IAccountingPeriod>('AccountingPeriod', AccountingPeriodSchema);

