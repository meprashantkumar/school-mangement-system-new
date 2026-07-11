import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, CheckCheck, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, StaffPerson, StaffRosterDay } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const todayKey = () => new Date().toLocaleDateString("en-CA");
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

const applyMark = (p: StaffPerson, next: AttendanceStatus | null): StaffPerson => {
  let { present, absent } = p;
  if (p.status === "present") present -= 1;
  else if (p.status === "absent") absent -= 1;
  if (next === "present") present += 1;
  else if (next === "absent") absent += 1;
  const total = present + absent;
  return { ...p, status: next, present, absent, pct: total > 0 ? Math.round((present / total) * 100) : null };
};

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null)
    return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">—</span>;
  const good = pct >= 75;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", good ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
      {pct}%
    </span>
  );
}

export function StaffAttendancePanel() {
  const [date, setDate] = useState(todayKey());
  const [roster, setRoster] = useState<StaffRosterDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulking, setBulking] = useState(false);
  const [filter, setFilter] = useState<"all" | "teacher" | "staff">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/staff/attendance", { params: { date } });
      setRoster(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const dayInfo = roster?.dayInfo;
  const offDay = !!dayInfo && (dayInfo.sunday || dayInfo.holiday);

  const setPerson = (id: string, next: AttendanceStatus | null) =>
    setRoster((r) => (r ? { ...r, people: r.people.map((p) => (p._id === id ? applyMark(p, next) : p)) } : r));

  const mark = async (p: StaffPerson, status: AttendanceStatus) => {
    if (offDay) return;
    // Tapping the already-active status clears it (back to unmarked).
    const clearing = p.status === status;
    const prev = p.status;
    setPerson(p._id, clearing ? null : status);
    try {
      if (clearing) {
        await api.delete("/staff/attendance", { data: { personId: p._id, date } });
      } else {
        await api.post("/staff/attendance", { personId: p._id, personKind: p.kind, date, status });
      }
    } catch (err: any) {
      setPerson(p._id, prev);
      toast.error(err?.response?.data?.message || "Couldn't save");
    }
  };

  const markAll = async () => {
    if (offDay) return;
    setBulking(true);
    try {
      await api.post("/staff/attendance/bulk", { date, status: "present" });
      await load();
      toast.success("Marked everyone present");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setBulking(false);
    }
  };

  // People shown after the Teachers/Staff filter.
  const people = useMemo(
    () => (roster ? roster.people.filter((p) => filter === "all" || p.kind === filter) : []),
    [roster, filter]
  );

  const kindCounts = useMemo(() => {
    const all = roster?.people || [];
    return {
      all: all.length,
      teacher: all.filter((p) => p.kind === "teacher").length,
      staff: all.filter((p) => p.kind === "staff").length,
    };
  }, [roster]);

  // Recompute the summary live from the (filtered, optimistically updated) list, so
  // single taps update the tallies immediately instead of waiting for a reload.
  const c = useMemo(() => {
    if (!roster) return null;
    let present = 0;
    let absent = 0;
    const pcts: number[] = [];
    people.forEach((p) => {
      if (p.status === "present") present += 1;
      else if (p.status === "absent") absent += 1;
      if (p.pct !== null) pcts.push(p.pct);
    });
    const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    return { present, absent, unmarked: people.length - present - absent, total: people.length, avgPct };
  }, [roster, people]);

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
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
          <Button variant="ghost" size="icon" onClick={() => setDate((d) => addDays(d, 1))} disabled={date >= todayKey()}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          {date !== todayKey() && (
            <Button variant="outline" size="sm" onClick={() => setDate(todayKey())}>
              Today
            </Button>
          )}
        </div>
        <p className="text-center text-sm font-medium text-muted-foreground">{prettyDate(date)}</p>

        {loading ? (
          <p className="py-10 text-center text-muted-foreground">Loading…</p>
        ) : offDay ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
            {dayInfo?.sunday ? "Sunday — weekly off." : `Holiday: ${dayInfo?.holidayName}.`} No attendance on this day.
          </div>
        ) : (
          roster && (
            <>
              {/* Teachers / Staff filter */}
              <div className="flex flex-wrap gap-2">
                {([["all", "All"], ["teacher", "Teachers"], ["staff", "Staff"]] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => setFilter(val)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                      filter === val ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                    )}
                  >
                    {lbl} <span className="opacity-70">({kindCounts[val]})</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="font-semibold text-emerald-600">{c?.present} present</span>
                  <span className="font-semibold text-rose-600">{c?.absent} absent</span>
                  <span className="text-muted-foreground">{c?.unmarked} not marked</span>
                  <span className={cn("font-semibold", c?.avgPct == null ? "text-muted-foreground" : c.avgPct >= 75 ? "text-emerald-600" : "text-rose-600")}>
                    avg {c?.avgPct == null ? "—" : `${c.avgPct}%`}
                  </span>
                </div>
                <Button size="sm" onClick={markAll} disabled={bulking}>
                  <CheckCheck className="h-4 w-4" /> Mark all present
                </Button>
              </div>

              <div className="space-y-2">
                {people.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    {roster.people.length === 0
                      ? "No teachers or staff yet. Add them under Teachers and Staff."
                      : `No ${filter === "teacher" ? "teachers" : "staff"} to show.`}
                  </p>
                ) : (
                  people.map((p) => (
                    <div key={p._id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{p.name}</p>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              p.kind === "teacher" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                            )}
                          >
                            {p.kind === "teacher" ? "Teacher" : "Staff"}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{p.category} · {p.role}</span>
                          <PctBadge pct={p.pct} />
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => mark(p, "present")}
                          aria-label="Present"
                          className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-lg border-2 text-base font-bold transition-colors",
                            p.status === "present"
                              ? "border-emerald-600 bg-emerald-500 text-white"
                              : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                          )}
                        >
                          {p.status === "present" ? <Check className="h-5 w-5" /> : "P"}
                        </button>
                        <button
                          onClick={() => mark(p, "absent")}
                          aria-label="Absent"
                          className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-lg border-2 text-base font-bold transition-colors",
                            p.status === "absent"
                              ? "border-rose-600 bg-rose-500 text-white"
                              : "border-rose-200 text-rose-600 hover:bg-rose-50"
                          )}
                        >
                          {p.status === "absent" ? <X className="h-5 w-5" /> : "A"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">Tip: tap a green/red button again to clear the mark.</p>
            </>
          )
        )}
      </CardContent>
    </Card>
  );
}
