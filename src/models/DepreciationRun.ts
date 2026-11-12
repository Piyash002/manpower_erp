import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDepreciationRunItem {
  assetId: mongoose.Types.ObjectId;
  assetCode: string;
  assetName: string;
  amountPaisa: number;
  prevAccumPaisa: number;
  newAccumPaisa: number;
}

export interface IDepreciationRun extends Document {
  periodId: mongoose.Types.ObjectId;
  periodName: string;
  fiscalYearCode: string;
  runDate: Date;
  totalPaisa: number;
  entryId: mongoose.Types.ObjectId;
  reversalEntryId?: mongoose.Types.ObjectId | null;
  status: 'Posted' | 'Reversed';
  items: IDepreciationRunItem[];
  createdBy: string;
  reversedBy?: string;
  reversedAt?: Date | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DepreciationRunItemSchema = new Schema<IDepreciationRunItem>(
  {
    assetId: { type: Schema.Types.ObjectId, ref: 'FixedAsset', required: true },
    assetCode: { type: String, required: true },
    assetName: { type: String, required: true },
    amountPaisa: { type: Number, required: true, min: 0 },
    prevAccumPaisa: { type: Number, required: true, min: 0 },
    newAccumPaisa: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const DepreciationRunSchema = new Schema<IDepreciationRun>(
  {
    periodId: { type: Schema.Types.ObjectId, ref: 'AccountingPeriod', required: true, index: true },
    periodName: { type: String, required: true },
    fiscalYearCode: { type: String, required: true, uppercase: true },
    runDate: { type: Date, required: true },
    totalPaisa: { type: Number, required: true, min: 0 },
    entryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
    reversalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    status: {
      type: String,
      enum: ['Posted', 'Reversed'],
      default: 'Posted',
      required: true,
      index: true,
    },
    items: { type: [DepreciationRunItemSchema], default: [] },
    createdBy: { type: String, default: 'System' },
    reversedBy: { type: String, default: '' },
    reversedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

DepreciationRunSchema.index(
  { periodId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'Posted', isDeleted: false } }
);

export const DepreciationRun: Model<IDepreciationRun> =
  mongoose.models.DepreciationRun ||
  mongoose.model<IDepreciationRun>('DepreciationRun', DepreciationRunSchema);

