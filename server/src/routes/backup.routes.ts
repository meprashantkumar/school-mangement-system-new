import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import { runBackup } from "../controllers/backup.controller";

const router = Router();

// Database backup is a super-admin-only action.
router.use(protect, authorize("superadmin"));

router.post("/run", runBackup);

export default router;
