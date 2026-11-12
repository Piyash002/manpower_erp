import mongoose, { Schema, Document, Model } from 'mongoose';

export type FixedAssetCategoryTag =
  | 'FA_TRAINING_EQUIPMENT'
  | 'FA_FURNITURE'
  | 'FA_COMPUTER'
  | 'FA_LEASEHOLD';

export type FixedAssetCondition = 'Good' | 'NeedsRepair' | 'Damaged';
export type FixedAssetStatus = 'Active' | 'Disposed' | 'WrittenOff';
export type DepreciationMethod = 'StraightLine';

export interface IFixedAsset extends Document {
  assetCode: string;
  name: string;
  categoryTag: FixedAssetCategoryTag;
  quantity: number;
  purchaseDate: Date;
  depreciationStartDate?: Date | null;
  unitCostPaisa?: number;
  costPaisa: number;
  serialNumber?: string;
  purchaseGroupId?: string;
  supplier: string;
  location: string;
  condition: FixedAssetCondition;
  usefulLifeMonths: number;
  salvageValuePaisa: number;
  depreciationMethod: DepreciationMethod;
  accumulatedDepreciationPaisa: number;
  status: FixedAssetStatus;
  isPreExisting: boolean;
  paymentType: 'Paid' | 'Credit' | 'Opening';
  paymentMethod?: string;
  advancePaidPaisa?: number;
  bankName?: string;
  chequeNo?: string;
  chequeDate?: Date | null;
  reference?: string;
  attachmentUrl?: string;
  purchaseEntryId?: mongoose.Types.ObjectId | null;
  disposalEntryId?: mongoose.Types.ObjectId | null;
  disposalDate?: Date | null;
  disposalProceedsPaisa?: number;
  disposalNote?: string;
  vendorBillId?: mongoose.Types.ObjectId | null;
  branch: string;
  createdBy: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FixedAssetSchema = new Schema<IFixedAsset>(
  {
    assetCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    categoryTag: {
      type: String,
      enum: ['FA_TRAINING_EQUIPMENT', 'FA_FURNITURE', 'FA_COMPUTER', 'FA_LEASEHOLD'],
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, default: 1, min: 1 },
    purchaseDate: { type: Date, required: true, index: true },
    depreciationStartDate: { type: Date, default: null },
    unitCostPaisa: { type: Number, default: 0, min: 0 },
    costPaisa: { type: Number, required: true, min: 0 },
    serialNumber: { type: String, default: '', trim: true },
    purchaseGroupId: { type: String, default: '', trim: true, index: true },
    supplier: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
    condition: {
      type: String,
      enum: ['Good', 'NeedsRepair', 'Damaged'],
      default: 'Good',
      required: true,
    },
    usefulLifeMonths: { type: Number, required: true, min: 1 },
    salvageValuePaisa: { type: Number, required: true, default: 0, min: 0 },
    depreciationMethod: {
      type: String,
      enum: ['StraightLine'],
      default: 'StraightLine',
      required: true,
    },
    accumulatedDepreciationPaisa: { type: Number, required: true, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['Active', 'Disposed', 'WrittenOff'],
      default: 'Active',
      required: true,
      index: true,
    },
    isPreExisting: { type: Boolean, default: false },
    paymentType: {
      type: String,
      enum: ['Paid', 'Credit', 'Opening'],
      default: 'Paid',
      required: true,
    },
    paymentMethod: { type: String, default: '' },
    advancePaidPaisa: { type: Number, default: 0, min: 0 },
    bankName: { type: String, default: '', trim: true },
    chequeNo: { type: String, default: '', trim: true },
    chequeDate: { type: Date, default: null },
    reference: { type: String, default: '', trim: true },
    attachmentUrl: { type: String, default: '', trim: true },
    purchaseEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    disposalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    disposalDate: { type: Date, default: null },
    disposalProceedsPaisa: { type: Number, default: 0, min: 0 },
    disposalNote: { type: String, default: '' },
    vendorBillId: { type: Schema.Types.ObjectId, ref: 'VendorBill', default: null },
    branch: { type: String, default: 'Main', trim: true },
    createdBy: { type: String, default: 'System' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

FixedAssetSchema.pre('validate', function () {
  if (!Number.isInteger(this.costPaisa) || !Number.isInteger(this.salvageValuePaisa) || !Number.isInteger(this.accumulatedDepreciationPaisa)) {
    throw new Error('Fixed asset monetary fields must be integer paisa values.');
  }
  if (this.salvageValuePaisa > this.costPaisa) {
    throw new Error('Salvage value cannot exceed asset cost.');
  }
});

export const FixedAsset: Model<IFixedAsset> =
  mongoose.models.FixedAsset || mongoose.model<IFixedAsset>('FixedAsset', FixedAssetSchema);

