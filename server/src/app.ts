import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { notFound, errorHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";
import authRoutes from "./routes/auth.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import studentRoutes from "./routes/student.routes";
import feeRoutes from "./routes/fee.routes";
import invoiceRoutes from "./routes/invoice.routes";
import chargeRoutes from "./routes/charge.routes";
import paymentRoutes from "./routes/payment.routes";
import reportRoutes from "./routes/reports.routes";
import portalRoutes from "./routes/portal.routes";
import configRoutes from "./routes/config.routes";
import auditRoutes from "./routes/audit.routes";
import teacherRoutes from "./routes/teacher.routes";
import teacherPortalRoutes from "./routes/teacherPortal.routes";
import holidayRoutes from "./routes/holiday.routes";
import staffRoutes from "./routes/staff.routes";
import trashRoutes from "./routes/trash.routes";
import subjectRoutes from "./routes/subject.routes";
import examRoutes from "./routes/exam.routes";
import backupRoutes from "./routes/backup.routes";
import accessRoutes from "./routes/access.routes";
import admissionRoutes from "./routes/admission.routes";
import timetableRoutes from "./routes/timetable.routes";
import settingRoutes from "./routes/setting.routes";

export const app = express();

// Behind a reverse proxy in production — needed for correct client IPs (rate limit).
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
// Express defaults to 100 kB, which a whole-school student import blows past at
// around 200 records ("request entity too large"). 25 MB carries tens of thousands.
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "sfms-api" });
});

// Gentle global rate limit (auth routes have their own tighter limit).
app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/admin", dashboardRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/charges", chargeRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/config", configRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/teacher", teacherPortalRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/trash", trashRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/admissions", admissionRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/settings", settingRoutes);

app.use(notFound);
app.use(errorHandler);
