import { useEffect, useState } from "react";
import { Plus, ChevronLeft, Trophy, Lock } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Exam, ExamEntry } from "@/types";
import { classLabel, examTypeLabel } from "@/lib/constants";
import { MarksEntryPanel } from "@/components/MarksEntryPanel";
import { ExamFormDialog } from "@/components/ExamFormDialog";
import { Button } from "@/components/ui/button";

/** Results/marks area of the teacher dashboard, scoped to one class+section. */
export function TeacherResults({ klass, section }: { klass: string; section: string }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [entry, setEntry] = useState<ExamEntry | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);

  const loadExams = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/teacher/exams");
      setExams((data.exams || []).filter((e: Exam) => e.class === klass));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't load exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setActiveId(null);
    setEntry(null);
    loadExams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klass]);

  const openExam = async (examId: string) => {
    setActiveId(examId);
    setEntryLoading(true);
    try {
      const { data } = await api.get(`/teacher/exams/${examId}/entry`, { params: { section } });
      setEntry(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't load roster");
      setEntry(null);
      setActiveId(null);
    } finally {
      setEntryLoading(false);
    }
  };

  const save = async (
    studentId: string,
    subjectId: string,
    payload: { marksObtained?: number; absent?: boolean }
  ) => {
    await api.post("/teacher/marks", { examId: activeId, studentId, subjectId, section, ...payload });
  };
  const clear = async (studentId: string, subjectId: string) => {
    await api.delete("/teacher/marks", { data: { examId: activeId, studentId, subjectId, section } });
  };

  // Marks-entry view for one exam.
  if (activeId) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setActiveId(null);
            setEntry(null);
          }}
        >
          <ChevronLeft className="h-4 w-4" /> All exams
        </Button>
        {entryLoading ? (
          <p className="py-10 text-center text-muted-foreground">Loading…</p>
        ) : entry ? (
          <>
            <div>
              <h2 className="font-heading text-lg font-bold">{entry.exam.name}</h2>
              <p className="text-sm text-muted-foreground">
                {classLabel(klass)}-{section}
              </p>
            </div>
            <MarksEntryPanel entry={entry} save={save} clear={clear} disabled={entry.exam.published} />
          </>
        ) : null}
      </div>
    );
  }

  // Exam list.
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Exams · {classLabel(klass)}</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> New exam
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-muted-foreground">Loading…</p>
      ) : exams.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-medium">No exams yet</p>
          <p className="text-sm text-muted-foreground">
            Create one to start entering marks for your class.
          </p>
        </div>
      ) : (
        exams.map((ex) => (
          <button
            key={ex._id}
            onClick={() => openExam(ex._id)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="min-w-0">
              <p className="truncate font-heading font-semibold">{ex.name}</p>
              <p className="text-xs text-muted-foreground">
                {examTypeLabel(ex.type)} · {ex.subjects.length} subject(s)
              </p>
            </div>
            {ex.published ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <Lock className="h-3 w-3" /> Published
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Draft
              </span>
            )}
          </button>
        ))
      )}

      <ExamFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        klass={klass}
        onSaved={loadExams}
        createPath="/teacher/exams"
      />
    </div>
  );
}
