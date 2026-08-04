import { useState } from "react";
import { KeyRound, Printer, Download, AlertTriangle, Shuffle } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { CLASSES, SECTIONS, classLabel } from "@/lib/constants";
import { SCHOOL } from "@/lib/school";
import { cn } from "@/lib/utils";
import { downloadFile, toCSV } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Slip {
  student: string;
  admissionNo: string;
  parent: string;
  phone: string;
  password: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}

// Creating parent logins one at a time doesn't scale to a whole school, so this
// does an entire class in one action and hands back the slips to print and give
// out. Siblings sharing a mobile number get a single login between them.
const MIN_PASSWORD = 8;

export default function BulkAccessDialog({ open, onOpenChange, onDone }: Props) {
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [mode, setMode] = useState<"random" | "shared">("random");
  const [shared, setShared] = useState("");
  const [running, setRunning] = useState(false);
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [summary, setSummary] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const sharedTooShort = mode === "shared" && shared.trim().length < MIN_PASSWORD;

  const reset = () => {
    setSlips(null);
    setSummary("");
    setErrors([]);
  };

  const run = async () => {
    if (!cls) return toast.error("Pick a class");
    if (mode === "shared" && sharedTooShort) {
      return toast.error(`Password must be at least ${MIN_PASSWORD} characters`);
    }
    setRunning(true);
    try {
      const { data } = await api.post("/access/students/bulk", {
        class: cls,
        section: section || undefined,
        password: mode === "shared" ? shared.trim() : undefined,
      });
      setSlips(data.slips || []);
      setSummary(data.message);
      setErrors(data.errors || []);
      toast.success(data.message);
      onDone?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not create logins");
    } finally {
      setRunning(false);
    }
  };

  const exportCsv = () => {
    if (!slips?.length) return;
    downloadFile(
      `parent-logins-${cls}${section ? `-${section}` : ""}.csv`,
      toCSV(slips as any, ["admissionNo", "student", "parent", "phone", "password"]),
      "text/csv;charset=utf-8"
    );
  };

  const printSlips = () => {
    if (!slips?.length) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return toast.error("Allow pop-ups to print the slips");
    const esc = (s: string) =>
      String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
    const cards = slips
      .map(
        (s) => `
      <div class="slip">
        <div class="school">${esc(SCHOOL.fullName)}</div>
        <div class="row"><span>Student</span><b>${esc(s.student)} (${esc(s.admissionNo)})</b></div>
        <div class="row"><span>Parent</span><b>${esc(s.parent)}</b></div>
        <div class="row"><span>Website</span><b>${esc(window.location.origin)}</b></div>
        <div class="row"><span>Mobile number</span><b class="mono">${esc(s.phone)}</b></div>
        <div class="row"><span>Password</span><b class="mono big">${esc(s.password)}</b></div>
        <div class="note">Keep this safe. To change the password, contact the school office.</div>
      </div>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>Parent logins — ${esc(
      classLabel(cls)
    )}</title><style>
      @page { size: A4; margin: 10mm; }
      body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
      .slip { border: 1px dashed #94a3b8; border-radius: 6px; padding: 6mm; break-inside: avoid; }
      .school { font-weight: 800; font-size: 13px; margin-bottom: 4mm; color: #1e3a8a; }
      .row { display: flex; justify-content: space-between; gap: 4mm; font-size: 12px; margin: 1.5mm 0; }
      .row span { color: #64748b; }
      .mono { font-family: Consolas, monospace; }
      .big { font-size: 15px; letter-spacing: 1px; }
      .note { margin-top: 3mm; font-size: 9.5px; color: #64748b; }
    </style></head><body><div class="grid">${cards}</div></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Give dashboard access to a whole class
          </DialogTitle>
          <DialogDescription>
            Creates a parent login for every active student in the class, using the mobile number on
            each record. Print the slips and hand them out.
          </DialogDescription>
        </DialogHeader>

        {slips ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{summary}</p>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Adm. no.</th>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Mobile</th>
                    <th className="px-3 py-2">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {slips.map((s) => (
                    <tr key={s.admissionNo} className="border-t">
                      <td className="px-3 py-1.5">{s.admissionNo}</td>
                      <td className="px-3 py-1.5">{s.student}</td>
                      <td className="px-3 py-1.5 font-mono">{s.phone}</td>
                      <td className="px-3 py-1.5 font-mono font-semibold">{s.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                These passwords are shown <b>once</b> — they're stored encrypted. Print or export
                them now. A lost password can be replaced from the student's row later.
              </p>
            </div>

            {errors.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="mb-1 text-sm font-semibold text-rose-700">
                  {errors.length} student(s) skipped
                </p>
                <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-rose-700">
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-rose-600/80">
                  Usually a missing or invalid mobile number on the student record.
                </p>
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={printSlips}>
                  <Printer className="h-4 w-4" /> Print slips
                </Button>
                <Button variant="outline" onClick={exportCsv}>
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              </div>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Class <span className="text-rose-500">*</span>
                </Label>
                <select className={selectClass} value={cls} onChange={(e) => setCls(e.target.value)}>
                  <option value="">Select class</option>
                  {CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {classLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Section (optional)</Label>
                <select
                  className={selectClass}
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                >
                  <option value="">All sections</option>
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {/* Password strategy */}
            <div className="space-y-2">
              <Label>Passwords</Label>
              <button
                type="button"
                onClick={() => setMode("random")}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  mode === "random" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
                )}
              >
                <Shuffle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    A different password for each parent{" "}
                    <span className="text-xs font-normal text-primary">(recommended)</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Each family gets their own random 8-character password. Most secure — one
                    parent can never sign in as another.
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("shared")}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  mode === "shared" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
                )}
              >
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">One password for the whole class</p>
                  <p className="text-xs text-muted-foreground">
                    Everyone gets the same password — far easier to hand out and explain.
                  </p>
                </div>
              </button>

              {mode === "shared" && (
                <div className="space-y-2 rounded-lg border p-3">
                  <Label className="text-xs">Password for everyone in this class</Label>
                  <Input
                    value={shared}
                    onChange={(e) => setShared(e.target.value)}
                    placeholder={`At least ${MIN_PASSWORD} characters`}
                    autoFocus
                  />
                  {shared.length > 0 && sharedTooShort && (
                    <p className="text-xs text-rose-600">
                      Too short — {MIN_PASSWORD} characters minimum ({shared.trim().length} so far).
                    </p>
                  )}
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      <b>Everyone shares this password.</b> Since mobile numbers are easy to learn,
                      any parent who knows it could sign in as another parent and see their child's
                      fees. Ask families to change it — or use a different password per parent.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              Students who already have a login get a <b>new password</b> instead of a duplicate
              account. Siblings sharing one mobile number share a single login.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
                Cancel
              </Button>
              <Button onClick={run} disabled={running || !cls || sharedTooShort}>
                {running ? "Creating…" : "Create logins"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
