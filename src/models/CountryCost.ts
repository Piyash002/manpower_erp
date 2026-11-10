import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICountryCost extends Document {
  country: string;
  trade_id: mongoose.Types.ObjectId;
  visa_days: number;
  visa_cost: number;
  govt_fee: number;
  contract_years: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
}

const CountryCostSchema = new Schema<ICountryCost>(
  {
    country: { type: String, required: true, trim: true },
    trade_id: { type: Schema.Types.ObjectId, ref: 'Trade', required: true },
    visa_days: { type: Number, required: true, min: 1 },
    visa_cost: { type: Number, required: true, min: 0 },
    govt_fee: { type: Number, required: true, default: 0, min: 0 },
    contract_years: { type: Number, required: true, min: 0.5 },
    total: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

CountryCostSchema.index({ country: 1, trade_id: 1 });

export const CountryCost: Model<ICountryCost> =
  mongoose.models.CountryCost || mongoose.model<ICountryCost>('CountryCost', CountryCostSchema);

