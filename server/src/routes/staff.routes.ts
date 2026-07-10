import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  clearStaffOne,
  createStaff,
  deleteStaff,
  getStaff,
  getStaffRoster,
  importStaff,
  markStaffBulk,
  markStaffOne,
  updateStaff,
} from "../controllers/staff.controller";

const router = Router();

// Staff attendance (teachers + non-teaching) — staff room / office use.
router.get("/attendance", protect, authorize("superadmin", "admin"), getStaffRoster);
router.post("/attendance/bulk", protect, authorize("superadmin", "admin"), markStaffBulk);
router.post("/attendance", protect, authorize("superadmin", "admin"), markStaffOne);
router.delete("/attendance", protect, authorize("superadmin", "admin"), clearStaffOne);

// Staff directory (non-teaching employees). Manage: super admin.
router.get("/", protect, authorize("superadmin", "admin"), getStaff);
router.post("/", protect, authorize("superadmin"), createStaff);
router.post("/import", protect, authorize("superadmin"), importStaff);
router.put("/:id", protect, authorize("superadmin"), updateStaff);
router.delete("/:id", protect, authorize("superadmin"), deleteStaff);

export default router;
