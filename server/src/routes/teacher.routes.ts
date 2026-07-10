import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  createTeacher,
  deleteTeacher,
  getTeachers,
  importTeachers,
  updateTeacher,
} from "../controllers/teacher.controller";
import { getRosterAdmin } from "../controllers/attendance.controller";

const router = Router();

// Read-only attendance view for staff. Declared before "/:id" style routes.
router.get("/attendance", protect, authorize("superadmin", "admin"), getRosterAdmin);

// Listing: any staff. Managing: super admin only.
router.get("/", protect, authorize("superadmin", "admin"), getTeachers);
router.post("/", protect, authorize("superadmin"), createTeacher);
router.post("/import", protect, authorize("superadmin"), importTeachers);
router.put("/:id", protect, authorize("superadmin"), updateTeacher);
router.delete("/:id", protect, authorize("superadmin"), deleteTeacher);

export default router;
