import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { PortalStudentResult } from "@/types";
import { classLabel, examTypeLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { SCHOOL } from "@/lib/school";
import { Crest } from "@/components/Brand";
import { Button } from "@/components/ui/button";

const markText = (m: { marksObtained: number | null; absent: boolean; entered: boolean }) =>
  m.absent ? "AB" : m.entered && m.marksObtained != null ? String(m.marksObtained) : "—";

export default function ReportCard() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PortalStudentResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/portal/results")
      .then(({ data }) => {
        const found = (data.results as PortalStudentResult[]).find((r) => r.student._id === studentId);
        setData(found || null);
      })
      .catch(() => toast.error("Couldn't load report card"))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <p className="py-20 text-center text-muted-foreground">Loading…</p>;
  if (!data)
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">No published results for this student yet.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/portal")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    );

  const s = data.student;
  const published = data.exams; // backend only returns published exams

  return (
    <div className="min-h-screen bg-muted/40 p-3 pb-10 print:bg-white print:p-0 sm:p-4">
      {/* Action bar (not printed). Sticky so Print stays in reach on a phone,
          where the card itself is several screens long. */}
      <div className="sticky top-0 z-10 -mx-3 mb-4 flex items-center justify-between gap-2 border-b bg-muted/80 px-3 py-2 backdrop-blur print:hidden sm:static sm:mx-auto sm:max-w-3xl sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <Button variant="outline" size="sm" className="h-10" onClick={() => navigate("/portal")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button size="sm" className="h-10" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print / </span>Save PDF
        </Button>
      </div>

      {/* Report card sheet */}
      <div className="mx-auto max-w-3xl rounded-xl border bg-white p-4 shadow-sm print:rounded-none print:border-0 print:shadow-none sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 border-b pb-4 sm:gap-4">
          <Crest size="md" />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-xl font-bold sm:text-2xl">{SCHOOL.name}</h1>
            {SCHOOL.place && <p className="text-sm text-muted-foreground">{SCHOOL.place}</p>}
            <p className="mt-1 text-sm font-semibold text-primary">Progress Report · {s.session}</p>
          </div>
        </div>

        {/* Student info */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 py-4 text-sm sm:grid-cols-4">
          <Info label="Name" value={s.name} />
          <Info label="Class" value={`${classLabel(s.class)}${s.section ? `-${s.section}` : ""}`} />
          <Info label="Admission No" value={s.admissionNo} />
          <Info label="Roll No" value={s.rollNo || "—"} />
        </div>

        {/* Overall */}
        {data.overall && data.overall.rank != null && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/5 px-4 py-3">
            <span className="font-heading font-semibold">Overall (weighted)</span>
            <div className="flex items-center gap-4 text-sm">
              <span>
                Percentage:{" "}
                <span className="font-bold text-primary">{data.overall.pct}%</span>
              </span>
              <span>
                Rank:{" "}
                <span className="font-bold text-primary">
                  {data.overall.rank} / {data.overall.classSize}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Each exam */}
        <div className="space-y-6">
          {published.map((ex) => (
            <div key={ex.examId}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-heading text-base font-bold">
                  {ex.name}{" "}
                  <span className="text-xs font-normal text-muted-foreground">· {examTypeLabel(ex.type)}</span>
                </h2>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    !ex.complete
                      ? "bg-slate-100 text-slate-600"
                      : ex.passed
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                  )}
                >
                  {!ex.complete ? "Result awaited" : ex.passed ? "PASS" : "FAIL"}
                </span>
              </div>
              {/* Max and Pass are dropped on a phone — five columns crush the
                  subject name. They're back on tablets and in print (the print
                  viewport is paper-width, so it clears the sm breakpoint). */}
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y bg-muted/40 text-left">
                    <th className="px-2 py-1.5 font-semibold sm:px-3">Subject</th>
                    <th className="hidden px-3 py-1.5 text-right font-semibold sm:table-cell">Max</th>
                    <th className="hidden px-3 py-1.5 text-right font-semibold sm:table-cell">Pass</th>
                    <th className="px-2 py-1.5 text-right font-semibold sm:px-3">Marks</th>
                    <th className="px-2 py-1.5 text-right font-semibold sm:px-3">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {ex.subjects.map((sub) => (
                    <tr key={sub.subject} className="border-b">
                      <td className="px-2 py-1.5 sm:px-3">
                        {sub.name}
                        {/* Keeps "out of how many" visible where Max is hidden. */}
                        <span className="ml-1 text-xs text-muted-foreground sm:hidden">
                          / {sub.maxMarks}
                        </span>
                      </td>
                      <td className="hidden px-3 py-1.5 text-right text-muted-foreground sm:table-cell">
                        {sub.maxMarks}
                      </td>
                      <td className="hidden px-3 py-1.5 text-right text-muted-foreground sm:table-cell">
                        {sub.passMarks}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium sm:px-3">{markText(sub)}</td>
                      <td className="px-2 py-1.5 text-right sm:px-3">
                        {!sub.entered ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={cn("text-xs font-semibold", sub.passed ? "text-emerald-600" : "text-rose-600")}>
                            {sub.absent ? "AB" : sub.passed ? "P" : "F"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b-2 font-semibold">
                    <td className="px-2 py-1.5 sm:px-3">Total</td>
                    <td className="hidden px-3 py-1.5 text-right sm:table-cell">{ex.maxTotal}</td>
                    <td className="hidden px-3 py-1.5 sm:table-cell" />
                    <td className="px-2 py-1.5 text-right sm:px-3">
                      {ex.total}
                      <span className="ml-0.5 text-xs font-normal text-muted-foreground sm:hidden">
                        /{ex.maxTotal}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right sm:px-3">{ex.pct}%</td>
                  </tr>
                </tbody>
              </table>
              {ex.rank != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Class rank: <span className="font-semibold text-foreground">{ex.rank} of {ex.classSize}</span>
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 grid grid-cols-2 gap-6 text-center text-xs text-muted-foreground sm:grid-cols-3">
          <Sign label="Class Teacher" />
          <Sign label={`Principal — ${SCHOOL.principal.name}`} />
          <Sign label="Parent / Guardian" />
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Sign({ label }: { label: string }) {
  return (
    <div>
      <div className="mb-1 h-8 border-b border-dashed" />
      {label}
    </div>
  );
}
