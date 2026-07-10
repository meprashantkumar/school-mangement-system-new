import { app } from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { ensureSuperAdmin } from "./config/seedSuperAdmin";
import { runLateFeeSweep } from "./utils/lateFee";

const start = async () => {
  await connectDB();
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
