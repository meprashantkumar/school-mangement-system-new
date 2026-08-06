import { app } from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { ensureSuperAdmin } from "./config/seedSuperAdmin";
import { ensureUserIndexes } from "./utils/ensureUserIndexes";
import { normalizeStoredPhones } from "./utils/normalizeStoredPhones";
import { migrateHolidayScope } from "./utils/migrateHolidayScope";
import { migratePassouts } from "./utils/migratePassouts";
import { primeCurrentSession } from "./utils/session";
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
  // Finishing school is its own status now, not a "left" with a particular wording.
  await migratePassouts();
  // Which academic session the school is in decides what every roster, register and
  // timetable shows, and it is read on almost every request — so load it once here
  // and keep it in memory.
  await primeCurrentSession();
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
