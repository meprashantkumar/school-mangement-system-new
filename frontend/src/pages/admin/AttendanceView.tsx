import { useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2, PalmtreeIcon, GraduationCap, Users } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Holiday, RosterDay } from "@/types";
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
  const [holidayForm, setHolidayForm] = useState({ date: todayKey(), name: "" });

  const loadHolidays = () =>
    api
      .get("/holidays")
      .then(({ data }) => setHolidays(data.holidays))
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

          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holidays added. Sundays are already treated as weekly offs automatically.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {holidays.map((h) => (
                <span
                  key={h._id}
                  className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm"
                >
                  <span className="font-medium">{h.name}</span>
                  <span className="text-muted-foreground">
                    {new Date(`${h.dateKey}T00:00:00`).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
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
