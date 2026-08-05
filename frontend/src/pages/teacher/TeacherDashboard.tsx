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
  CalendarRange,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { classLabel } from "@/lib/constants";
import { SCHOOL } from "@/lib/school";
import { cn } from "@/lib/utils";
import type { AttendanceRow, AttendanceStatus, RosterDay, TeacherAssignment } from "@/types";
import { Button } from "@/components/ui/button";
import { Crest } from "@/components/Brand";
import { TeacherResults } from "@/components/TeacherResults";
import { TeacherTimetableTab } from "@/components/TeacherTimetableTab";
import { TeacherChildrenTab } from "@/components/TeacherChildrenTab";

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

type TabKey = "attendance" | "results" | "timetable" | "children";

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
  const [tab, setTab] = useState<TabKey>("attendance");
  // Only staff whose own child studies here get the "My children" tab, so it
  // stays out of the way for everyone else.
  const [hasChildren, setHasChildren] = useState(false);

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

    // Staff ward: does this staff member have a child enrolled here?
    api
      .get("/teacher/children")
      .then(({ data }) => setHasChildren((data.students || []).length > 0))
      .catch(() => {});
  }, []);

  // `isStale` lets the caller cancel: tapping through days quickly leaves several
  // requests in flight, and without it the slowest one wins and the screen shows a
  // different day than the date bar says. Callers that refresh after a change (marking
  // a holiday, say) pass nothing — theirs is the only request running.
  const loadRoster = useCallback(
    async (isStale?: () => boolean) => {
      if (!selected) return;
      setLoading(true);
      try {
        const { data } = await api.get("/teacher/attendance", {
          params: { class: selected.class, section: selected.section, date },
        });
        if (isStale?.()) return;
        setRoster(data);
      } catch (err: any) {
        if (isStale?.()) return;
        toast.error(err?.response?.data?.message || "Couldn't load class");
        setRoster(null);
      } finally {
        if (!isStale?.()) setLoading(false);
      }
    },
    [selected, date]
  );

  useEffect(() => {
    let stale = false;
    loadRoster(() => stale);
    return () => {
      stale = true;
    };
  }, [loadRoster]);

  const dayInfo = roster?.dayInfo;
  const offDay = !!dayInfo && (dayInfo.sunday || dayInfo.holiday);
  const isToday = date === todayKey();

  const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
    { key: "attendance", label: "Attendance", icon: ClipboardCheck },
    { key: "results", label: "Results", icon: Trophy },
    { key: "timetable", label: "Timetable", icon: CalendarRange },
    ...(hasChildren ? [{ key: "children" as TabKey, label: "My child", icon: GraduationCap }] : []),
  ];

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
      // A day can hold a school-wide holiday and a class-only one, so say which this
      // is. The office declares the class ones and only the office can clear them —
      // the server refuses politely if a teacher tries.
      await api.delete(`/holidays/${date}`, {
        params: { class: dayInfo?.holidayClass || "" },
      });
      await loadRoster();
      toast.success("Holiday removed");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't remove holiday");
    }
  };

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Crest size="sm" />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-heading text-sm font-bold">{SCHOOL.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              Hi, {user?.name?.split(" ")[0]}
            </div>
          </div>
        </div>
        {/* Icon-only on phones — the label costs room the class name needs. */}
        <Button variant="outline" size="sm" onClick={logout} aria-label="Logout" className="h-10 shrink-0 px-3">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-3 pb-20 sm:p-4">
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
            {/* Class selector — scrolls sideways rather than stacking into rows */}
            {assignments.length > 1 ? (
              <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                {assignments.map((a) => {
                  const active = selected && asgKey(selected) === asgKey(a);
                  return (
                    <button
                      key={asgKey(a)}
                      onClick={() => setSelected({ class: a.class, section: a.section })}
                      className={cn(
                        "h-11 shrink-0 touch-manipulation rounded-full border px-4 text-sm font-semibold transition-colors",
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
                <div className="font-heading text-base font-bold sm:text-lg">
                  {classLabel(selected.class)} · Section {selected.section}
                </div>
              )
            )}

            {/* Tabs — two rows of two on phones so nothing gets squeezed off-screen */}
            <div
              className={cn(
                "grid gap-2",
                tabs.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
              )}
            >
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <Button
                    key={t.key}
                    variant={tab === t.key ? "default" : "outline"}
                    onClick={() => setTab(t.key)}
                    className="h-11 min-w-0 touch-manipulation gap-1.5 px-2 text-xs sm:gap-2 sm:text-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </Button>
                );
              })}
            </div>

            {tab === "results" && selected && (
              <TeacherResults klass={selected.class} section={selected.section} />
            )}

            {tab === "timetable" && <TeacherTimetableTab />}

            {tab === "children" && <TeacherChildrenTab />}

            {tab === "attendance" && (
            <>
            {/* Date control. "Today" always occupies its slot (disabled when it's
                already today) so the row never reflows under the thumb. */}
            <div className="flex items-center gap-1 rounded-xl border bg-card p-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 touch-manipulation"
                aria-label="Previous day"
                onClick={() => setDate((d) => addDays(d, -1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <label className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                {/* text-base, not text-sm: iOS Safari zooms the page in when a
                    focused field is under 16px. */}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="w-full min-w-0 bg-transparent text-center text-base font-medium outline-none"
                />
              </label>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 touch-manipulation"
                aria-label="Next day"
                onClick={() => setDate((d) => addDays(d, 1))}
                disabled={date >= todayKey()}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 shrink-0 touch-manipulation px-2.5 text-xs"
                onClick={() => setDate(todayKey())}
                disabled={isToday}
              >
                Today
              </Button>
            </div>
            <p className="text-center text-sm font-medium text-muted-foreground">{prettyDate(date)}</p>

            {/* Off-day banner or roster */}
            {loading ? (
              <p className="py-16 text-center text-muted-foreground">Loading…</p>
            ) : offDay ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center sm:p-8">
                {dayInfo?.sunday ? (
                  <Sun className="mx-auto h-10 w-10 text-amber-500" />
                ) : (
                  <PalmtreeIcon className="mx-auto h-10 w-10 text-amber-500" />
                )}
                <p className="mt-3 font-heading text-lg font-semibold text-amber-900">
                  {dayInfo?.sunday ? "Sunday — weekly off" : `Holiday: ${dayInfo?.holidayName}`}
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  {dayInfo?.holidayScope === "class"
                    ? `The office has given ${
                        selected ? classLabel(selected.class) : "this class"
                      } the day off. No attendance is taken and it doesn't count toward the percentage.`
                    : "No attendance is taken on this day and it doesn't count toward the percentage."}
                </p>
                {/* Only the day the school itself is closed can be cleared here — a
                    class holiday is the office's call, so there's no button for it. */}
                {dayInfo?.holiday && dayInfo?.holidayScope !== "class" && (
                  <Button variant="outline" className="mt-4 h-11" onClick={removeHoliday}>
                    Remove holiday
                  </Button>
                )}
              </div>
            ) : (
              roster && (
                <>
                  {/* Running totals stay pinned under the header: on a phone the
                      roster is far longer than the screen, and the teacher needs
                      to see "how many left" without scrolling back up. */}
                  <div className="sticky top-16 z-20 -mx-3 border-y bg-background/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold leading-tight text-emerald-600 sm:text-xl">
                          {counts?.present}
                        </p>
                        <p className="text-[11px] text-muted-foreground sm:text-xs">Present</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold leading-tight text-rose-600 sm:text-xl">
                          {counts?.absent}
                        </p>
                        <p className="text-[11px] text-muted-foreground sm:text-xs">Absent</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold leading-tight text-muted-foreground sm:text-xl">
                          {counts?.unmarked}
                        </p>
                        <p className="text-[11px] text-muted-foreground sm:text-xs">Left</p>
                      </div>
                      <div>
                        <p
                          className={cn(
                            "text-lg font-bold leading-tight sm:text-xl",
                            counts?.avg == null
                              ? "text-muted-foreground"
                              : counts.avg >= 75
                                ? "text-emerald-600"
                                : "text-rose-600"
                          )}
                        >
                          {counts?.avg == null ? "—" : `${counts.avg}%`}
                        </p>
                        <p className="text-[11px] text-muted-foreground sm:text-xs">Class avg</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      onClick={markAllPresent}
                      disabled={bulking}
                      className="h-11 flex-1 touch-manipulation"
                    >
                      <CheckCheck className="h-4 w-4" /> Mark all present
                    </Button>
                    <Button
                      variant="outline"
                      onClick={markHoliday}
                      aria-label="Mark this day a holiday"
                      title="Mark this day a holiday"
                      className="h-11 shrink-0 touch-manipulation px-3"
                    >
                      <PalmtreeIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Holiday</span>
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
                          className="flex items-center gap-2.5 rounded-xl border bg-card p-2.5 sm:gap-3 sm:p-3"
                        >
                          <div className="w-6 shrink-0 text-center text-sm font-semibold text-muted-foreground sm:w-7">
                            {s.rollNo || i + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{s.name}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-xs text-muted-foreground">Adm {s.admissionNo}</span>
                              <PctBadge pct={s.pct} />
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1.5 sm:gap-2">
                            <button
                              onClick={() => mark(s, "present")}
                              aria-label="Present"
                              aria-pressed={s.status === "present"}
                              className={cn(
                                "flex h-11 w-11 touch-manipulation select-none items-center justify-center rounded-lg border-2 text-base font-bold transition-colors active:scale-95",
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
                              aria-pressed={s.status === "absent"}
                              className={cn(
                                "flex h-11 w-11 touch-manipulation select-none items-center justify-center rounded-lg border-2 text-base font-bold transition-colors active:scale-95",
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
