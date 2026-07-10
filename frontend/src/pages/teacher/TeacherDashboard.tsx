import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCheck,
  PalmtreeIcon,
  Sun,
  Check,
  X,
  ClipboardCheck,
  Trophy,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { classLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AttendanceRow, AttendanceStatus, RosterDay, TeacherAssignment } from "@/types";
import { Button } from "@/components/ui/button";
import { Crest } from "@/components/Brand";
import { TeacherResults } from "@/components/TeacherResults";

const todayKey = () => new Date().toLocaleDateString("en-CA"); // "YYYY-MM-DD" (local)

const addDays = (key: string, delta: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
};

const prettyDate = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const asgKey = (a: { class: string; section: string }) => `${a.class}|${a.section}`;

/** Recompute a student's running % after their mark on the viewed day changes. */
const applyMark = (row: AttendanceRow, next: AttendanceStatus | null): AttendanceRow => {
  let { present, absent } = row;
  if (row.status === "present") present -= 1;
  else if (row.status === "absent") absent -= 1;
  if (next === "present") present += 1;
  else if (next === "absent") absent += 1;
  const total = present + absent;
  return { ...row, status: next, present, absent, pct: total > 0 ? Math.round((present / total) * 100) : null };
};

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null)
    return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">—</span>;
  const good = pct >= 75;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-bold",
        good ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
      )}
    >
      {pct}%
    </span>
  );
}

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [loadedProfile, setLoadedProfile] = useState(false);
  const [selected, setSelected] = useState<{ class: string; section: string } | null>(null);
  const [date, setDate] = useState(todayKey());
  const [roster, setRoster] = useState<RosterDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulking, setBulking] = useState(false);
  const [tab, setTab] = useState<"attendance" | "results">("attendance");

  // Load the teacher's assigned classes once.
  useEffect(() => {
    api
      .get("/teacher/me")
      .then(({ data }) => {
        setAssignments(data.assignments || []);
        if (data.assignments?.[0]) {
          setSelected({ class: data.assignments[0].class, section: data.assignments[0].section });
        }
      })
      .catch(() => {})
      .finally(() => setLoadedProfile(true));
  }, []);

  const loadRoster = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const { data } = await api.get("/teacher/attendance", {
        params: { class: selected.class, section: selected.section, date },
      });
      setRoster(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't load class");
      setRoster(null);
    } finally {
      setLoading(false);
    }
  }, [selected, date]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const dayInfo = roster?.dayInfo;
  const offDay = !!dayInfo && (dayInfo.sunday || dayInfo.holiday);

  const counts = useMemo(() => {
    if (!roster) return null;
    let present = 0;
    let absent = 0;
    const pcts: number[] = [];
    roster.students.forEach((s) => {
      if (s.status === "present") present += 1;
      else if (s.status === "absent") absent += 1;
      if (s.pct !== null) pcts.push(s.pct);
    });
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    return { present, absent, unmarked: roster.students.length - present - absent, total: roster.students.length, avg };
  }, [roster]);

  // Optimistic single mark — flips instantly, saves in the background. Tapping the
  // already-active status clears it (back to "not marked") so mistakes are undoable.
  const mark = async (row: AttendanceRow, status: AttendanceStatus) => {
    if (!roster || offDay) return;
    const clearing = row.status === status;
    const next = clearing ? null : status;
    const prev = row.status;
    setRoster((r) =>
      r ? { ...r, students: r.students.map((s) => (s._id === row._id ? applyMark(s, next) : s)) } : r
    );
    try {
      if (clearing) {
        await api.delete("/teacher/attendance", { data: { studentId: row._id, date } });
      } else {
        await api.post("/teacher/attendance", { studentId: row._id, date, status });
      }
    } catch (err: any) {
      setRoster((r) =>
        r ? { ...r, students: r.students.map((s) => (s._id === row._id ? applyMark(s, prev) : s)) } : r
      );
      toast.error(err?.response?.data?.message || "Couldn't save — try again");
    }
  };

  const markAllPresent = async () => {
    if (!roster || offDay) return;
    setBulking(true);
    try {
      await api.post("/teacher/attendance/bulk", {
        class: roster.class,
        section: roster.section,
        date,
        status: "present",
      });
      await loadRoster();
      toast.success("Marked everyone present");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't mark all");
    } finally {
      setBulking(false);
    }
  };

  const markHoliday = async () => {
    const name = window.prompt("Holiday name (e.g. Diwali, Republic Day)");
    if (!name || !name.trim()) return;
    try {
      await api.post("/holidays", { date, name: name.trim() });
      await loadRoster();
      toast.success("Marked as holiday");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't save holiday");
    }
  };

  const removeHoliday = async () => {
    try {
      await api.delete(`/holidays/${date}`);
      await loadRoster();
      toast.success("Holiday removed");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't remove holiday");
    }
  };

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Crest size="sm" />
          <div className="leading-tight">
            <div className="font-heading text-sm font-bold">Attendance</div>
            <div className="text-xs text-muted-foreground">Hi, {user?.name?.split(" ")[0]}</div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" /> Logout
        </Button>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {!loadedProfile ? (
          <p className="py-16 text-center text-muted-foreground">Loading…</p>
        ) : assignments.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <p className="font-heading text-lg font-semibold">No class assigned yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Please ask the school admin to assign you a class and section.
            </p>
          </div>
        ) : (
          <>
            {/* Class selector */}
            {assignments.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {assignments.map((a) => {
                  const active = selected && asgKey(selected) === asgKey(a);
                  return (
                    <button
                      key={asgKey(a)}
                      onClick={() => setSelected({ class: a.class, section: a.section })}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-card hover:bg-accent"
                      )}
                    >
                      {classLabel(a.class)}-{a.section}
                    </button>
                  );
                })}
              </div>
            ) : (
              selected && (
                <div className="text-lg font-heading font-bold">
                  {classLabel(selected.class)} · Section {selected.section}
                </div>
              )
            )}

            {/* Tabs */}
            <div className="flex gap-2">
              <Button
                variant={tab === "attendance" ? "default" : "outline"}
                onClick={() => setTab("attendance")}
                className="flex-1"
              >
                <ClipboardCheck className="h-4 w-4" /> Attendance
              </Button>
              <Button
                variant={tab === "results" ? "default" : "outline"}
                onClick={() => setTab("results")}
                className="flex-1"
              >
                <Trophy className="h-4 w-4" /> Results
              </Button>
            </div>

            {tab === "results" && selected && (
              <TeacherResults klass={selected.class} section={selected.section} />
            )}

            {tab === "attendance" && (
            <>
            {/* Date control */}
            <div className="flex items-center gap-2 rounded-xl border bg-card p-2">
              <Button variant="ghost" size="icon" onClick={() => setDate((d) => addDays(d, -1))}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <label className="flex flex-1 items-center justify-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="bg-transparent text-center text-sm font-medium outline-none"
                />
              </label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDate((d) => addDays(d, 1))}
                disabled={date >= todayKey()}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
              {date !== todayKey() && (
                <Button variant="outline" size="sm" onClick={() => setDate(todayKey())}>
                  Today
                </Button>
              )}
            </div>
            <p className="text-center text-sm font-medium text-muted-foreground">{prettyDate(date)}</p>

            {/* Off-day banner or roster */}
            {loading ? (
              <p className="py-16 text-center text-muted-foreground">Loading…</p>
            ) : offDay ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
                {dayInfo?.sunday ? (
                  <Sun className="mx-auto h-10 w-10 text-amber-500" />
                ) : (
                  <PalmtreeIcon className="mx-auto h-10 w-10 text-amber-500" />
                )}
                <p className="mt-3 font-heading text-lg font-semibold text-amber-900">
                  {dayInfo?.sunday ? "Sunday — weekly off" : `Holiday: ${dayInfo?.holidayName}`}
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  No attendance is taken on this day and it doesn't count toward the percentage.
                </p>
                {dayInfo?.holiday && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={removeHoliday}>
                    Remove holiday
                  </Button>
                )}
              </div>
            ) : (
              roster && (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-4 gap-2 rounded-xl border bg-card p-3 text-center">
                    <div>
                      <p className="text-xl font-bold text-emerald-600">{counts?.present}</p>
                      <p className="text-xs text-muted-foreground">Present</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-rose-600">{counts?.absent}</p>
                      <p className="text-xs text-muted-foreground">Absent</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-muted-foreground">{counts?.unmarked}</p>
                      <p className="text-xs text-muted-foreground">Left</p>
                    </div>
                    <div>
                      <p
                        className={cn(
                          "text-xl font-bold",
                          counts?.avg == null
                            ? "text-muted-foreground"
                            : counts.avg >= 75
                              ? "text-emerald-600"
                              : "text-rose-600"
                        )}
                      >
                        {counts?.avg == null ? "—" : `${counts.avg}%`}
                      </p>
                      <p className="text-xs text-muted-foreground">Class avg</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={markAllPresent} disabled={bulking} className="flex-1">
                      <CheckCheck className="h-4 w-4" /> Mark all present
                    </Button>
                    <Button variant="outline" onClick={markHoliday}>
                      <PalmtreeIcon className="h-4 w-4" /> Holiday
                    </Button>
                  </div>

                  {/* Roster */}
                  <div className="space-y-2">
                    {roster.students.length === 0 ? (
                      <p className="py-10 text-center text-muted-foreground">
                        No active students in this class yet.
                      </p>
                    ) : (
                      roster.students.map((s, i) => (
                        <div
                          key={s._id}
                          className="flex items-center gap-3 rounded-xl border bg-card p-3"
                        >
                          <div className="w-7 shrink-0 text-center text-sm font-semibold text-muted-foreground">
                            {s.rollNo || i + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{s.name}</p>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Adm {s.admissionNo}</span>
                              <PctBadge pct={s.pct} />
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              onClick={() => mark(s, "present")}
                              aria-label="Present"
                              className={cn(
                                "flex h-11 w-11 items-center justify-center rounded-lg border-2 text-base font-bold transition-colors",
                                s.status === "present"
                                  ? "border-emerald-600 bg-emerald-500 text-white"
                                  : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                              )}
                            >
                              {s.status === "present" ? <Check className="h-5 w-5" /> : "P"}
                            </button>
                            <button
                              onClick={() => mark(s, "absent")}
                              aria-label="Absent"
                              className={cn(
                                "flex h-11 w-11 items-center justify-center rounded-lg border-2 text-base font-bold transition-colors",
                                s.status === "absent"
                                  ? "border-rose-600 bg-rose-500 text-white"
                                  : "border-rose-200 text-rose-600 hover:bg-rose-50"
                              )}
                            >
                              {s.status === "absent" ? <X className="h-5 w-5" /> : "A"}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )
            )}
            </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
