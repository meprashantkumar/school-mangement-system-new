import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  getMyInvoices,
  getMyPayments,
  getMyResults,
  getMyStudents,
} from "../controllers/portal.controller";
import { getMyTimetable, getMyExamTimetable } from "../controllers/timetable.controller";

const router = Router();

router.get("/students", protect, authorize("parent", "student"), getMyStudents);
router.get("/invoices", protect, authorize("parent", "student"), getMyInvoices);
router.get("/payments", protect, authorize("parent", "student"), getMyPayments);
router.get("/results", protect, authorize("parent", "student"), getMyResults);
router.get("/timetable", protect, authorize("parent", "student"), getMyTimetable);
router.get("/exam-timetable", protect, authorize("parent", "student"), getMyExamTimetable);

export default router;
