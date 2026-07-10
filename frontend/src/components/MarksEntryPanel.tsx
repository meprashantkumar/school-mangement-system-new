import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import type { ExamEntry } from "@/types";
import { cn } from "@/lib/utils";
import { classLabel } from "@/lib/constants";

type CellStatus = "idle" | "saving" | "saved" | "error";
interface Cell {
  value: string;
  absent: boolean;
  status: CellStatus;
}

/**
 * Subject-by-subject marks entry — pick a subject, then run down the roster typing
 * marks (or tap AB for absent). Each change auto-saves in the background. Used by
 * both the teacher dashboard and the admin exam page (via the save/clear callbacks).
 */
export function MarksEntryPanel({
  entry,
  save,
  clear,
  disabled,
}: {
  entry: ExamEntry;
  save: (studentId: string, subjectId: string, payload: { marksObtained?: number; absent?: boolean }) => Promise<void>;
  clear: (studentId: string, subjectId: string) => Promise<void>;
  disabled?: boolean;
}) {
  const subjects = entry.exam.subjects;
  const [subjectId, setSubjectId] = useState(subjects[0]?.subject || "");
  const subject = subjects.find((s) => s.subject === subjectId);
  const [local, setLocal] = useState<Record<string, Cell>>({});

  // (Re)seed local state whenever a fresh roster arrives.
  useEffect(() => {
    const init: Record<string, Cell> = {};
    entry.students.forEach((st) => {
      subjects.forEach((sub) => {
        const m = st.marks[sub.subject];
        init[`${st._id}:${sub.subject}`] = {
          value: m && m.marksObtained != null ? String(m.marksObtained) : "",
          absent: !!m?.absent,
          status: "idle",
        };
      });
    });
    setLocal(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  const setCell = (key: string, patch: Partial<Cell>) =>
    setLocal((l) => ({ ...l, [key]: { ...l[key], ...patch } }));

  const enteredCount = useMemo(() => {
    if (!subject) return 0;
    return entry.students.filter((st) => {
      const c = local[`${st._id}:${subjectId}`];
      return c && (c.absent || c.value.trim() !== "");
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, subjectId, entry]);

  const commit = async (studentId: string) => {
    if (disabled || !subject) return;
    const key = `${studentId}:${subjectId}`;
    const cell = local[key];
    if (!cell) return;
    setCell(key, { status: "saving" });
    try {
      if (cell.absent) {
        await save(studentId, subjectId, { absent: true });
      } else if (cell.value.trim() === "") {
        await clear(studentId, subjectId);
      } else {
        const n = Number(cell.value);
        if (!Number.isFinite(n) || n < 0 || n > subject.maxMarks) {
          setCell(key, { status: "error" });
          toast.error(`Enter a mark between 0 and ${subject.maxMarks}`);
          return;
        }
        await save(studentId, subjectId, { marksObtained: n });
      }
      setCell(key, { status: "saved" });
    } catch (err: any) {
      setCell(key, { status: "error" });
      toast.error(err?.response?.data?.message || "Couldn't save");
    }
  };

  const toggleAbsent = async (studentId: string) => {
    if (disabled || !subject) return;
    const key = `${studentId}:${subjectId}`;
    const cell = local[key];
    const nextAbsent = !cell.absent;
    setCell(key, { absent: nextAbsent, value: nextAbsent ? "" : cell.value, status: "saving" });
    try {
      if (nextAbsent) await save(studentId, subjectId, { absent: true });
      else await clear(studentId, subjectId);
      setCell(key, { status: "saved" });
    } catch (err: any) {
      setCell(key, { status: "error" });
      toast.error(err?.response?.data?.message || "Couldn't save");
    }
  };

  if (subjects.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">This exam has no subjects.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Subject picker */}
      <div className="flex flex-wrap gap-1.5">
        {subjects.map((s) => (
          <button
            key={s.subject}
            type="button"
            onClick={() => setSubjectId(s.subject)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              s.subject === subjectId
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {subject && (
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2 text-sm">
          <span>
            <span className="font-semibold">{subject.name}</span> · Max{" "}
            <span className="font-semibold">{subject.maxMarks}</span> · Pass {subject.passMarks}
          </span>
          <span className="text-muted-foreground">
            {enteredCount}/{entry.students.length} entered
          </span>
        </div>
      )}

      {disabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          This exam is published — marks are locked. Ask the admin to unlock it to make changes.
        </p>
      )}

      <div className="space-y-2">
        {entry.students.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No active students in {classLabel(entry.exam.class)}-{entry.section}.
          </p>
        ) : (
          entry.students.map((st, i) => {
            const key = `${st._id}:${subjectId}`;
            const cell = local[key] || { value: "", absent: false, status: "idle" as CellStatus };
            return (
              <div key={st._id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <div className="w-7 shrink-0 text-center text-sm font-semibold text-muted-foreground">
                  {st.rollNo || i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{st.name}</p>
                  <p className="text-xs text-muted-foreground">Adm {st.admissionNo}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="w-4">
                    {cell.status === "saving" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {cell.status === "saved" && <Check className="h-4 w-4 text-emerald-600" />}
                    {cell.status === "error" && <AlertCircle className="h-4 w-4 text-rose-600" />}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={subject?.maxMarks}
                    disabled={disabled || cell.absent}
                    value={cell.absent ? "" : cell.value}
                    placeholder={cell.absent ? "AB" : "—"}
                    onChange={(e) => setCell(key, { value: e.target.value, status: "idle" })}
                    onBlur={() => commit(st._id)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className={cn(
                      "h-11 w-20 rounded-lg border-2 text-center text-base font-semibold outline-none transition-colors",
                      cell.status === "error"
                        ? "border-rose-400"
                        : cell.value.trim() !== ""
                          ? "border-primary/40"
                          : "border-input",
                      "focus:border-primary disabled:bg-muted"
                    )}
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleAbsent(st._id)}
                    aria-label="Mark absent"
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-lg border-2 text-sm font-bold transition-colors",
                      cell.absent
                        ? "border-rose-600 bg-rose-500 text-white"
                        : "border-rose-200 text-rose-600 hover:bg-rose-50"
                    )}
                  >
                    AB
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
