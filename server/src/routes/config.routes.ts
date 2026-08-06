import { Router } from "express";
import { env } from "../config/env";
import { currentSession } from "../utils/session";

const router = Router();

// Public config the frontend needs (keys, UPI QR details, platform fee). The session
// is here too, so the public admission form can name the year being applied for
// without a login — the same value the server stamps on the application.
router.get("/", (_req, res) => {
  res.json({
    schoolName: env.schoolName,
    currentSession: currentSession(),
    razorpayKeyId: env.razorpay.keyId,
    upiVpa: env.upi.vpa,
    upiName: env.upi.name,
    onlinePlatformFeePct: env.onlinePlatformFeePct,
    lateFeePerDay: env.lateFee.perDay,
    lateFeeMax: env.lateFee.max,
  });
});

export default router;
