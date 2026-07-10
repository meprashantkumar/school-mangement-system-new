import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  createRazorpayOrder,
  getPayments,
  getReceipt,
  recordCounterPayment,
  verifyRazorpayPayment,
  voidPayment,
} from "../controllers/payment.controller";

const router = Router();

// Counter (staff): cash / cheque / upi-qr
router.post("/counter", protect, authorize("superadmin", "admin"), recordCounterPayment);
router.get("/", protect, authorize("superadmin", "admin"), getPayments);
// Void a mistaken payment (super admin only).
router.post("/:id/void", protect, authorize("superadmin"), voidPayment);

// Online payments (staff or parent/student, ownership enforced in controller)
router.post("/razorpay/order", protect, createRazorpayOrder);
router.post("/razorpay/verify", protect, verifyRazorpayPayment);

// Receipt (any authenticated user)
router.get("/:id/receipt", protect, getReceipt);

export default router;
