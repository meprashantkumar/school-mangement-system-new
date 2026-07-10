import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trophy,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ClipboardList,
  Medal,
  ListOrdered,
  Search,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Exam, ExamEntry, ExamResults, OverallResults } from "@/types";
import {
  CLASSES,
  SECTIONS,
  CURRENT_SESSION,
  classLabel,
  examTypeLabel,
  EXAM_TYPES,
  recentSessions,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { MarksEntryPanel } from "@/components/MarksEntryPanel";
import { ExamFormDialog } from "@/components/ExamFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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

function PctText({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-semibold", pct >= 33 ? "text-emerald-600" : "text-rose-600")}>{pct}%</span>
  );
}

// ---- Per-exam results (ranking + toppers) ----
function ResultsView({ examId, onClose }: { examId: string; onClose: () => void }) {
  const [data, setData] = useState<ExamResults | null>(null);
  const [section, setSection] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api
      .get(`/exams/${examId}/results`)
      .then(({ data }) => setData(data))
      .catch((err) => toast.error(err?.response?.data?.message || "Couldn't load results"));
  }, [examId]);

  const rows = data?.rows || [];
  const ranked = rows.filter((r) => r.complete);
  const pending = rows.filter((r) => !r.complete && (!section || r.section === section));
  const podium = ranked.filter((r) => r.passed).slice(0, 3);
  // Filter by section FIRST, then take the top N — otherwise picking a section
  // whose students aren't in the class-wide top 10 shows an empty table.
  const inSection = ranked.filter((r) => !section || r.section === section);
  const shown = showAll ? inSection : inSection.slice(0, 10);
  const sectionsPresent = [...new Set(rows.map((r) => r.section).filter(Boolean))].sort();

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-heading text-lg font-bold">
              <Trophy className="h-5 w-5 text-brand-orange" /> {data?.exam.name}
            </h3>
            {data && (
              <p className="text-sm text-muted-foreground">
                {classLabel(data.exam.class)} · {data.exam.session} · max {data.meta.maxTotal} ·{" "}
                {data.meta.completed} ranked, {data.meta.pending} pending
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {podium.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {podium.map((r, i) => (
              <div
                key={r.student}
                className={cn(
                  "rounded-xl border p-4 text-center",
                  i === 0 ? "border-amber-300 bg-amber-50" : "bg-card"
                )}
              >
                <Medal
                  className={cn(
                    "mx-auto h-6 w-6",
                    i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : "text-orange-400"
                  )}
                />
                <p className="mt-1 text-xs font-semibold text-muted-foreground">Rank {r.rank}</p>
                <p className="truncate font-heading font-bold">{r.name}</p>
                <p className="text-sm text-muted-foreground">
                  {r.section && `Sec ${r.section} · `}
                  {r.total}/{r.maxTotal} · {r.pct}%
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <select className={selectClass} value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">All sections</option>
            {sectionsPresent.map((s) => (
              <option key={s} value={s}>
                Section {s}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show top 10" : "Show all"}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Rank</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Sec</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No ranked students yet — enter marks for every subject.
                </TableCell>
              </TableRow>
            ) : (
              shown.map((r) => (
                <TableRow key={r.student}>
                  <TableCell className="font-bold">{r.rank}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">Adm {r.admissionNo}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.section || "—"}</TableCell>
                  <TableCell className="text-right">
                    {r.total}/{r.maxTotal}
                  </TableCell>
                  <TableCell className="text-right">
                    <PctText pct={r.pct} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn("text-xs font-semibold", r.passed ? "text-emerald-600" : "text-rose-600")}>
                      {r.passed ? "PASS" : "FAIL"}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {pending.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <span className="font-medium">{pending.length} student(s) pending</span> — not every subject is
            entered yet, so they aren't ranked: {pending.slice(0, 8).map((p) => p.name).join(", ")}
            {pending.length > 8 ? "…" : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Weighted overall / final ranking for the class ----
function OverallView({ klass, session, onClose }: { klass: string; session: string; onClose: () => void }) {
  const [data, setData] = useState<OverallResults | null>(null);

  useEffect(() => {
    api
      .get("/exams/overall", { params: { class: klass, session } })
      .then(({ data }) => setData(data))
      .catch((err) => toast.error(err?.response?.data?.message || "Couldn't load overall"));
  }, [klass, session]);

  const ranked = (data?.rows || []).filter((r) => r.complete);
  const podium = ranked.slice(0, 3);

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-heading text-lg font-bold">
              <ListOrdered className="h-5 w-5 text-primary" /> Overall / final ranking · {classLabel(klass)}
            </h3>
            {data && data.exams.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Weighted across {data.exams.map((e) => `${e.name} (${e.weight})`).join(", ")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Publish at least one exam to build the overall ranking.
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {podium.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {podium.map((r, i) => (
              <div
                key={r.student}
                className={cn("rounded-xl border p-4 text-center", i === 0 ? "border-amber-300 bg-amber-50" : "bg-card")}
              >
                <Medal
                  className={cn(
                    "mx-auto h-6 w-6",
                    i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : "text-orange-400"
                  )}
                />
                <p className="mt-1 text-xs font-semibold text-muted-foreground">Rank {r.rank}</p>
                <p className="truncate font-heading font-bold">{r.name}</p>
                <p className="text-sm text-muted-foreground">
                  {r.section && `Sec ${r.section} · `}
                  {r.overallPct}%
                </p>
              </div>
            ))}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Rank</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Sec</TableHead>
              {data?.exams.map((e) => (
                <TableHead key={e._id} className="text-right text-xs">
                  {examTypeLabel(e.type)}
                </TableHead>
              ))}
              <TableHead className="text-right">Overall</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4 + (data?.exams.length || 0)} className="py-8 text-center text-muted-foreground">
                  No students are complete across all published exams yet.
                </TableCell>
              </TableRow>
            ) : (
              ranked.map((r) => (
                <TableRow key={r.student}>
                  <TableCell className="font-bold">{r.rank}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.section || "—"}</TableCell>
                  {r.breakdown.map((b) => (
                    <TableCell key={b.examId} className="text-right text-muted-foreground">
                      {b.pct == null ? "—" : `${b.pct}%`}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <PctText pct={r.overallPct} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---- Marks entry (admin, any section) ----
function AdminEntry({ examId, klass, onClose }: { examId: string; klass: string; onClose: () => void }) {
  const [section, setSection] = useState("A");
  const [entry, setEntry] = useState<ExamEntry | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/exams/${examId}/entry`, { params: { section } })
      .then(({ data }) => setEntry(data))
      .catch((err) => {
        toast.error(err?.response?.data?.message || "Couldn't load roster");
        setEntry(null);
      })
      .finally(() => setLoading(false));
  }, [examId, section]);

  const save = async (
    studentId: string,
    subjectId: string,
    payload: { marksObtained?: number; absent?: boolean }
  ) => {
    await api.post(`/exams/${examId}/marks`, { studentId, subjectId, section, ...payload });
  };
  const clear = async (studentId: string, subjectId: string) => {
    await api.delete(`/exams/${examId}/marks`, { data: { studentId, subjectId } });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-heading text-lg font-bold">
            <ClipboardList className="h-5 w-5 text-primary" /> Enter marks · {entry?.exam.name}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Section</Label>
          <select className={selectClass} value={section} onChange={(e) => setSection(e.target.value)}>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {classLabel(klass)}-{s}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Loading…</p>
        ) : (
          entry && <MarksEntryPanel entry={entry} save={save} clear={clear} disabled={entry.exam.published} />
        )}
      </CardContent>
    </Card>
  );
}

// ---- Page ----
type Detail =
  | { mode: "none" }
  | { mode: "results"; examId: string }
  | { mode: "entry"; examId: string }
  | { mode: "overall" };

export default function ExamsResults() {
  const [klass, setKlass] = useState("");
  const [session, setSession] = useState(CURRENT_SESSION);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [detail, setDetail] = useState<Detail>({ mode: "none" });

  const loadExams = async () => {
    if (!klass) {
      setExams([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/exams", { params: { class: klass, session } });
      setExams(data.exams);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't load exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
    setDetail({ mode: "none" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klass, session]);

  const filteredExams = exams.filter(
    (ex) =>
      (!typeFilter || ex.type === typeFilter) &&
      (!search || ex.name.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => {
    if (!klass) return toast.error("Pick a class first");
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (ex: Exam) => {
    setEditing(ex);
    setDialogOpen(true);
  };

  const togglePublish = async (ex: Exam) => {
    try {
      // Warn before publishing if some students aren't fully marked — publishing
      // locks marks entry and shows "Result awaited" to those parents.
      if (!ex.published) {
        const { data: r } = await api.get(`/exams/${ex._id}/results`);
        const pending = r?.meta?.pending || 0;
        if (
          pending > 0 &&
          !confirm(
            `${pending} student(s) don't have every subject entered yet and won't be ranked or shown a result. ` +
              `Publishing also locks marks entry for teachers.\n\nPublish anyway?`
          )
        ) {
          return;
        }
      }
      const { data } = await api.post(`/exams/${ex._id}/publish`, { published: !ex.published });
      toast.success(data.message);
      loadExams();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const remove = async (ex: Exam) => {
    if (!confirm(`Move "${ex.name}" to the recycle bin? Its marks go with it and can be restored.`)) return;
    try {
      await api.delete(`/exams/${ex._id}`);
      toast.success("Exam moved to recycle bin");
      setDetail({ mode: "none" });
      loadExams();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  const detailKey = useMemo(() => JSON.stringify(detail), [detail]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exams & Results</h1>
          <p className="text-muted-foreground">
            Define exams, enter or review marks, publish results, and see class toppers.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Academic year</label>
            <select className={selectClass} value={session} onChange={(e) => setSession(e.target.value)}>
              {recentSessions().map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Class</label>
            <select className={selectClass} value={klass} onChange={(e) => setKlass(e.target.value)}>
              <option value="">Select class</option>
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {classLabel(c)}
                </option>
              ))}
            </select>
          </div>
          {klass && (
            <>
              <Button variant="outline" onClick={() => setDetail({ mode: "overall" })}>
                <ListOrdered className="h-4 w-4" /> Overall rank
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> Create exam
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      {klass && exams.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search exam name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className={selectClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {EXAM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">
            {filteredExams.length} of {exams.length}
          </span>
        </div>
      )}

      {!klass ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Choose a class to see its exams and results.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : exams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No exams for {classLabel(klass)} yet. Click "Create exam".
          </CardContent>
        </Card>
      ) : filteredExams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No exams match your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredExams.map((ex) => (
            <Card key={ex._id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading font-bold">{ex.name}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {examTypeLabel(ex.type)} · wt {ex.weight}
                    </span>
                    {ex.published ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Published
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {ex.subjects.length} subject(s) · {ex.subjects.map((s) => s.name).slice(0, 4).join(", ")}
                    {ex.subjects.length > 4 ? "…" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setDetail({ mode: "entry", examId: ex._id })}>
                    <ClipboardList className="h-4 w-4" /> Marks
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDetail({ mode: "results", examId: ex._id })}>
                    <Trophy className="h-4 w-4" /> Results
                  </Button>
                  <Button
                    variant={ex.published ? "outline" : "default"}
                    size="sm"
                    onClick={() => togglePublish(ex)}
                    title={ex.published ? "Hide from parents" : "Publish to parents"}
                  >
                    {ex.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {ex.published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(ex)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remove(ex)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail panel */}
      <div key={detailKey}>
        {detail.mode === "results" && (
          <ResultsView examId={detail.examId} onClose={() => setDetail({ mode: "none" })} />
        )}
        {detail.mode === "entry" && (
          <AdminEntry examId={detail.examId} klass={klass} onClose={() => setDetail({ mode: "none" })} />
        )}
        {detail.mode === "overall" && (
          <OverallView klass={klass} session={session} onClose={() => setDetail({ mode: "none" })} />
        )}
      </div>

      <ExamFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        klass={klass}
        session={session}
        editing={editing}
        onSaved={loadExams}
      />
    </div>
  );
}
