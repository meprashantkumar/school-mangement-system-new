import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  clearOne,
  getMyClasses,
  getMyRoster,
  markBulk,
  markOne,
} from "../controllers/attendance.controller";
import {
  clearMarkTeacher,
  getExamEntryTeacher,
  markOneTeacher,
  teacherCreateExam,
  teacherListExams,
} from "../controllers/exam.controller";
import { getMyTeacherTimetable } from "../controllers/timetable.controller";
import {
  getMyChildren,
  getMyChildrenInvoices,
} from "../controllers/teacherChildren.controller";

const router = Router();

// The logged-in teacher's own space (mirrors /api/portal for parents).
router.use(protect, authorize("teacher"));

router.get("/me", getMyClasses);
router.get("/attendance", getMyRoster);
router.post("/attendance/bulk", markBulk);
router.post("/attendance", markOne);
router.delete("/attendance", clearOne);

// Results / marks
router.get("/exams", teacherListExams);
router.post("/exams", teacherCreateExam);
router.get("/exams/:id/entry", getExamEntryTeacher);
router.post("/marks", markOneTeacher);
router.delete("/marks", clearMarkTeacher);

// My weekly teaching timetable (derived from the class timetables)
router.get("/timetable", getMyTeacherTimetable);

// My own children, for staff whose child studies at the school
router.get("/children", getMyChildren);
router.get("/children/invoices", getMyChildrenInvoices);

export default router;
