import Razorpay from "razorpay";
import { env } from "./env";

// Only created when keys are configured, so the app runs without payment keys.
export const razorpay = env.razorpay.keyId
  ? new Razorpay({
      key_id: env.razorpay.keyId,
      key_secret: env.razorpay.keySecret,
    })
  : null;
