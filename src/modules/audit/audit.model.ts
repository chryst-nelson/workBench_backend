import { Schema, model, type Types } from "mongoose";

const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export const AuditLog = model("AuditLog", auditLogSchema);
export type AuditEntry = {
  actor: Types.ObjectId | string;
  action: string;
  targetType: string;
  targetId?: Types.ObjectId | string;
  metadata?: Record<string, unknown>;
  ip?: string;
};
