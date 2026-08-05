import { app } from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { ensureSuperAdmin } from "./config/seedSuperAdmin";
import { ensureUserIndexes } from "./utils/ensureUserIndexes";
import { normalizeStoredPhones } from "./utils/normalizeStoredPhones";
import { migrateHolidayScope } from "./utils/migrateHolidayScope";
import { runLateFeeSweep } from "./utils/lateFee";

const start = async () => {
  await connectDB();
  // Must run before any user is created: rebuilds the login-identifier indexes
  // so accounts without an email (phone-only parents) don't collide.
  await ensureUserIndexes();
  // Mobile numbers are login IDs, so store them all in one canonical form —
  // otherwise a parent logs in but matches none of their children.
  await normalizeStoredPhones();
  // Existing holidays predate the whole-school/per-class scope — give them one, and
  // replace the dateKey-only unique index that would now reject a class holiday.
  await migrateHolidayScope();
  await ensureSuperAdmin();

  // Apply auto late fees on boot, then re-check periodically while running.
  await runLateFeeSweep().catch((e) => console.error("Late fee sweep failed:", e));
  setInterval(() => {
    runLateFeeSweep().catch((e) => console.error("Late fee sweep failed:", e));
  }, 12 * 60 * 60 * 1000);

  app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port} (${env.nodeEnv})`);
  });
};

start();
