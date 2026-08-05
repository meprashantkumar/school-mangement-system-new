import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  addHoliday,
  getHolidays,
  removeHoliday,
  removeHolidayGroup,
} from "../controllers/holiday.controller";

const router = Router();

// Holidays are school-wide and can be managed by staff and class-teachers. A
// class-teacher may close a single day ("heavy rain today"); a multi-day break is
// restricted to the office inside addHoliday, since it removes weeks of attendance
// days for everyone.
router.get("/", protect, authorize("superadmin", "admin", "teacher"), getHolidays);
router.post("/", protect, authorize("superadmin", "admin", "teacher"), addHoliday);

// Before /:dateKey — otherwise "group" is parsed as a date and fails validation.
router.delete("/group/:groupId", protect, authorize("superadmin", "admin"), removeHolidayGroup);
router.delete("/:dateKey", protect, authorize("superadmin", "admin", "teacher"), removeHoliday);

export default router;
