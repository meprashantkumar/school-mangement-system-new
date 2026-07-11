import { spawn } from "child_process";
import { Request } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { env } from "../config/env";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit, AUDIT } from "../utils/audit";

// Only one backup/restore at a time — these are disk/CPU heavy, and two at once
// on a small free-tier box would fight for resources (and a restore must never
// race a backup).
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

// Streams the uploaded archive (from the request body) into `mongorestore`.
//   - "merge":   restore only what's MISSING. Existing documents keep their
//                place (matched by _id) and are skipped, so nothing is
//                duplicated — this brings back deleted records without touching
//                current data.
//   - "replace": drop each collection first, then restore, so the database
//                becomes an exact copy of the backup (used for corruption / full
//                reset; anything newer than the backup is lost).
function restoreFromStream(req: Request, mode: "merge" | "replace"): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["--uri=" + env.mongoUri, "--gzip", "--archive", "--numParallelCollections=1"];
    if (mode === "replace") args.push("--drop");

    const child = spawn("mongorestore", args, { windowsHide: true });

    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    child.on("error", (e) => {
      reject(
        new ApiError(
          500,
          "Could not run the restore tool. Ensure mongodb-database-tools (mongorestore) is installed on the server. (" +
            e.message +
            ")"
        )
      );
    });

    child.on("close", (code) => {
      // In "merge" mode, duplicate-key notices are EXPECTED (existing records
      // are skipped) and mongorestore still exits 0 — so a non-zero code is a
      // real failure worth surfacing.
      if (code === 0) return resolve();
      console.error(`mongorestore failed (exit ${code}):\n${stderr}`);
      reject(
        new ApiError(
          500,
          `Restore failed on the server (mongorestore exit ${code}). A safety snapshot was taken before restoring, so nothing was lost. Check the server logs for details.`
        )
      );
    });

    // Feed the uploaded backup into mongorestore's stdin.
    req.on("aborted", () => child.kill("SIGKILL"));
    child.stdin.on("error", () => {
      /* swallow EPIPE if the child exits before we finish writing */
    });
    req.pipe(child.stdin);
  });
}

// A clean, human-readable Drive filename in IST, e.g. "RKPS 26 Jul 2026, 10-23 pm.archive.gz".
// (Colons are swapped for dashes so the file also downloads fine on Windows.)
function driveFileName(): string {
  const pretty = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `RKPS ${pretty.replace(/:/g, "-")}.archive.gz`;
}

// Uploads a local file to the rclone remote (Google Drive).
function rcloneCopy(localPath: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = [];
    if (env.rcloneConfig) args.push("--config", env.rcloneConfig);
    args.push("copyto", localPath, dest);

    const child = spawn("rclone", args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", (e) => {
      reject(
        new ApiError(
          500,
          "Could not run rclone. Ensure it's installed and connected to Google Drive on the server. (" +
            e.message +
            ")"
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) return resolve();
      console.error(`rclone failed (exit ${code}):\n${stderr}`);
      reject(new ApiError(500, `Upload to Google Drive failed (rclone exit ${code}). Check the server logs.`));
    });
  });
}

// POST /api/backup/gdrive  (superadmin only)
// Dumps the database and uploads it straight to Google Drive with a clean,
// dated filename — an on-demand version of the nightly cron backup.
export const backupToDrive = asyncHandler(async (req, res) => {
  if (running) {
    throw new ApiError(409, "A backup or restore is already in progress. Please wait a moment.");
  }
  if (!env.mongoUri) {
    throw new ApiError(500, "Database connection is not configured.");
  }

  running = true;
  const dir = env.backupDir || os.tmpdir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const localPath = path.join(dir, `rkps-manual-${stamp}.archive.gz`);
  const driveName = driveFileName();
  const dest = `${env.backupRemote.replace(/\/+$/, "")}/manual/${driveName}`;

  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await dumpToFile(localPath);
    await rcloneCopy(localPath, dest);
    logAudit(req, AUDIT.BACKUP, `Backed up to Google Drive as "${driveName}"`);
    res.json({ ok: true, file: driveName });
  } finally {
    running = false;
    fs.promises.unlink(localPath).catch(() => {});
  }
});

// POST /api/backup/restore?mode=merge|replace  (superadmin only)
// The request body IS the uploaded .archive.gz file (sent as raw binary, so it
// streams straight into mongorestore without buffering the whole file in RAM).
// Always snapshots the current database first, so even a mistaken restore is
// itself reversible.
export const restoreBackup = asyncHandler(async (req, res) => {
  if (running) {
    throw new ApiError(409, "Another backup or restore is already in progress. Please wait a moment.");
  }
  if (!env.mongoUri) {
    throw new ApiError(500, "Database connection is not configured.");
  }

  const mode: "merge" | "replace" = req.query.mode === "replace" ? "replace" : "merge";

  running = true;
  const dir = env.backupDir || os.tmpdir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyPath = path.join(dir, `pre-restore-${stamp}.archive.gz`);

  try {
    await fs.promises.mkdir(dir, { recursive: true });

    // 1. Snapshot the CURRENT state first. If this fails (e.g. DB unreachable),
    //    abort — we never restore without a fallback. Kept on disk on purpose.
    await dumpToFile(safetyPath);

    // 2. Restore the uploaded archive.
    await restoreFromStream(req, mode);

    logAudit(
      req,
      AUDIT.RESTORE,
      `Restored the database from an uploaded backup (mode: ${mode}). Pre-restore snapshot kept as ${path.basename(
        safetyPath
      )}.`
    );

    res.json({ ok: true, mode, safetySnapshot: path.basename(safetyPath) });
  } finally {
    running = false;
  }
});
