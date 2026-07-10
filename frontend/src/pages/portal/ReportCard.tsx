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
    <div className="min-h-screen bg-muted/40 p-4 print:bg-white print:p-0">
      {/* Action bar (not printed) */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between print:hidden">
        <Button variant="outline" size="sm" onClick={() => navigate("/portal")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      {/* Report card sheet */}
      <div className="mx-auto max-w-3xl rounded-xl border bg-white p-6 shadow-sm print:rounded-none print:border-0 print:shadow-none sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 border-b pb-4">
          <Crest size="md" />
          <div className="flex-1">
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
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y bg-muted/40 text-left">
                    <th className="px-3 py-1.5 font-semibold">Subject</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Max</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Pass</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Marks</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {ex.subjects.map((sub) => (
                    <tr key={sub.subject} className="border-b">
                      <td className="px-3 py-1.5">{sub.name}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{sub.maxMarks}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{sub.passMarks}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{markText(sub)}</td>
                      <td className="px-3 py-1.5 text-right">
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
                    <td className="px-3 py-1.5">Total</td>
                    <td className="px-3 py-1.5 text-right">{ex.maxTotal}</td>
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-right">{ex.total}</td>
                    <td className="px-3 py-1.5 text-right">{ex.pct}%</td>
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
