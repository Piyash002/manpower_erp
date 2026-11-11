import mongoose, { Schema, Document, Model } from 'mongoose';
import type { JournalTypeCode } from './Journal';

export interface IVoucherSequence extends Document {
  seriesKey: string;
  fiscalYearCode: string;
  journalType: JournalTypeCode;
  lastSeq: number;
  updatedAt: Date;
}

const VoucherSequenceSchema = new Schema<IVoucherSequence>(
  {
    seriesKey: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    fiscalYearCode: { type: String, required: true, uppercase: true, trim: true },
    journalType: { type: String, enum: ['JV', 'RV', 'PV', 'CV'], required: true },
    lastSeq: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const VoucherSequence: Model<IVoucherSequence> =
  mongoose.models.VoucherSequence ||
  mongoose.model<IVoucherSequence>('VoucherSequence', VoucherSequenceSchema);

