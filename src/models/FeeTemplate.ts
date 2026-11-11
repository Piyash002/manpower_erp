import mongoose, { Schema, Document, Model } from 'mongoose';

export type FeeStageCode =
  | 'BOOKING'
  | 'MEDICAL_TRAINING'
  | 'VISA_PROCESSING'
  | 'TICKET'
  | 'SERVICE_CHARGE'
  | 'FINAL'
  | 'OTHER';

export interface IFeeTemplateStage {
  stageOrder: number;
  stageCode: FeeStageCode;
  label: string;
  amountPaisa: number;
  dueOffsetDays: number;
}

export interface IFeeTemplate extends Document {
  code: string;
  name: string;
  tradeId?: mongoose.Types.ObjectId | null;
  tradeName: string;
  country: string;
  stages: IFeeTemplateStage[];
  totalAmountPaisa: number;
  active: boolean;
  isDeleted: boolean;
  sourceLegacyKey?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeeTemplateStageSchema = new Schema<IFeeTemplateStage>(
  {
    stageOrder: { type: Number, required: true, min: 1 },
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
      required: true,
    },
    label: { type: String, required: true, trim: true },
    amountPaisa: { type: Number, required: true, min: 0 },
    dueOffsetDays: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false }
);

const FeeTemplateSchema = new Schema<IFeeTemplate>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    tradeId: { type: Schema.Types.ObjectId, ref: 'Trade', default: null, index: true },
    tradeName: { type: String, default: 'General', trim: true },
    country: { type: String, default: 'All', trim: true, index: true },
    stages: { type: [FeeTemplateStageSchema], default: [] },
    totalAmountPaisa: { type: Number, required: true, default: 0, min: 0 },
    active: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    sourceLegacyKey: { type: String, trim: true },
    createdBy: { type: String, default: 'System' },
  },
  { timestamps: true }
);

FeeTemplateSchema.index({ sourceLegacyKey: 1 }, { unique: true, sparse: true });

export const FeeTemplate: Model<IFeeTemplate> =
  mongoose.models.FeeTemplate || mongoose.model<IFeeTemplate>('FeeTemplate', FeeTemplateSchema);

