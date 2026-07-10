import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  createFeeHead,
  createFeeStructure,
  deleteFeeHead,
  deleteFeeStructure,
  getFeeHeads,
  getFeeStructure,
  getFeeStructures,
  updateFeeHead,
  updateFeeStructure,
} from "../controllers/fee.controller";

const router = Router();

// Fee heads
router.get("/heads", protect, authorize("superadmin", "admin"), getFeeHeads);
router.post("/heads", protect, authorize("superadmin"), createFeeHead);
router.put("/heads/:id", protect, authorize("superadmin"), updateFeeHead);
router.delete("/heads/:id", protect, authorize("superadmin"), deleteFeeHead);

// Fee structures
router.get("/structures", protect, authorize("superadmin", "admin"), getFeeStructures);
router.get("/structures/:id", protect, authorize("superadmin", "admin"), getFeeStructure);
router.post("/structures", protect, authorize("superadmin"), createFeeStructure);
router.put("/structures/:id", protect, authorize("superadmin"), updateFeeStructure);
router.delete("/structures/:id", protect, authorize("superadmin"), deleteFeeStructure);

export default router;
