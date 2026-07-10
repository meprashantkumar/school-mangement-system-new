import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import { addHoliday, getHolidays, removeHoliday } from "../controllers/holiday.controller";

const router = Router();

// Holidays are school-wide and can be managed by staff and class-teachers.
router.get("/", protect, authorize("superadmin", "admin", "teacher"), getHolidays);
router.post("/", protect, authorize("superadmin", "admin", "teacher"), addHoliday);
router.delete("/:dateKey", protect, authorize("superadmin", "admin", "teacher"), removeHoliday);

export default router;
