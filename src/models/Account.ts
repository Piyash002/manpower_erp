import mongoose, { Schema, Document, Model } from 'mongoose';

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
export type NormalBalance = 'Debit' | 'Credit';

export interface IAccount extends Document {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  parentId?: mongoose.Types.ObjectId | null;
  isGroup: boolean;
  systemTag?: string | null;
  description?: string;
  active: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function getNormalBalanceForType(type: AccountType): NormalBalance {
  return type === 'Asset' || type === 'Expense' ? 'Debit' : 'Credit';
}

const AccountSchema = new Schema<IAccount>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['Asset', 'Liability', 'Equity', 'Income', 'Expense'],
      required: true,
      index: true,
    },
    normalBalance: {
      type: String,
      enum: ['Debit', 'Credit'],
      required: true,
    },
    parentId: { type: Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    isGroup: { type: Boolean, default: false, index: true },
    systemTag: {
      type: String,
      trim: true,
      uppercase: true,
    },
    description: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: '' },
    createdBy: { type: String, default: 'System' },
  },
  { timestamps: true }
);

AccountSchema.index({ systemTag: 1 }, { unique: true, sparse: true });

export const Account: Model<IAccount> =
  mongoose.models.Account || mongoose.model<IAccount>('Account', AccountSchema);

