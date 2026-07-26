import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, UserX, CalendarOff } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { classLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BusyEntry {
  teacher: string;
  teacherName: string;
  class: string;
  section: string;
  subjectName: string;
  period: number;
}
interface FreeTeacher {
  _id: string;
  name: string;
  designation?: string;
}
interface GridRow {
  period: number;
  label: string;
  busy: BusyEntry[];
  free: FreeTeacher[];
}
interface SubData {
  date: string;
  weekday: number;
  weekdayLabel: string;
  working: boolean;
  reason: string | null;
  periods: { period: number; label: string }[];
  teachers: FreeTeacher[];
  grid: GridRow[];
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => fmt(new Date());
const shift = (dateStr: string, n: number) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return fmt(d);
};
const pretty = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function TeacherChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      {name}
    </span>
  );
}

export default function Substitution() {
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(false);
  const [absentId, setAbsentId] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .get("/timetable/substitution", { params: { date } })
      .then(({ data }) => setData(data))
      .catch(() => toast.error("Failed to load the substitution board"))
      .finally(() => setLoading(false));
  }, [date]);

  // The absent teacher's periods today + who's free to cover each.
  const coverage = useMemo(() => {
    if (!data || !absentId) return [];
    const rows: {
      period: number;
      label: string;
      klass: string;
      section: string;
      subject: string;
      free: FreeTeacher[];
    }[] = [];
    for (const g of data.grid) {
      const mine = g.busy.find((b) => b.teacher === absentId);
      if (mine) {
        rows.push({
          period: g.period,
          label: g.label,
          klass: mine.class,
          section: mine.section,
          subject: mine.subjectName,
          free: g.free,
        });
      }
    }
    return rows;
  }, [data, absentId]);

  const absentName = data?.teachers.find((t) => t._id === absentId)?.name || "";

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/timetable">
          <ArrowLeft className="h-4 w-4" /> Timetable
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Substitution / Cover</h1>
          <p className="text-muted-foreground">
            Find a free teacher to cover an absent teacher's classes for the day.
          </p>
        </div>
      </div>

      {/* Day navigator */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setDate(shift(date, -1))}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <div className="min-w-[220px] rounded-md border bg-card px-3 py-2 text-center text-sm font-medium">
          {data?.weekdayLabel ? `${data.weekdayLabel}, ` : ""}
          {pretty(date)}
        </div>
        <Button variant="outline" size="sm" onClick={() => setDate(shift(date, 1))}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDate(todayStr())}>
          Today
        </Button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>

      {loading && <p className="py-16 text-center text-muted-foreground">Loading…</p>}

      {/* Off day */}
      {!loading && data && !data.working && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <CalendarOff className="h-8 w-8 text-muted-foreground" />
            <p className="text-lg font-medium">{data.reason}</p>
            <p className="text-sm text-muted-foreground">No classes scheduled — nothing to arrange.</p>
          </CardContent>
        </Card>
      )}

      {!loading && data && data.working && (
        <>
          {/* Cover for an absent teacher */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserX className="h-5 w-5 text-primary" /> Cover for an absent teacher
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Teacher absent today:</span>
                <select
                  value={absentId}
                  onChange={(e) => setAbsentId(e.target.value)}
                  className="h-10 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select a teacher…</option>
                  {data.teachers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                      {t.designation ? ` — ${t.designation}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {absentId && coverage.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {absentName} has no classes on {data.weekdayLabel}.
                </p>
              )}

              {absentId && coverage.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {absentName}'s periods today — send any free teacher to cover:
                  </p>
                  {coverage.map((r) => (
                    <div key={r.period} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {r.label} · {classLabel(r.klass)}-{r.section} · {r.subject}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Free to cover:</span>
                        {r.free.length ? (
                          r.free.map((f) => <TeacherChip key={f._id} name={f.name} />)
                        ) : (
                          <span className="text-xs text-rose-600">
                            No teacher is free this period.
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Free teachers by period */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Free teachers by period</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.grid.map((g) => (
                <div key={g.period} className="flex flex-wrap items-start gap-2 rounded-lg border p-3">
                  <span className="min-w-[90px] font-medium">{g.label}</span>
                  <div className="flex flex-1 flex-wrap items-center gap-1.5">
                    {g.free.length ? (
                      g.free.map((f) => <TeacherChip key={f._id} name={f.name} />)
                    ) : (
                      <span className="text-xs text-muted-foreground">All teachers are busy.</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{g.free.length} free</span>
                </div>
              ))}
              {data.grid.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No classes scheduled for {data.weekdayLabel}.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
