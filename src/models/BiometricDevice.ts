import mongoose, { Schema, Document, Model } from 'mongoose';

export type DeviceBrand = 'ZKTeco' | 'Hikvision' | 'Generic';
export type DeviceStatus = 'Active' | 'Offline' | 'Inactive';

export interface IBiometricDevice extends Document {
  name: string;
  brand: DeviceBrand;
  ip_address: string;
  port: number;
  serial_no: string;
  location?: string;
  device_token: string;
  pull_url?: string;
  status: DeviceStatus;
  last_sync_at?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BiometricDeviceSchema = new Schema<IBiometricDevice>(
  {
    name: { type: String, required: true, trim: true },
    brand: {
      type: String,
      enum: ['ZKTeco', 'Hikvision', 'Generic'],
      default: 'ZKTeco',
      required: true,
    },
    ip_address: { type: String, required: true, trim: true },
    port: { type: Number, default: 4370 },
    serial_no: { type: String, required: true, unique: true, trim: true, uppercase: true },
    location: { type: String, default: '', trim: true },
    device_token: { type: String, required: true, unique: true, trim: true },
    pull_url: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['Active', 'Offline', 'Inactive'],
      default: 'Active',
      index: true,
    },
    last_sync_at: { type: Date, default: null },
  },
  { timestamps: true }
);

export const BiometricDevice: Model<IBiometricDevice> =
  mongoose.models.BiometricDevice ||
  mongoose.model<IBiometricDevice>('BiometricDevice', BiometricDeviceSchema);

