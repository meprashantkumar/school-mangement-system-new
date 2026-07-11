import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import { runBackup, restoreBackup, backupToDrive } from "../controllers/backup.controller";

const router = Router();

// Database backup/restore are super-admin-only actions.
router.use(protect, authorize("superadmin"));

router.post("/run", runBackup);
router.post("/gdrive", backupToDrive);

// Restore reads the uploaded archive as a raw binary stream (Content-Type is
// not application/json, so the global JSON body parser leaves the stream intact
// and the handler pipes it straight into mongorestore).
router.post("/restore", restoreBackup);

export default router;
