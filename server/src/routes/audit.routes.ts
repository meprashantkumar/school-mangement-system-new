import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import { getAuditLogs } from "../controllers/audit.controller";

const router = Router();

// Audit trail is sensitive — super admin only.
router.get("/", protect, authorize("superadmin"), getAuditLogs);

export default router;
