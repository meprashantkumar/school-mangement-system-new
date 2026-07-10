import { useEffect, useState } from "react";
import { ArrowUpCircle, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { PromotionRun, Student } from "@/types";
import { CLASSES, SECTIONS, classLabel, nextClass, nextSession } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function PromoteStudentsDialog({
  open,
  onOpenChange,
  sessions,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessions: string[];
  onDone: () => void;
}) {
  // Default the "from" session to the oldest present — that's usually the batch
  // still waiting to be promoted.
  const defaultFrom = sessions[sessions.length - 1] || "2026-27";

  const [fromSession, setFromSession] = useState(defaultFrom);
  const [toSession, setToSession] = useState(nextSession(defaultFrom));
  const [klass, setKlass] = useState("");
  const [section, setSection] = useState(""); // "" = all sections
  const [preview, setPreview] = useState<Student[]>([]);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [runs, setRuns] = useState<PromotionRun[]>([]);
  const [undoing, setUndoing] = useState<string | null>(null);

  const loadRuns = () =>
    api
      .get("/students/promote/runs")
      .then(({ data }) => setRuns((data.runs || []).filter((r: PromotionRun) => !r.undone)))
      .catch(() => {});

  const undoRun = async (run: PromotionRun) => {
    if (!confirm(`Undo "${run.summary}"? Every student in that batch goes back to where they were.`)) return;
    setUndoing(run._id);
    try {
      const { data } = await api.post(`/students/promote/undo/${run._id}`);
      toast.success(data.message);
      await loadRuns();
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Undo failed");
    } finally {
      setUndoing(null);
    }
  };

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      const from = sessions[sessions.length - 1] || "2026-27";
      setFromSession(from);
      setToSession(nextSession(from));
      setKlass("");
      setSection("");
      setPreview([]);
      setFailedIds(new Set());
      loadRuns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load the matching roster whenever the source (session/class/section) changes.
  useEffect(() => {
    if (!open || !klass) {
      setPreview([]);
      return;
    }
    setLoading(true);
    setFailedIds(new Set());
    api
      .get("/students", {
        params: {
          session: fromSession,
          class: klass,
          section: section || undefined,
          status: "active",
          all: 1,
        },
      })
      .then(({ data }) => setPreview(data.students))
      .catch(() => toast.error("Failed to load students"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fromSession, klass, section]);

  const toggleFailed = (id: string) =>
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const promoteTo = nextClass(klass);
  const graduating = klass && promoteTo === null;

  const submit = async () => {
    if (!klass) return toast.error("Pick a class to promote");
    if (!/^\d{4}-\d{2}$/.test(toSession.trim())) {
      return toast.error('Target session must look like "2027-28"');
    }
    if (fromSession === toSession) return toast.error("Target session must differ");
    setPromoting(true);
    try {
      const { data } = await api.post("/students/promote", {
        fromSession,
        fromClass: klass,
        fromSection: section || undefined,
        toSession,
        failedIds: [...failedIds],
      });
      toast.success(`${data.message} You can undo this from "Recent promotions".`);
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Promotion failed");
    } finally {
      setPromoting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-primary" /> Promote Class
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          {runs.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="mb-2 text-sm font-medium">Recent promotions — undo a mistake</p>
              <div className="space-y-1.5">
                {runs.slice(0, 5).map((r) => (
                  <div key={r._id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-muted-foreground">{r.summary}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => undoRun(r)}
                      disabled={undoing === r._id}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {undoing === r._id ? "Undoing…" : "Undo"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>From session</Label>
              <select
                className={selectClass}
                value={fromSession}
                onChange={(e) => {
                  setFromSession(e.target.value);
                  setToSession(nextSession(e.target.value));
                }}
              >
                {sessions.length === 0 && <option value={fromSession}>{fromSession}</option>}
                {sessions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <select className={selectClass} value={klass} onChange={(e) => setKlass(e.target.value)}>
                <option value="">Select</option>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {classLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <select className={selectClass} value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">All sections</option>
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>To session</Label>
              <Input value={toSession} onChange={(e) => setToSession(e.target.value)} />
            </div>
          </div>

          {klass && (
            <p className="text-sm text-muted-foreground">
              {graduating ? (
                <>
                  Class 12 passers will be marked <strong>left (graduated)</strong>. Tick anyone who
                  is being retained.
                </>
              ) : (
                <>
                  Students advance to <strong>{classLabel(promoteTo!)}</strong> (same section) for{" "}
                  <strong>{toSession}</strong>. Tick anyone who <strong>failed</strong> — they repeat{" "}
                  {classLabel(klass)}.
                </>
              )}
            </p>
          )}

          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-sm font-medium">
              <span>
                {klass ? `Class ${classLabel(klass)}${section ? " " + section : " (all sections)"}` : "Pick a class"}
              </span>
              <span className="text-muted-foreground">
                {loading ? "Loading…" : `${preview.length} student(s)`}
                {failedIds.size ? ` · ${failedIds.size} retained` : ""}
              </span>
            </div>
            <div className="max-h-64 divide-y overflow-y-auto">
              {!loading && preview.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {klass
                    ? "No active students match this session / class / section."
                    : "Choose a class to see who will be promoted."}
                </p>
              )}
              {preview.map((s) => (
                <label
                  key={s._id}
                  className="flex cursor-pointer items-center justify-between px-4 py-2 text-sm hover:bg-muted/30"
                >
                  <span>
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-muted-foreground">
                      · {s.admissionNo} · {classLabel(s.class)}
                      {s.section ? `-${s.section}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={failedIds.has(s._id)}
                      onChange={() => toggleFailed(s._id)}
                    />
                    Retain
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={promoting || !klass || preview.length === 0}>
            {promoting ? "Promoting…" : `Promote ${preview.length || ""} student(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
