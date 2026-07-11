import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Teacher, PeriodSlot, TeacherTTEntry } from "@/types";
import { CURRENT_SESSION, recentSessions, classLabel } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TimetableGrid } from "@/components/TimetableGrid";

export default function TeacherTimetable() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [session, setSession] = useState(CURRENT_SESSION);
  const [periods, setPeriods] = useState<PeriodSlot[]>([]);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [entries, setEntries] = useState<TeacherTTEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/teachers"), api.get("/timetable/config")])
      .then(([tch, cfg]) => {
        const list: Teacher[] = tch.data.teachers || tch.data || [];
        setTeachers(list);
        if (list[0]) setTeacherId(list[0]._id);
        setPeriods(cfg.data.config.periods || []);
        setWorkingDays(cfg.data.config.workingDays || [1, 2, 3, 4, 5, 6]);
      })
      .catch(() => toast.error("Failed to load teachers"));
  }, []);

  useEffect(() => {
    if (!teacherId) return;
    setLoading(true);
    api
      .get("/timetable/teacher", { params: { teacherId, session } })
      .then(({ data }) => setEntries(data.entries || []))
      .catch(() => toast.error("Failed to load schedule"))
      .finally(() => setLoading(false));
  }, [teacherId, session]);

  const lookup = useMemo(() => {
    const m: Record<string, TeacherTTEntry> = {};
    entries.forEach((e) => (m[`${e.day}_${e.period}`] = e));
    return m;
  }, [entries]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/timetable"><ArrowLeft className="h-4 w-4" /> Timetable</Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teacher Timetable</h1>
          <p className="text-muted-foreground">Auto-generated from the class timetables.</p>
        </div>
        <div className="flex gap-2">
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
          <select value={session} onChange={(e) => setSession(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {recentSessions().map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <Card className="p-2">
        {loading ? (
          <p className="py-16 text-center text-muted-foreground">Loading…</p>
        ) : (
          <TimetableGrid
            periods={periods}
            workingDays={workingDays}
            emptyText="This teacher has no periods assigned yet."
            cell={(day, period) => {
              const e = lookup[`${day}_${period}`];
              return e ? { title: `${classLabel(e.class)}-${e.section}`, subtitle: e.subjectName } : null;
            }}
          />
        )}
      </Card>
    </div>
  );
}
