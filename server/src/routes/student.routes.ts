import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  bulkUpdateServices,
  createStudent,
  deleteStudent,
  getPromotionRuns,
  getSessions,
  getStudent,
  getStudents,
  importStudents,
  markStudentLeft,
  promoteStudents,
  rejoinStudent,
  undoPromotion,
  updateStudent,
} from "../controllers/student.controller";

const router = Router();

// Listing/search: any staff (so the counter can find students)
router.get("/", protect, authorize("superadmin", "admin"), getStudents);
// Must be declared before "/:id" so it isn't captured as an id.
router.get("/sessions", protect, authorize("superadmin", "admin"), getSessions);
router.get("/promote/runs", protect, authorize("superadmin"), getPromotionRuns);
router.get("/:id", protect, authorize("superadmin", "admin"), getStudent);

// Managing students: super admin only
router.post("/", protect, authorize("superadmin"), createStudent);
router.post("/import", protect, authorize("superadmin"), importStudents);
router.post("/bulk-services", protect, authorize("superadmin"), bulkUpdateServices);
router.post("/promote", protect, authorize("superadmin"), promoteStudents);
router.post("/promote/undo/:runId", protect, authorize("superadmin"), undoPromotion);
router.put("/:id", protect, authorize("superadmin"), updateStudent);
router.post("/:id/leave", protect, authorize("superadmin"), markStudentLeft);
router.post("/:id/rejoin", protect, authorize("superadmin"), rejoinStudent);
router.delete("/:id", protect, authorize("superadmin"), deleteStudent);

export default router;
