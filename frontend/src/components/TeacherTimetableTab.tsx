import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { PeriodSlot, TeacherTTEntry } from "@/types";
import { classLabel } from "@/lib/constants";
import { TimetableGrid } from "@/components/TimetableGrid";

/** The logged-in teacher's own weekly schedule (mobile dashboard tab). */
export function TeacherTimetableTab() {
  const [periods, setPeriods] = useState<PeriodSlot[]>([]);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [entries, setEntries] = useState<TeacherTTEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/teacher/timetable")
      .then(({ data }) => {
        setEntries(data.entries || []);
        setPeriods(data.config?.periods || []);
        setWorkingDays(data.config?.workingDays || [1, 2, 3, 4, 5, 6]);
      })
      .catch((err) => toast.error(err?.response?.data?.message || "Couldn't load timetable"))
      .finally(() => setLoading(false));
  }, []);

  const lookup = useMemo(() => {
    const m: Record<string, TeacherTTEntry> = {};
    entries.forEach((e) => (m[`${e.day}_${e.period}`] = e));
    return m;
  }, [entries]);

  if (loading) return <p className="py-16 text-center text-muted-foreground">Loading…</p>;

  return (
    <div className="rounded-2xl border bg-card p-2">
      <TimetableGrid
        periods={periods}
        workingDays={workingDays}
        emptyText="No periods assigned to you yet."
        cell={(day, period) => {
          const e = lookup[`${day}_${period}`];
          return e ? { title: `${classLabel(e.class)}-${e.section}`, subtitle: e.subjectName } : null;
        }}
      />
    </div>
  );
}
