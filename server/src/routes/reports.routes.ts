import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  getAnalytics,
  getCollectionReport,
  getDefaulters,
  remindAllDefaulters,
  sendReminder,
} from "../controllers/reports.controller";

const router = Router();

router.get("/defaulters", protect, authorize("superadmin", "admin"), getDefaulters);
router.get("/collection", protect, authorize("superadmin", "admin"), getCollectionReport);
router.get("/analytics", protect, authorize("superadmin", "admin"), getAnalytics);
router.post("/reminder/:invoiceId", protect, authorize("superadmin", "admin"), sendReminder);
router.post("/remind-all", protect, authorize("superadmin", "admin"), remindAllDefaulters);

export default router;
