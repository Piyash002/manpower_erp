import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAccountsSettings extends Document {
  allow_counselor_collection: boolean;
  default_branch: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const AccountsSettingsSchema = new Schema<IAccountsSettings>(
  {
    allow_counselor_collection: { type: Boolean, default: false },
    default_branch: { type: String, default: 'Main', trim: true },
    updatedBy: { type: String, default: 'System' },
  },
  { timestamps: true }
);

export const AccountsSettings: Model<IAccountsSettings> =
  mongoose.models.AccountsSettings ||
  mongoose.model<IAccountsSettings>('AccountsSettings', AccountsSettingsSchema);

