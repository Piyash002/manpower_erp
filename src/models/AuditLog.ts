import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAuditLog extends Document {
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: String, default: 'system' },
    userName: { type: String, default: 'System' },
    userRole: { type: String, default: 'System' },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String },
    oldValues: { type: Schema.Types.Mixed },
    newValues: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

AuditLogSchema.index({ timestamp: -1 });

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

