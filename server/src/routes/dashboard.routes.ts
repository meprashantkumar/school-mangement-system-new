import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import { getStats } from "../controllers/dashboard.controller";

const router = Router();

router.get("/stats", protect, authorize("superadmin", "admin"), getStats);

export default router;
