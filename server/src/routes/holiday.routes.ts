import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  addHoliday,
  getHolidays,
  removeHoliday,
  removeHolidayGroup,
} from "../controllers/holiday.controller";

const router = Router();

// Holidays are managed by the office and, in the simplest case, by class-teachers: a
// class-teacher may close the school for a single day ("heavy rain today"). Both a
// multi-day break and a holiday aimed at particular classes are restricted to the
// office inside the controller — the first removes weeks of attendance days for
// everyone, the second decides it for a class the teacher may not own.
router.get("/", protect, authorize("superadmin", "admin", "teacher"), getHolidays);
router.post("/", protect, authorize("superadmin", "admin", "teacher"), addHoliday);

// Before /:dateKey — otherwise "group" is parsed as a date and fails validation.
router.delete("/group/:groupId", protect, authorize("superadmin", "admin"), removeHolidayGroup);
router.delete("/:dateKey", protect, authorize("superadmin", "admin", "teacher"), removeHoliday);

export default router;
