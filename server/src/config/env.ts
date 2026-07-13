import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGO_URI || "",
  jwtSecret: process.env.JWT_SECRET || "dev_secret",
  jwtExpire: process.env.JWT_EXPIRE || "7d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  superAdmin: {
    email: process.env.SUPERADMIN_EMAIL || "superadmin@school.com",
    password: process.env.SUPERADMIN_PASSWORD || "super123",
    name: process.env.SUPERADMIN_NAME || "Super Admin",
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
  },
  // School name shown on receipts / emails.
  schoolName: process.env.SCHOOL_NAME || "Your School",
  // Convenience fee added to online (Razorpay) payments made from home, as a
  // PERCENTAGE of the amount being paid. Razorpay charges 2% + 18% GST = 2.36%
  // of the total; a 2.5% surcharge (rounded up to the rupee) covers that on every
  // payment regardless of size, so the school never absorbs the gateway cut.
  onlinePlatformFeePct: Number(process.env.ONLINE_PLATFORM_FEE_PCT) || 2.5,
  // Auto late fee: charged per day past an invoice's due date (0 disables the
  // feature). `max` caps the total late fee per invoice (0 = no cap).
  lateFee: {
    perDay: Number(process.env.LATE_FEE_PER_DAY) || 0,
    max: Number(process.env.LATE_FEE_MAX) || 0,
  },
  // School's UPI details for the counter QR (no gateway charge).
  upi: {
    vpa: process.env.SCHOOL_UPI_VPA || "",
    name: process.env.SCHOOL_UPI_NAME || "School Fee Office",
  },
  // Where the on-demand "Backup now" endpoint writes its temporary dump before
  // streaming it to the admin. Empty → OS temp dir. (The automated daily backup
  // is a separate cron script that also uploads off-box; see deploy/backup/.)
  backupDir: process.env.BACKUP_DIR || "",
  // rclone remote + config for the "Back up to Google Drive" button.
  backupRemote: process.env.BACKUP_REMOTE || "gdrive:sfms-backups",
  rcloneConfig: process.env.RCLONE_CONFIG || "",
  email: {
    host: process.env.EMAIL_HOST || "",
    port: Number(process.env.EMAIL_PORT) || 465,
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
    from: process.env.EMAIL_FROM || "School Fee System <no-reply@sfms.local>",
  },
};

if (!env.mongoUri) {
  console.error("MONGO_URI is not set in .env");
  process.exit(1);
}
