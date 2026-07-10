import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  createSubject,
  deleteSubject,
  getSubjects,
  importSubjects,
  updateSubject,
} from "../controllers/subject.controller";

const router = Router();

// Teachers read the list too (to pick subjects when creating an exam).
router.get("/", protect, authorize("superadmin", "admin", "teacher"), getSubjects);
router.post("/", protect, authorize("superadmin"), createSubject);
router.post("/import", protect, authorize("superadmin"), importSubjects);
router.put("/:id", protect, authorize("superadmin"), updateSubject);
router.delete("/:id", protect, authorize("superadmin"), deleteSubject);

export default router;
