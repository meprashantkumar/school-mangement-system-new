import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import { getSettings, updateSettings } from "../controllers/setting.controller";

const router = Router();

// Any staff can read it (the promote screen and class pickers need it);
// only the super admin decides how far the school goes.
router.get("/", protect, authorize("superadmin", "admin"), getSettings);
router.put("/", protect, authorize("superadmin"), updateSettings);

export default router;
