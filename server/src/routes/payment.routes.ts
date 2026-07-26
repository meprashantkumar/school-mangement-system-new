import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  applyCredit,
  createRazorpayOrder,
  getPayments,
  getReceipt,
  recordCollection,
  recordCounterPayment,
  updateChequeStatus,
  verifyRazorpayPayment,
  voidPayment,
} from "../controllers/payment.controller";

const router = Router();

// Counter (staff): cash / cheque / upi-qr
router.post("/counter", protect, authorize("superadmin", "admin"), recordCounterPayment);
// Unified collection: distributes across dues + parks any advance as credit.
router.post("/collect", protect, authorize("superadmin", "admin"), recordCollection);
// Apply a student's advance credit onto their outstanding dues.
router.post("/apply-credit", protect, authorize("superadmin", "admin"), applyCredit);
router.get("/", protect, authorize("superadmin", "admin"), getPayments);
// Cheque lifecycle: mark cleared, or bounced (which reverses the credit).
router.patch("/:id/cheque", protect, authorize("superadmin", "admin"), updateChequeStatus);
// Void a mistaken payment (super admin only).
router.post("/:id/void", protect, authorize("superadmin"), voidPayment);

// Online payments (staff or parent/student, ownership enforced in controller)
router.post("/razorpay/order", protect, createRazorpayOrder);
router.post("/razorpay/verify", protect, verifyRazorpayPayment);

// Receipt (any authenticated user)
router.get("/:id/receipt", protect, getReceipt);

export default router;
