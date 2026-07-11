import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  submitAdmission,
  listAdmissions,
  getAdmission,
  approveAdmission,
  rejectAdmission,
  reopenAdmission,
  deleteAdmission,
} from "../controllers/admission.controller";

const router = Router();

// Public: anyone can submit an application from the website (no login).
router.post("/public", submitAdmission);

// Everything else is staff-only.
router.use(protect, authorize("superadmin", "admin"));

router.get("/", listAdmissions);
router.get("/:id", getAdmission);
router.post("/:id/approve", approveAdmission);
router.post("/:id/reject", rejectAdmission);
router.post("/:id/reopen", reopenAdmission);
router.delete("/:id", deleteAdmission);

export default router;
