import mongoose, { Document, Schema, Types } from "mongoose";

// One record per meaningful action taken in the system (who did what, when).
export interface IAuditLog extends Document {
  user?: Types.ObjectId;
  userName: string;
  userRole: string;
  action: string; // coarse category, e.g. "Student", "Payment", "Fee generation"
  entity?: string;
  entityId?: string;
  description: string; // human-readable detail
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String, default: "System" },
    userRole: { type: String, default: "system" },
    action: { type: String, required: true, index: true },
    entity: { type: String },
    entityId: { type: String },
    description: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
