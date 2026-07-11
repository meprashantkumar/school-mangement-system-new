import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Save, Settings2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Subject, Teacher, PeriodSlot, TimetableSlot } from "@/types";
import { CLASSES, SECTIONS, CURRENT_SESSION, recentSessions, classLabel, WEEKDAYS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Cell = { subject?: string; subjectName: string; teacher?: string; teacherName: string };
const key = (day: number, period: number) => `${day}_${period}`;

export default function ClassTimetable() {
  const [klass, setKlass] = useState(CLASSES[3]);
  const [section, setSection] = useState(SECTIONS[0]);
  const [session, setSession] = useState(CURRENT_SESSION);

  const [periods, setPeriods] = useState<PeriodSlot[]>([]);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Load config + teachers once.
  useEffect(() => {
    Promise.all([api.get("/timetable/config"), api.get("/teachers")])
      .then(([cfg, tch]) => {
        setPeriods(cfg.data.config.periods || []);
        setWorkingDays(cfg.data.config.workingDays || [1, 2, 3, 4, 5, 6]);
        setTeachers(tch.data.teachers || tch.data || []);
      })
      .catch(() => toast.error("Failed to load timetable settings"));
  }, []);

  // Load subjects for the class + the saved grid whenever class/section/session change.
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/subjects", { params: { class: klass } }),
      api.get("/timetable/class", { params: { class: klass, section, session } }),
    ])
      .then(([sub, tt]) => {
        setSubjects(sub.data.subjects || []);
        const map: Record<string, Cell> = {};
        (tt.data.timetable.slots || []).forEach((s: TimetableSlot) => {
          map[key(s.day, s.period)] = {
            subject: s.subject,
            subjectName: s.subjectName,
            teacher: s.teacher,
            teacherName: s.teacherName,
          };
        });
        setCells(map);
      })
      .catch(() => toast.error("Failed to load timetable"))
      .finally(() => setLoading(false));
  }, [klass, section, session]);

  const days = useMemo(() => WEEKDAYS.filter((w) => workingDays.includes(w.value)), [workingDays]);

  const setCell = (day: number, period: number, patch: Partial<Cell>) =>
    setCells((c) => {
      const prev = c[key(day, period)] || { subjectName: "", teacherName: "" };
      return { ...c, [key(day, period)]: { ...prev, ...patch } };
    });

  const save = async () => {
    setSaving(true);
    try {
      const slots: TimetableSlot[] = [];
      Object.entries(cells).forEach(([k, c]) => {
        if (!c.subjectName && !c.teacherName) return;
        const [day, period] = k.split("_").map(Number);
        slots.push({ day, period, subject: c.subject, subjectName: c.subjectName, teacher: c.teacher, teacherName: c.teacherName });
      });
      const { data } = await api.put("/timetable/class", { class: klass, section, session, slots });
      toast.success("Timetable saved");
      (data.warnings || []).forEach((w: string) => toast(w, { icon: "⚠️", duration: 6000 }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async () => {
    try {
      const { data } = await api.put("/timetable/config", { periods, workingDays });
      setPeriods(data.config.periods);
      setWorkingDays(data.config.workingDays);
      toast.success("Period schedule saved");
      setShowConfig(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't save schedule");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/timetable"><ArrowLeft className="h-4 w-4" /> Timetable</Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Class Timetable</h1>
          <p className="text-muted-foreground">Assign a subject and teacher to each period.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select value={klass} onChange={(e) => setKlass(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {CLASSES.map((c) => <option key={c} value={c}>{classLabel(c)}</option>)}
          </select>
          <select value={section} onChange={(e) => setSection(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {SECTIONS.map((s) => <option key={s} value={s}>Sec {s}</option>)}
          </select>
          <select value={session} onChange={(e) => setSession(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {recentSessions().map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button variant="outline" size="icon" onClick={() => setShowConfig((v) => !v)} title="Period schedule">
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button onClick={save} disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      {showConfig && (
        <PeriodConfigEditor
          periods={periods} setPeriods={setPeriods}
          workingDays={workingDays} setWorkingDays={setWorkingDays}
          onSave={saveConfig}
        />
      )}

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="py-16 text-center text-muted-foreground">Loading…</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="p-2 text-left font-semibold">Period</th>
                {days.map((d) => <th key={d.value} className="p-2 text-center font-semibold">{d.short}</th>)}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.period} className="border-b last:border-0">
                  <td className="whitespace-nowrap p-2 align-top">
                    <div className="font-medium">{p.label}</div>
                    {(p.start || p.end) && <div className="text-xs text-muted-foreground">{p.start}–{p.end}</div>}
                  </td>
                  {p.isBreak ? (
                    <td colSpan={days.length} className="bg-amber-50 p-2 text-center text-xs font-medium uppercase tracking-wide text-amber-700">
                      {p.label}
                    </td>
                  ) : (
                    days.map((d) => {
                      const c = cells[key(d.value, p.period)] || { subjectName: "", teacherName: "" };
                      return (
                        <td key={d.value} className="p-1.5 align-top">
                          <select
                            value={c.subject || ""}
                            onChange={(e) => {
                              const s = subjects.find((x) => x._id === e.target.value);
                              setCell(d.value, p.period, { subject: s?._id, subjectName: s?.name || "" });
                            }}
                            className="mb-1 w-full rounded border border-input bg-background px-1.5 py-1 text-xs"
                          >
                            <option value="">Subject…</option>
                            {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                          </select>
                          <select
                            value={c.teacher || ""}
                            onChange={(e) => {
                              const t = teachers.find((x) => x._id === e.target.value);
                              setCell(d.value, p.period, { teacher: t?._id, teacherName: t?.name || "" });
                            }}
                            className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-muted-foreground"
                          >
                            <option value="">Teacher…</option>
                            {teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                          </select>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function PeriodConfigEditor({
  periods, setPeriods, workingDays, setWorkingDays, onSave,
}: {
  periods: PeriodSlot[];
  setPeriods: (p: PeriodSlot[]) => void;
  workingDays: number[];
  setWorkingDays: (d: number[]) => void;
  onSave: () => void;
}) {
  const update = (i: number, patch: Partial<PeriodSlot>) =>
    setPeriods(periods.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const removeP = (i: number) => setPeriods(periods.filter((_, idx) => idx !== i));
  const addP = () =>
    setPeriods([...periods, { period: (periods[periods.length - 1]?.period || 0) + 1, label: `Period ${periods.length + 1}`, start: "", end: "", isBreak: false }]);
  const toggleDay = (d: number) =>
    setWorkingDays(workingDays.includes(d) ? workingDays.filter((x) => x !== d) : [...workingDays, d].sort());

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-semibold">Period schedule (applies to all classes)</h2>
        <Button size="sm" onClick={onSave}><Save className="h-4 w-4" /> Save schedule</Button>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium">Working days</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              onClick={() => toggleDay(d.value)}
              className={`rounded-full border px-3 py-1 text-sm ${workingDays.includes(d.value) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              {d.short}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {periods.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input value={p.label} onChange={(e) => update(i, { label: e.target.value })} className="h-9 w-40" placeholder="Label" />
            <Input type="time" value={p.start} onChange={(e) => update(i, { start: e.target.value })} className="h-9 w-32" />
            <Input type="time" value={p.end} onChange={(e) => update(i, { end: e.target.value })} className="h-9 w-32" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={p.isBreak} onChange={(e) => update(i, { isBreak: e.target.checked })} /> Break
            </label>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeP(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addP}><Plus className="h-4 w-4" /> Add period</Button>
      </div>
    </Card>
  );
}
