import { useEffect, useState } from "react";
import { useSettings } from "@/context/SettingsContext";
import { CalendarDays, Plus, Trash2, PalmtreeIcon, GraduationCap, Users } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Holiday, HolidayGroup, RosterDay } from "@/types";
import { CLASSES, SECTIONS, classLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { StaffAttendancePanel } from "@/components/StaffAttendancePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const selectClass =
  "flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const todayKey = () => new Date().toLocaleDateString("en-CA");
// "2026-05-10" -> "10 May". Built from the key so it never drifts a day by timezone.
const fmtDay = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// A holiday's scope, for display. An empty class name means the whole school.
const scopeText = (classes: string[]) =>
  !classes.length || classes.some((c) => !c)
    ? "Whole school"
    : classes.map(classLabel).join(", ");

function Pct({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-semibold", pct >= 75 ? "text-emerald-600" : "text-rose-600")}>
      {pct}%
    </span>
  );
}

export default function AttendanceView() {
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [date, setDate] = useState(todayKey());
  // Which year's register to read. Defaults to the running session; earlier ones are
  // history — readable here, never markable.
  const { currentSession } = useSettings();
  const [session, setSession] = useState(currentSession);
  useEffect(() => setSession(currentSession), [currentSession]);
  const [roster, setRoster] = useState<RosterDay | null>(null);
  const [sessions, setSessions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<"students" | "staff">("students");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [groups, setGroups] = useState<HolidayGroup[]>([]);
  const [holidayForm, setHolidayForm] = useState({ date: todayKey(), name: "" });
  // A vacation is entered as a range; one-off festivals stay a single date.
  const [holidayMode, setHolidayMode] = useState<"day" | "range">("day");
  const [rangeForm, setRangeForm] = useState({ from: todayKey(), to: todayKey(), name: "" });
  const [savingRange, setSavingRange] = useState(false);
  // Who the holiday is for. Whole school is the default and the common case; picking
  // classes is for things like "Class 10 is off during board exams". Shared by both
  // forms, since the picker sits above them.
  const [scopeMode, setScopeMode] = useState<"school" | "classes">("school");
  const [scopeClasses, setScopeClasses] = useState<string[]>([]);

  // What goes on the wire: no `classes` at all means the whole school.
  const scopePayload = () => (scopeMode === "classes" ? { classes: scopeClasses } : {});
  const scopeReady = () => {
    if (scopeMode === "classes" && scopeClasses.length === 0) {
      toast.error("Pick at least one class, or choose Whole school");
      return false;
    }
    return true;
  };
  const resetScope = () => {
    setScopeMode("school");
    setScopeClasses([]);
  };
  const toggleScopeClass = (c: string) =>
    setScopeClasses((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const loadHolidays = () =>
    api
      .get("/holidays")
      .then(({ data }) => {
        setHolidays(data.holidays || []);
        setGroups(data.groups || []);
      })
      .catch(() => {});

  useEffect(() => {
    loadHolidays();
    // The years worth offering are the ones a register was actually kept for — not
    // the ones students are in now, since promotion empties last year of students.
    api
      .get("/teachers/attendance/sessions")
      .then(({ data }) => setSessions(data.sessions || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!cls || !section) {
      setRoster(null);
      return;
    }
    // Changing the class and the date in quick succession leaves two requests in
    // flight, and whichever answers last used to win — so the table could show a
    // different day than the date box, holiday banner included. Ignore the answer to
    // a question we've already moved on from.
    let live = true;
    setLoading(true);
    api
      .get("/teachers/attendance", { params: { class: cls, section, date, session } })
      .then(({ data }) => {
        if (live) setRoster(data);
      })
      .catch((err) => {
        if (live) toast.error(err?.response?.data?.message || "Failed to load");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [cls, section, date, session]);

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name.trim()) return toast.error("Enter a holiday name");
    if (!scopeReady()) return;
    try {
      const { data } = await api.post("/holidays", { ...holidayForm, ...scopePayload() });
      toast.success(data.message || "Holiday added");
      setHolidayForm({ date: todayKey(), name: "" });
      resetScope();
      loadHolidays();
      if (cls && section) {
        const { data } = await api.get("/teachers/attendance", { params: { class: cls, section, date, session } });
        setRoster(data);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const refreshRoster = async () => {
    if (!cls || !section) return;
    const { data } = await api.get("/teachers/attendance", {
      params: { class: cls, section, date, session },
    });
    setRoster(data);
  };

  const addRange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeForm.name.trim()) return toast.error("Enter a name, e.g. Summer Vacation");
    if (rangeForm.from > rangeForm.to) return toast.error("The start date must come before the end");
    if (!scopeReady()) return;

    // The server refuses with 409 when attendance has already been taken on days in
    // the range, and says which. Show them and let the office decide — it will not
    // throw away a teacher's attendance on its own.
    const post = (confirmIt: boolean) =>
      api.post("/holidays", {
        ...rangeForm,
        name: rangeForm.name.trim(),
        ...scopePayload(),
        confirm: confirmIt,
      });

    setSavingRange(true);
    try {
      let res;
      try {
        res = await post(false);
      } catch (err: any) {
        const d = err?.response?.data;
        if (err?.response?.status !== 409 || !d?.needsConfirmation) throw err;
        const days = (d.clashes || []).join(", ");
        if (!confirm(`${d.message}\n\nDays with attendance already taken:\n${days}\n\nMark the holiday anyway?`))
          return;
        res = await post(true);
      }
      toast.success(res.data.message || "Holiday added");
      setRangeForm({ from: todayKey(), to: todayKey(), name: "" });
      resetScope();
      loadHolidays();
      await refreshRoster();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setSavingRange(false);
    }
  };

  const removeGroup = async (g: HolidayGroup) => {
    if (
      !confirm(
        `Remove "${g.name}" — all ${g.days} day(s) from ${g.from} to ${g.to}, for ${scopeText(
          g.classes
        ).toLowerCase()}?`
      )
    )
      return;
    try {
      const { data } = await api.delete(`/holidays/group/${g.groupId}`);
      toast.success(data.message || "Removed");
      loadHolidays();
      await refreshRoster();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const removeHoliday = async (h: Holiday) => {
    const who = h.class ? ` (${classLabel(h.class)})` : "";
    if (!confirm(`Remove holiday "${h.name}" on ${h.dateKey}${who}?`)) return;
    try {
      // The class matters: a day can carry a school-wide holiday and a class-only one,
      // and removing one must not take the other with it.
      await api.delete(`/holidays/${h.dateKey}`, { params: { class: h.class || "" } });
      toast.success("Holiday removed");
      loadHolidays();
      // Refresh the roster too, so the amber "Holiday" banner clears if we were
      // viewing that day (adding a holiday already refreshes — keep them in sync).
      if (cls && section) {
        const { data } = await api.get("/teachers/attendance", { params: { class: cls, section, date, session } });
        setRoster(data);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const day = roster?.dayInfo;
  const c = roster?.counts;
  // Anything not part of a break shows as its own chip; breaks show as one line each.
  const singles = holidays.filter((h) => !h.groupId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground">
          Students, staff and holidays — all in one place.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button variant={tab === "students" ? "default" : "outline"} onClick={() => setTab("students")}>
          <GraduationCap className="h-4 w-4" /> Students
        </Button>
        <Button variant={tab === "staff" ? "default" : "outline"} onClick={() => setTab("staff")}>
          <Users className="h-4 w-4" /> Staff & Teachers
        </Button>
      </div>

      {tab === "staff" && <StaffAttendancePanel />}

      {tab === "students" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" /> Class attendance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Class</label>
              <select className={selectClass} value={cls} onChange={(e) => setCls(e.target.value)}>
                <option value="">Select class</option>
                {CLASSES.map((c2) => (
                  <option key={c2} value={c2}>
                    {classLabel(c2)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Section</label>
              <select
                className={selectClass}
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                <option value="">Select</option>
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Date</label>
              <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Session</label>
              <select
                className={selectClass}
                value={session}
                onChange={(e) => setSession(e.target.value)}
              >
                {Array.from(new Set([currentSession, ...sessions])).map((s) => (
                  <option key={s} value={s}>
                    {s}
                    {s === currentSession ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {roster?.readOnly && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
              Showing <b>{session}</b> — a finished year. This is the register as it was
              kept, including children who have since left or passed out, and the
              percentages for that year only. It cannot be changed.
            </div>
          )}

          {!cls || !section ? (
            <p className="py-10 text-center text-muted-foreground">
              Choose a class and section to view attendance.
            </p>
          ) : loading ? (
            <p className="py-10 text-center text-muted-foreground">Loading…</p>
          ) : day && (day.sunday || day.holiday) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
              {day.sunday
                ? "Sunday — weekly off."
                : `Holiday: ${day.holidayName}${
                    day.holidayScope === "class" ? ` (${classLabel(cls)} only)` : ""
                  }.`}{" "}
              No attendance on this day.
            </div>
          ) : (
            roster && (
              <>
                <div className="flex flex-wrap gap-6 rounded-lg bg-muted/50 p-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Present</p>
                    <p className="text-xl font-bold text-emerald-600">{c?.present}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Absent</p>
                    <p className="text-xl font-bold text-rose-600">{c?.absent}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Not marked</p>
                    <p className="text-xl font-bold text-muted-foreground">{c?.unmarked}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="text-xl font-bold">{c?.total}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Class average</p>
                    <p className="text-xl">
                      <Pct pct={c?.classAvgPct ?? null} />
                    </p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Roll</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Attendance %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.students.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No active students in this class.
                        </TableCell>
                      </TableRow>
                    ) : (
                      roster.students.map((s, i) => (
                        <TableRow key={s._id}>
                          <TableCell className="text-muted-foreground">{s.rollNo || i + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-muted-foreground">Adm {s.admissionNo}</div>
                          </TableCell>
                          <TableCell>
                            {s.status === "present" ? (
                              <span className="font-medium text-emerald-600">Present</span>
                            ) : s.status === "absent" ? (
                              <span className="font-medium text-rose-600">Absent</span>
                            ) : (
                              <span className="text-muted-foreground">Not marked</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Pct pct={s.pct} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </>
            )
          )}
        </CardContent>
      </Card>
      )}

      {/* Holidays */}
      <Card id="holidays-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PalmtreeIcon className="h-5 w-5 text-primary" /> Holidays this session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* One festival day, or a whole vacation — the second is why this toggle
              exists: marking 45 days one at a time is not a workflow. */}
          <div className="inline-flex rounded-lg border p-0.5">
            {([
              ["day", "Single day"],
              ["range", "Date range"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setHolidayMode(m)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  holidayMode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Who it applies to. Whole school is the default; a class holiday is for
              things like "Class 10 is off during board exams" and leaves everyone
              else — including the staff — working as normal. */}
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">Applies to</span>
              <div className="inline-flex rounded-lg border bg-background p-0.5">
                {([
                  ["school", "Whole school"],
                  ["classes", "Specific classes"],
                ] as const).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setScopeMode(m)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      scopeMode === m
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {scopeMode === "classes" ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {CLASSES.map((c2) => {
                    const on = scopeClasses.includes(c2);
                    return (
                      <button
                        key={c2}
                        type="button"
                        onClick={() => toggleScopeClass(c2)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background hover:border-primary/50"
                        )}
                      >
                        {classLabel(c2)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Only these classes get the day off. Everyone else — and the teaching
                  and non-teaching staff — is unaffected. To close the school, use
                  <button
                    type="button"
                    onClick={resetScope}
                    className="mx-1 font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Whole school
                  </button>
                  instead of ticking every class.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Every class, plus teaching and non-teaching staff, gets the day off.
              </p>
            )}
          </div>

          {holidayMode === "day" ? (
            <form onSubmit={addHoliday} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Date</label>
                <Input
                  type="date"
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="mb-1 block text-sm text-muted-foreground">Name</label>
                <Input
                  placeholder="e.g. Diwali"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <Button type="submit">
                <Plus className="h-4 w-4" /> Add holiday
              </Button>
            </form>
          ) : (
            <form onSubmit={addRange} className="space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">From</label>
                  <Input
                    type="date"
                    value={rangeForm.from}
                    onChange={(e) => setRangeForm((f) => ({ ...f, from: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">To</label>
                  <Input
                    type="date"
                    value={rangeForm.to}
                    onChange={(e) => setRangeForm((f) => ({ ...f, to: e.target.value }))}
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="mb-1 block text-sm text-muted-foreground">Name</label>
                  <Input
                    placeholder="e.g. Summer Vacation"
                    value={rangeForm.name}
                    onChange={(e) => setRangeForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <Button type="submit" disabled={savingRange}>
                  <Plus className="h-4 w-4" /> {savingRange ? "Adding…" : "Add holiday"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sundays inside the range are skipped — they are already weekly offs. Days that are
                already a holiday keep the name they have.
              </p>
            </form>
          )}

          {/* Multi-day breaks: one line each, removable as a whole */}
          {groups.length > 0 && (
            <div className="space-y-2">
              {groups.map((g) => (
                <div
                  key={g.groupId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{g.name}</span>{" "}
                    <span className="text-muted-foreground">
                      {g.from === g.to ? (
                        fmtDay(g.from)
                      ) : (
                        <>
                          {fmtDay(g.from)} – {fmtDay(g.to)} · {g.days} day
                          {g.days === 1 ? "" : "s"}
                        </>
                      )}
                      {" · "}
                      {scopeText(g.classes)}
                    </span>
                  </span>
                  <button
                    onClick={() => removeGroup(g)}
                    className="flex items-center gap-1 text-muted-foreground hover:text-destructive"
                    title="Remove the whole break"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove all
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Single days (anything not part of a break) */}
          {singles.length === 0 && groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holidays added. Sundays are already treated as weekly offs automatically.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {singles.map((h) => (
                <span
                  key={h._id}
                  className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm"
                >
                  <span className="font-medium">{h.name}</span>
                  <span className="text-muted-foreground">{fmtDay(h.dateKey)}</span>
                  {h.class && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {classLabel(h.class)}
                    </span>
                  )}
                  <button
                    onClick={() => removeHoliday(h)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
