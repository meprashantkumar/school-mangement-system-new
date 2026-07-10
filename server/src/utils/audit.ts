import { Request } from "express";
import { AuditLog } from "../models/AuditLog";

interface AuditOpts {
  entity?: string;
  entityId?: string;
  actor?: { _id?: unknown; id?: string; name?: string; role?: string }; // override req.user (e.g. login)
}

// Records an audit entry. Fire-and-forget: never blocks or fails the main request.
export function logAudit(
  req: Request,
  action: string,
  description: string,
  opts: AuditOpts = {}
): void {
  const actor = opts.actor || (req as any).user;
  AuditLog.create({
    user: actor?._id,
    userName: actor?.name || "System",
    userRole: actor?.role || "system",
    action,
    entity: opts.entity,
    entityId: opts.entityId,
    description,
  }).catch((e) => console.error("Audit log failed:", e));
}

// Coarse action categories (used for the audit filter dropdown).
export const AUDIT = {
  LOGIN: "Login",
  STUDENT: "Student",
  PROMOTION: "Promotion",
  FEE_SETUP: "Fee setup",
  FEE_GENERATION: "Fee generation",
  PAYMENT: "Payment",
  ADJUSTMENT: "Concession/Fine",
  REMINDER: "Reminder",
  TEACHER: "Teacher",
  STAFF: "Staff",
  ATTENDANCE: "Attendance",
  HOLIDAY: "Holiday",
  SUBJECT: "Subject",
  EXAM: "Exam",
  RESULT: "Result",
  VOID: "Void/Reverse",
  RESTORE: "Restore",
} as const;
