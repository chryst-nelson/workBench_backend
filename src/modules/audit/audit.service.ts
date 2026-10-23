import { AuditLog, type AuditEntry } from "./audit.model.js";

/** Never pass secrets (passwords, tokens) in metadata. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await AuditLog.create(entry);
}
