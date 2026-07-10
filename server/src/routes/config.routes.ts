import { Router } from "express";
import { env } from "../config/env";

const router = Router();

// Public config the frontend needs (keys, UPI QR details, platform fee).
router.get("/", (_req, res) => {
  res.json({
    schoolName: env.schoolName,
    razorpayKeyId: env.razorpay.keyId,
    upiVpa: env.upi.vpa,
    upiName: env.upi.name,
    onlinePlatformFee: env.onlinePlatformFee,
    lateFeePerDay: env.lateFee.perDay,
    lateFeeMax: env.lateFee.max,
  });
});

export default router;
