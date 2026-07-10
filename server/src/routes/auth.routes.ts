import { Router } from "express";
import {
  register,
  login,
  getMe,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller";
import { protect } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";

const router = Router();

// Throttle only the write/credential endpoints (brute-force / signup-spam
// protection). `/me` is the lightweight session check the app fires on every
// load/reload — keeping it off this tight limiter avoids locking out several
// users behind one shared office/CGNAT IP.
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password/:token", authLimiter, resetPassword);
router.get("/me", protect, getMe);

export default router;
