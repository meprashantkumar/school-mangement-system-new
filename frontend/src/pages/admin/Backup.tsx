import { useState } from "react";
import { DatabaseBackup, Download, ShieldCheck, Clock, RotateCcw, CloudUpload } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Backup() {
  const [downloading, setDownloading] = useState(false);

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
          <Button onClick={downloadBackup} disabled={downloading} size="lg">
            <Download className="h-4 w-4" />
            {downloading ? "Preparing backup…" : "Download backup now"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            The file is a compressed <code>.archive.gz</code> database dump. Store it privately —
            it contains all school records.
          </p>
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
