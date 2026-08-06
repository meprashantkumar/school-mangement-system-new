import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  getSessionReadiness,
  getSessionUndo,
  getSettings,
  undoSessionChange,
  updateSettings,
} from "../controllers/setting.controller";

const router = Router();

// Any staff can read it (the promote screen and class pickers need it);
// only the super admin decides how far the school goes and which session it runs.
router.get("/", protect, authorize("superadmin", "admin"), getSettings);
router.get("/session-readiness", protect, authorize("superadmin"), getSessionReadiness);
router.get("/session-undo", protect, authorize("superadmin"), getSessionUndo);
router.post("/session-undo", protect, authorize("superadmin"), undoSessionChange);
router.put("/", protect, authorize("superadmin"), updateSettings);

export default router;
