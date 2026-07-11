import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Save, CalendarClock } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Exam, ExamPaper, ExamSubject } from "@/types";
import { CURRENT_SESSION, recentSessions, classLabel } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ExamTimetable() {
  const [session, setSession] = useState(CURRENT_SESSION);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/exams", { params: { session } })
      .then(({ data }) => {
        const list: Exam[] = data.exams || data || [];
        setExams(list);
        setExamId(list[0]?._id || "");
        if (!list[0]) setPapers([]);
      })
      .catch(() => toast.error("Failed to load exams"));
  }, [session]);

  useEffect(() => {
    if (!examId) return;
    setLoading(true);
    api
      .get("/timetable/exam", { params: { examId } })
      .then(({ data }) => {
        const saved: ExamPaper[] = data.examTimetable.papers || [];
        const seeded: ExamPaper[] = (data.exam.subjects || []).map((s: ExamSubject) => {
          const match = saved.find((p) => p.subjectName === s.name || p.subject === s.subject);
          return match || { subject: s.subject, subjectName: s.name, date: "", startTime: "", endTime: "", note: "" };
        });
        // keep any extra saved papers that aren't in the exam's subject list
        const extra = saved.filter((p) => !seeded.some((s) => s.subjectName === p.subjectName));
        setPapers([...seeded, ...extra]);
      })
      .catch(() => toast.error("Failed to load date sheet"))
      .finally(() => setLoading(false));
  }, [examId]);

  const update = (i: number, patch: Partial<ExamPaper>) =>
    setPapers((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/timetable/exam", { examId, papers: papers.filter((p) => p.date) });
      toast.success("Date sheet saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selectedExam = exams.find((e) => e._id === examId);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/timetable"><ArrowLeft className="h-4 w-4" /> Timetable</Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exam Timetable</h1>
          <p className="text-muted-foreground">Set the date &amp; time for each paper of an exam.</p>
        </div>
        <div className="flex gap-2">
          <select value={session} onChange={(e) => setSession(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {recentSessions().map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={examId} onChange={(e) => setExamId(e.target.value)} className="h-10 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm">
            {exams.length === 0 && <option value="">No exams in this session</option>}
            {exams.map((e) => <option key={e._id} value={e._id}>{classLabel(e.class)} · {e.name}</option>)}
          </select>
          <Button onClick={save} disabled={saving || !examId}><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <Card className="p-5">
        {!examId ? (
          <div className="py-12 text-center text-muted-foreground">
            <CalendarClock className="mx-auto h-8 w-8" />
            <p className="mt-2">Create an exam first (Exams &amp; Results), then set its date sheet here.</p>
          </div>
        ) : loading ? (
          <p className="py-12 text-center text-muted-foreground">Loading…</p>
        ) : papers.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">This exam has no subjects yet.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {classLabel(selectedExam?.class || "")} · {selectedExam?.name} — leave a paper's date blank to omit it.
            </p>
            <div className="space-y-2">
              {papers.map((p, i) => (
                <div key={i} className="grid grid-cols-1 items-center gap-2 rounded-lg border p-2 sm:grid-cols-[1.4fr_1.2fr_1fr_1fr]">
                  <div className="font-medium">{p.subjectName}</div>
                  <Input type="date" value={p.date} onChange={(e) => update(i, { date: e.target.value })} className="h-9" />
                  <Input type="time" value={p.startTime} onChange={(e) => update(i, { startTime: e.target.value })} className="h-9" />
                  <Input type="time" value={p.endTime} onChange={(e) => update(i, { endTime: e.target.value })} className="h-9" />
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
