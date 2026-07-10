import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  clearMarkAdmin,
  createExam,
  deleteExam,
  getExam,
  getExamEntryAdmin,
  getExamResults,
  getOverallResults,
  listExams,
  markOneAdmin,
  setExamPublish,
  updateExam,
} from "../controllers/exam.controller";

const router = Router();

// Managing exams + results is a staff action.
router.use(protect, authorize("superadmin", "admin"));

// Literal routes first so they aren't captured by "/:id".
router.get("/overall", getOverallResults);
router.get("/", listExams);
router.post("/", createExam);

router.get("/:id/results", getExamResults);
router.get("/:id/entry", getExamEntryAdmin);
router.post("/:id/publish", setExamPublish);
router.post("/:id/marks", markOneAdmin);
router.delete("/:id/marks", clearMarkAdmin);

router.get("/:id", getExam);
router.put("/:id", updateExam);
router.delete("/:id", deleteExam);

export default router;
