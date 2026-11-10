import mongoose, { Schema, Document, Model } from 'mongoose';

export type SyncType = 'push' | 'pull' | 'csv' | 'dat';
export type SyncStatus = 'Success' | 'Partial' | 'Failed';

export interface IDeviceSyncLog extends Omit<Document, 'errors'> {
  device_id?: mongoose.Types.ObjectId | null;
  device_name: string;
  sync_type: SyncType;
  synced_at: Date;
  records_fetched: number;
  records_matched: number;
  unmatched_count: number;
  errors: string[];
  status: SyncStatus;
  triggered_by?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSyncLogSchema = new Schema<IDeviceSyncLog>(
  {
    device_id: { type: Schema.Types.ObjectId, ref: 'BiometricDevice', default: null, index: true },
    device_name: { type: String, required: true, trim: true },
    sync_type: {
      type: String,
      enum: ['push', 'pull', 'csv', 'dat'],
      required: true,
    },
    synced_at: { type: Date, default: Date.now, index: true },
    records_fetched: { type: Number, default: 0 },
    records_matched: { type: Number, default: 0 },
    unmatched_count: { type: Number, default: 0 },
    errors: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['Success', 'Partial', 'Failed'],
      default: 'Success',
    },
    triggered_by: { type: String, default: 'System' },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

export const DeviceSyncLog: Model<IDeviceSyncLog> =
  mongoose.models.DeviceSyncLog ||
  mongoose.model<IDeviceSyncLog>('DeviceSyncLog', DeviceSyncLogSchema);

