import { useEffect, useState } from "react";
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
  const [roster, setRoster] = useState<RosterDay | null>(null);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<"students" | "staff">("students");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [groups, setGroups] = useState<HolidayGroup[]>([]);
  const [holidayForm, setHolidayForm] = useState({ date: todayKey(), name: "" });
  // A vacation is entered as a range; one-off festivals stay a single date.
  const [holidayMode, setHolidayMode] = useState<"day" | "range">("day");
  const [rangeForm, setRangeForm] = useState({ from: todayKey(), to: todayKey(), name: "" });
  const [savingRange, setSavingRange] = useState(false);

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
  }, []);

  useEffect(() => {
    if (!cls || !section) {
      setRoster(null);
      return;
    }
    setLoading(true);
    api
      .get("/teachers/attendance", { params: { class: cls, section, date } })
      .then(({ data }) => setRoster(data))
      .catch((err) => toast.error(err?.response?.data?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [cls, section, date]);

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name.trim()) return toast.error("Enter a holiday name");
    try {
      await api.post("/holidays", holidayForm);
      toast.success("Holiday added");
      setHolidayForm({ date: todayKey(), name: "" });
      loadHolidays();
      if (cls && section) {
        const { data } = await api.get("/teachers/attendance", { params: { class: cls, section, date } });
        setRoster(data);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const refreshRoster = async () => {
    if (!cls || !section) return;
    const { data } = await api.get("/teachers/attendance", {
      params: { class: cls, section, date },
    });
    setRoster(data);
  };

  const addRange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeForm.name.trim()) return toast.error("Enter a name, e.g. Summer Vacation");
    if (rangeForm.from > rangeForm.to) return toast.error("The start date must come before the end");

    // The server refuses with 409 when attendance has already been taken on days in
    // the range, and says which. Show them and let the office decide — it will not
    // throw away a teacher's attendance on its own.
    const post = (confirmIt: boolean) =>
      api.post("/holidays", { ...rangeForm, name: rangeForm.name.trim(), confirm: confirmIt });

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
      loadHolidays();
      await refreshRoster();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setSavingRange(false);
    }
  };

  const removeGroup = async (g: HolidayGroup) => {
    if (!confirm(`Remove "${g.name}" — all ${g.days} day(s) from ${g.from} to ${g.to}?`)) return;
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
    if (!confirm(`Remove holiday "${h.name}" on ${h.dateKey}?`)) return;
    try {
      await api.delete(`/holidays/${h.dateKey}`);
      toast.success("Holiday removed");
      loadHolidays();
      // Refresh the roster too, so the amber "Holiday" banner clears if we were
      // viewing that day (adding a holiday already refreshes — keep them in sync).
      if (cls && section) {
        const { data } = await api.get("/teachers/attendance", { params: { class: cls, section, date } });
        setRoster(data);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const day = roster?.dayInfo;
  const c = roster?.counts;

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
          </div>

          {!cls || !section ? (
            <p className="py-10 text-center text-muted-foreground">
              Choose a class and section to view attendance.
            </p>
          ) : loading ? (
            <p className="py-10 text-center text-muted-foreground">Loading…</p>
          ) : day && (day.sunday || day.holiday) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
              {day.sunday ? "Sunday — weekly off." : `Holiday: ${day.holidayName}.`} No attendance on
              this day.
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
                      {fmtDay(g.from)} – {fmtDay(g.to)} · {g.days} day{g.days === 1 ? "" : "s"}
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
          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holidays added. Sundays are already treated as weekly offs automatically.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {holidays
                .filter((h) => !h.groupId)
                .map((h) => (
                  <span
                    key={h._id}
                    className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm"
                  >
                    <span className="font-medium">{h.name}</span>
                    <span className="text-muted-foreground">{fmtDay(h.dateKey)}</span>
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
