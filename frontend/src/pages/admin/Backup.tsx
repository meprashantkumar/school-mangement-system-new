import { useState } from "react";
import {
  DatabaseBackup,
  Download,
  ShieldCheck,
  Clock,
  RotateCcw,
  CloudUpload,
  Upload,
  AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type RestoreMode = "merge" | "replace";

export default function Backup() {
  const [downloading, setDownloading] = useState(false);
  const [savingDrive, setSavingDrive] = useState(false);

  const backupToDrive = async () => {
    setSavingDrive(true);
    const t = toast.loading("Backing up to Google Drive…");
    try {
      const { data } = await api.post("/backup/gdrive");
      toast.success(`Saved to Google Drive: ${data.file}`, { id: t, duration: 7000 });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Backup to Google Drive failed.", { id: t });
    } finally {
      setSavingDrive(false);
    }
  };
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);

  const restoreBackup = async () => {
    if (!file) return toast.error("Choose a backup file first.");
    if (confirmText.trim().toUpperCase() !== "RESTORE") {
      return toast.error('Type RESTORE in the box to confirm.');
    }
    setRestoring(true);
    const t = toast.loading("Restoring… please keep this tab open.");
    try {
      const res = await api.post(`/backup/restore?mode=${mode}`, file, {
        headers: { "Content-Type": "application/octet-stream" },
        timeout: 0,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      toast.success(
        res.data?.mode === "replace"
          ? "Database replaced from the backup."
          : "Deleted data has been restored. No duplicates were created.",
        { id: t, duration: 6000 }
      );
      setFile(null);
      setConfirmText("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Restore failed. Please try again.", { id: t });
    } finally {
      setRestoring(false);
    }
  };

  const downloadBackup = async () => {
    setDownloading(true);
    const t = toast.loading("Preparing backup… this can take a moment.");
    try {
      const res = await api.post("/backup/run", null, { responseType: "blob" });

      // Prefer the filename the server set; fall back to a dated name.
      const cd: string = res.headers["content-disposition"] || "";
      const match = /filename="?([^"]+)"?/.exec(cd);
      const fileName =
        match?.[1] || `sfms-backup-${new Date().toISOString().slice(0, 10)}.archive.gz`;

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Backup downloaded to your computer", { id: t });
    } catch (err: any) {
      // We asked for a Blob, so an error body also arrives as a Blob — read it.
      let msg = "Backup failed. Please try again.";
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try {
          msg = JSON.parse(await data.text())?.message || msg;
        } catch {
          /* keep default */
        }
      } else if (data?.message) {
        msg = data.message;
      }
      toast.error(msg, { id: t });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backup &amp; Data Safety</h1>
        <p className="text-muted-foreground">
          Your school's data is backed up automatically every night. You can also download a copy
          right now.
        </p>
      </div>

      {/* Manual download */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DatabaseBackup className="h-5 w-5 text-primary" />
            Download a backup now
          </CardTitle>
          <CardDescription>
            Creates a fresh, compressed copy of the entire database and saves it straight to your
            computer — an instant off-site copy you fully control. Keep it somewhere safe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={downloadBackup} disabled={downloading} size="lg">
              <Download className="h-4 w-4" />
              {downloading ? "Preparing backup…" : "Download backup now"}
            </Button>
            <Button onClick={backupToDrive} disabled={savingDrive} size="lg" variant="outline">
              <CloudUpload className="h-4 w-4" />
              {savingDrive ? "Saving to Google Drive…" : "Back up to Google Drive now"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <b>Download</b> saves a compressed <code>.archive.gz</code> to your computer.
            <b> Google Drive</b> saves a dated copy (e.g. “RKPS 26 Jul 2026, 10-23 pm”) to your
            Drive backup folder. Both contain all school records — keep them private.
          </p>
        </CardContent>
      </Card>

      {/* Restore from a backup file */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-primary" />
            Restore from a backup
          </CardTitle>
          <CardDescription>
            Lost or accidentally deleted data? Upload a backup file to bring it back. A safety copy
            of the current data is taken automatically first, so this is always reversible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 1. File */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">1. Choose your backup file</label>
            <input
              type="file"
              accept=".gz,.archive,application/gzip"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full cursor-pointer rounded-md border border-input bg-background text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-secondary/80"
            />
            {file && (
              <p className="mt-1 text-xs text-muted-foreground">
                Selected: <span className="font-medium">{file.name}</span> (
                {(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* 2. Mode */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">2. How should it restore?</label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setMode("merge")}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  mode === "merge" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
                )}
              >
                <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    Bring back deleted data{" "}
                    <span className="text-xs font-normal text-primary">(recommended)</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Adds back any records that were deleted. Records that still exist are left as
                    they are — nothing is duplicated, and newer data is kept.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("replace")}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  mode === "replace"
                    ? "border-destructive bg-destructive/5 ring-1 ring-destructive"
                    : "hover:bg-accent"
                )}
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-medium">Replace everything with this backup</p>
                  <p className="text-xs text-muted-foreground">
                    Wipes current data and restores an exact copy of the backup. Use only for
                    corruption or a full reset — anything added after this backup will be lost.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 3. Confirm */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              3. Type <span className="font-mono font-bold">RESTORE</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTORE"
              className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <Button
            onClick={restoreBackup}
            disabled={restoring || !file || confirmText.trim().toUpperCase() !== "RESTORE"}
            variant={mode === "replace" ? "destructive" : "default"}
            size="lg"
          >
            <Upload className="h-4 w-4" />
            {restoring
              ? "Restoring…"
              : mode === "replace"
                ? "Replace database from backup"
                : "Restore deleted data"}
          </Button>
        </CardContent>
      </Card>

      {/* How the automatic backups work */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How your data stays safe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Automatic nightly backup — 2:00 AM</p>
              <p className="text-muted-foreground">
                Every night the server makes a compressed backup of the whole database, with no
                action needed from you.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <CloudUpload className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Stored off the server</p>
              <p className="text-muted-foreground">
                Each backup is uploaded to separate cloud storage, so a problem with the server
                can never take the backups with it. Older copies are kept on a rolling schedule
                (recent daily, weekly and monthly copies).
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Restorable at any time</p>
              <p className="text-muted-foreground">
                Any backup can be restored to bring the system back to how it was on that date —
                your safety net against accidental changes or data loss.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Everyday changes are already reversible</p>
              <p className="text-muted-foreground">
                Deleted students, staff, fees and exams go to the Recycle Bin, payments can be
                voided, and promotions can be undone — backups are the deeper safety net beneath
                all of that.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
