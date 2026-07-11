import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { env } from "../config/env";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit, AUDIT } from "../utils/audit";

// Only one dump at a time — mongodump is disk/CPU heavy, and two at once on a
// small free-tier box would fight for resources.
let running = false;

// Runs `mongodump` into a single gzipped archive file. Resolves on success,
// rejects with an ApiError on failure. We deliberately do NOT surface raw
// mongodump stderr to the client — it can contain the connection string
// (with credentials). Details go to the server log instead.
function dumpToFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "mongodump",
      ["--uri=" + env.mongoUri, "--gzip", "--archive=" + filePath],
      { windowsHide: true }
    );

    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000); // keep tail only
    });

    child.on("error", (e) => {
      // Most common cause: the mongodump binary isn't installed / not in PATH.
      reject(
        new ApiError(
          500,
          "Could not run the backup tool. Ensure mongodb-database-tools (mongodump) is installed on the server. (" +
            e.message +
            ")"
        )
      );
    });

    child.on("close", (code) => {
      if (code === 0) return resolve();
      console.error(`mongodump failed (exit ${code}):\n${stderr}`);
      reject(
        new ApiError(
          500,
          `Backup failed on the server (mongodump exit ${code}). Check the server logs for details.`
        )
      );
    });
  });
}

// POST /api/backup/run  (superadmin only)
// Creates a fresh compressed dump of the whole database and streams it to the
// browser as a download, so the admin instantly has an off-box copy on their
// own computer. The temp file is deleted afterwards. This is the manual
// counterpart to the automated 2 AM cron backup (see deploy/backup/).
export const runBackup = asyncHandler(async (req, res) => {
  if (running) {
    throw new ApiError(409, "A backup is already in progress. Please wait a moment and try again.");
  }
  if (!env.mongoUri) {
    throw new ApiError(500, "Database connection is not configured.");
  }

  running = true;
  const dir = env.backupDir || os.tmpdir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `sfms-backup-${stamp}.archive.gz`;
  const filePath = path.join(dir, fileName);

  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await dumpToFile(filePath);

    logAudit(req, AUDIT.BACKUP, `Downloaded a manual database backup (${fileName})`);

    await new Promise<void>((resolve, reject) => {
      res.download(filePath, fileName, (err) => {
        // If the transfer fails before any bytes are sent, surface it; once
        // headers are out we can only log and move on (Express handles the rest).
        if (err && !res.headersSent) return reject(err);
        resolve();
      });
    });
  } finally {
    running = false;
    fs.promises.unlink(filePath).catch(() => {});
  }
});
