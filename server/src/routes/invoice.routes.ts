import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  applyConcession,
  applyFine,
  deleteInvoiceRun,
  generateBulkInvoices,
  generateInvoices,
  getInvoice,
  getInvoiceSummary,
  getInvoices,
  getStudentInvoices,
  removeConcession,
} from "../controllers/invoice.controller";

const router = Router();

router.post("/generate", protect, authorize("superadmin"), generateInvoices);
router.post("/generate-bulk", protect, authorize("superadmin"), generateBulkInvoices);
router.delete("/run", protect, authorize("superadmin"), deleteInvoiceRun);
// Literal routes must come before "/:id" so they aren't captured as an id.
router.get("/summary", protect, authorize("superadmin", "admin"), getInvoiceSummary);
router.get("/", protect, authorize("superadmin", "admin"), getInvoices);
router.get("/student/:studentId", protect, authorize("superadmin", "admin"), getStudentInvoices);
router.get("/:id", protect, authorize("superadmin", "admin"), getInvoice);
router.post("/:id/concession", protect, authorize("superadmin", "admin"), applyConcession);
router.delete("/:id/concession/:index", protect, authorize("superadmin", "admin"), removeConcession);
router.post("/:id/fine", protect, authorize("superadmin", "admin"), applyFine);

export default router;
