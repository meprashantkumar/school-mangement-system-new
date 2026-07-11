import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  getConfig,
  updateConfig,
  getClassTimetable,
  saveClassTimetable,
  getBusyTeachers,
  getTeacherTimetableAdmin,
  getExamTimetable,
  saveExamTimetable,
} from "../controllers/timetable.controller";

const router = Router();

router.use(protect);

const staff = authorize("superadmin", "admin");
const staffOrTeacher = authorize("superadmin", "admin", "teacher");

// Bell schedule
router.get("/config", staffOrTeacher, getConfig);
router.put("/config", staff, updateConfig);

// Class timetable
router.get("/class", staffOrTeacher, getClassTimetable);
router.put("/class", staff, saveClassTimetable);
router.get("/busy", staff, getBusyTeachers);

// Teacher timetable (derived) — staff can view any teacher's
router.get("/teacher", staff, getTeacherTimetableAdmin);

// Exam date sheet
router.get("/exam", staff, getExamTimetable);
router.put("/exam", staff, saveExamTimetable);

export default router;
