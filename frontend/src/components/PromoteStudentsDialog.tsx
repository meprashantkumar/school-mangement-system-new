import { useEffect, useState } from "react";
import { useSettings, type SessionReadiness, type SessionUndo } from "@/context/SettingsContext";
import { ArrowUpCircle, CalendarClock, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { PromotionRun, Student } from "@/types";
import { CLASSES, SECTIONS, classLabel, classesUpTo, nextClassWithin, nextSession } from "@/lib/constants";
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
  // How far this school goes, and which year it is running. Promotion stops at the
  // last class, and every register is read for the running session.
  const {
    highestClass,
    currentSession,
    nextSession: followingSession,
    readiness,
    save,
    refresh,
  } = useSettings();
  const [savingHighest, setSavingHighest] = useState(false);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [rolloverTo, setRolloverTo] = useState("");
  const [rolloverCheck, setRolloverCheck] = useState<SessionReadiness | null>(null);
  const [rollingOver, setRollingOver] = useState(false);
  // Starting a session is reversible, like a promotion — this is what it would take
  // back, and what was entered in the meantime that it cannot.
  const [sessionUndo, setSessionUndo] = useState<SessionUndo | null>(null);
  const [undoingSession, setUndoingSession] = useState(false);

  const loadSessionUndo = () =>
    api
      .get("/settings/session-undo")
      .then(({ data }) => setSessionUndo(data.canUndo ? data : null))
      .catch(() => setSessionUndo(null));

  const undoSession = async () => {
    const entered = sessionUndo?.entered;
    const strandedCount = entered ? Object.values(entered).reduce((a, b) => a + b, 0) : 0;
    const warning = strandedCount
      ? `\n\n${strandedCount} record(s) were entered while ${sessionUndo?.from} was running. Those belong to ${sessionUndo?.from} and stay hidden until you start it again.`
      : "";
    if (!confirm(`Go back to ${sessionUndo?.back}? Nothing is deleted either way.${warning}`)) return;
    setUndoingSession(true);
    try {
      const { data } = await api.post("/settings/session-undo");
      toast.success(data.message, { duration: 9000 });
      await refresh();
      await loadSessionUndo();
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not undo that");
    } finally {
      setUndoingSession(false);
    }
  };

  const saveHighestClass = async (value: string) => {
    setSavingHighest(true);
    try {
      const message = await save({ highestClass: value });
      toast.success(message);
      if (klass && !classesUpTo(value).includes(klass)) setKlass("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not save that");
    } finally {
      setSavingHighest(false);
    }
  };

  // What the school would find in the target session — students already promoted
  // into it, and the three things that have to follow before it feels ready.
  const openRollover = async () => {
    const target = followingSession || nextSession(currentSession);
    setRolloverTo(target);
    setRolloverCheck(null);
    setRolloverOpen(true);
    try {
      const { data } = await api.get("/settings/session-readiness", {
        params: { session: target },
      });
      setRolloverCheck(data.readiness);
    } catch {
      /* the dialog still works without the preview */
    }
  };

  const startNewSession = async () => {
    if (!/^\d{4}-\d{2}$/.test(rolloverTo.trim())) {
      return toast.error('A session looks like "2027-28"');
    }
    setRollingOver(true);
    try {
      const message = await save({ currentSession: rolloverTo.trim() });
      toast.success(message);
      setRolloverOpen(false);
      await loadSessionUndo(); // the undo becomes available straight away
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not start the new session");
    } finally {
      setRollingOver(false);
    }
  };

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
      refresh();
      loadSessionUndo();
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

  const promoteTo = nextClassWithin(klass, highestClass);
  const passingOut = !!klass && promoteTo === null;

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
      // Their new class is invisible until the school starts that session, so say so
      // here rather than let it be found when a register comes up empty.
      if (data.sessionWarning) {
        toast.error(data.sessionWarning, { duration: 12000 });
        await refresh();
        setRolloverTo(toSession);
        onDone();
        return; // keep the dialog open — starting the session is the next step
      }
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

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span>
              <span className="text-muted-foreground">Running session</span>{" "}
              <b>{currentSession}</b>
              {readiness && readiness.classTeachers === 0 && readiness.students > 0 && (
                <span className="ml-2 text-amber-700">· no class teacher assigned yet</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {sessionUndo?.canUndo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={undoSession}
                  disabled={undoingSession}
                  title={`Go back to ${sessionUndo.back}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {undoingSession ? "Undoing…" : `Undo — back to ${sessionUndo.back}`}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={openRollover}>
                <CalendarClock className="h-3.5 w-3.5" /> Start new session
              </Button>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">This school teaches up to</span>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={highestClass}
              disabled={savingHighest}
              onChange={(e) => saveHighestClass(e.target.value)}
            >
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {classLabel(c)}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">
              — students who pass {classLabel(highestClass)} have finished school.
            </span>
          </div>

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
                {classesUpTo(highestClass).map((c) => (
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
              {passingOut ? (
                <>
                  {classLabel(klass)} is the last class here, so those who pass are marked{" "}
                  <strong>passed out</strong> — you can print their certificates afterwards, and
                  re-admit any of them later if the school adds a higher class. Tick anyone being{" "}
                  <strong>retained</strong> instead.
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
                {klass
                  ? `${classLabel(klass)}${section ? " " + section : " (all sections)"}`
                  : "Pick a class"}
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
            {promoting
              ? "Working…"
              : passingOut
              ? `Pass out ${preview.length || ""} student(s)`
              : `Promote ${preview.length || ""} student(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Starting the new academic year: the one action that makes the promoted
          classes visible, and the checklist that has to follow it. */}
      <Dialog open={rolloverOpen} onOpenChange={setRolloverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" /> Start a new session
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Registers, timetables, exams and each teacher's own classes are all read for
              the session the school is running. Nothing is deleted when you move it —{" "}
              <b>{currentSession}</b> stays on record exactly as it is, and attendance
              percentages start fresh in the new year.
            </p>
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">Move from {currentSession} to</Label>
              <Input
                className="h-9 w-32"
                value={rolloverTo}
                onChange={(e) => setRolloverTo(e.target.value)}
                placeholder="2027-28"
              />
            </div>

            {rolloverCheck && (
              <div className="rounded-lg border">
                <div className="border-b bg-muted/40 px-3 py-2 font-medium">
                  What's ready in {rolloverCheck.session}
                </div>
                <ul className="divide-y">
                  {[
                    { label: "Students promoted into it", n: rolloverCheck.students, need: true },
                    { label: "Class teachers assigned", n: rolloverCheck.classTeachers, need: true },
                    { label: "Fee structures created", n: rolloverCheck.structures, need: true },
                    { label: "Holidays added", n: rolloverCheck.holidays, need: false },
                  ].map((row) => (
                    <li key={row.label} className="flex items-center justify-between px-3 py-1.5">
                      <span>{row.label}</span>
                      <span
                        className={
                          row.n > 0
                            ? "font-medium text-emerald-600"
                            : row.need
                            ? "font-medium text-amber-600"
                            : "text-muted-foreground"
                        }
                      >
                        {row.n > 0 ? row.n : row.need ? "none yet" : "none"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-muted-foreground">
              You can start the session first and fill these in afterwards — but until a
              class has a class teacher and a fee structure, nobody can mark its attendance
              or bill it.
            </p>
            <p className="text-muted-foreground">
              Done by mistake? <b>Undo</b> appears next to this button and puts the school
              straight back on {currentSession}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRolloverOpen(false)}>
              Cancel
            </Button>
            <Button onClick={startNewSession} disabled={rollingOver || !rolloverTo.trim()}>
              {rollingOver ? "Starting…" : `Start ${rolloverTo || "the new session"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
