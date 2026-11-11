import mongoose, { Schema, Document, Model } from 'mongoose';

export type FiscalYearStatus = 'Open' | 'Closed';

export interface IFiscalYear extends Document {
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: FiscalYearStatus;
  closedBy?: string;
  closedAt?: Date | null;
  isDeleted: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const FiscalYearSchema = new Schema<IFiscalYear>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open', index: true },
    closedBy: { type: String, default: '' },
    closedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: String, default: 'System' },
  },
  { timestamps: true }
);

export const FiscalYear: Model<IFiscalYear> =
  mongoose.models.FiscalYear || mongoose.model<IFiscalYear>('FiscalYear', FiscalYearSchema);

