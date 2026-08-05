import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  addCharge,
  createChargeItem,
  deleteChargeItem,
  getChargeItems,
  getChargesReport,
  removeCharge,
  updateChargeItem,
} from "../controllers/charge.controller";

const router = Router();

const office = [protect, authorize("superadmin", "admin")] as const;

// The pick-list of sellable extras. Charging is day-to-day office work; deciding
// WHAT the school sells and at what price is the super admin's, same as fee heads.
router.get("/items", ...office, getChargeItems);
router.post("/items", protect, authorize("superadmin"), createChargeItem);
router.put("/items/:id", protect, authorize("superadmin"), updateChargeItem);
router.delete("/items/:id", protect, authorize("superadmin"), deleteChargeItem);

// Literal path before the /:invoiceId one, or "report" is read as an id.
router.get("/report", ...office, getChargesReport);

router.post("/", ...office, addCharge);
router.delete("/:invoiceId/:index", ...office, removeCharge);

export default router;
