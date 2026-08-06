import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import type { Invoice, Student } from "@/types";
import { formatINR } from "@/lib/utils";
import { classLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crest } from "@/components/Brand";
import { SCHOOL } from "@/lib/school";

// yyyy-mm-dd for the <input type="date"> default.
const todayKey = () => new Date().toLocaleDateString("en-CA");
const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

/**
 * A printable Transfer Certificate (school leaving certificate) for a student who
 * has left. Standalone route with no admin chrome, opened in a new tab from the
 * student's page — the same shape as the Bonafide certificate, and like it, built
 * on existing endpoints so there is no new backend surface.
 *
 * A TC is the document the next school admits on, so the wording is deliberately
 * plain and every fact on it comes from the student's record rather than being
 * typed in fresh. The three things a clerk genuinely has to judge — conduct,
 * whether the child is fit for promotion, and any remark — are inputs, and they
 * are the only inputs.
 *
 * Dues are read from the student's invoices rather than asserted, because "no
 * dues" on a TC is a statement the school is held to.
 */
export default function TransferCertificate() {
  const { id } = useParams();
  const [student, setStudent] = useState<Student | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [issueDate, setIssueDate] = useState(todayKey());
  const [conduct, setConduct] = useState("Good");
  const [promoted, setPromoted] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.get(`/students/${id}`), api.get(`/invoices/student/${id}`)])
      .then(([s, inv]) => {
        setStudent(s.data.student);
        setInvoices(inv.data.invoices || []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;
  if (error || !student)
    return <p className="p-10 text-center text-muted-foreground">Student not found.</p>;

  // A transfer certificate says the child has left. Issuing one for a student who
  // is still on the rolls would be a false statement, so send the clerk back to
  // record the leaving first instead of quietly printing it anyway. Passing out of
  // the school's last class counts — they have finished and are entitled to one.
  if (student.status !== "left" && student.status !== "passed") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 font-heading text-xl font-bold">
          {student.name} is still on the rolls
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A transfer certificate states that a student has left the school. Record the leaving
          first — Students → the ⋯ menu on their row → <b>Mark as left</b> — and the certificate
          will pick up the date and reason from there.
        </p>
        <Button asChild className="mt-6">
          <Link to="/admin/students">Back to students</Link>
        </Button>
      </div>
    );
  }

  const totalDue = invoices.reduce((s, i) => s + (i.dueAmount || 0), 0);
  const duesCleared = totalDue <= 0;
  const passedOut = student.status === "passed";

  // Gender-aware wording, with a neutral fallback when gender isn't recorded.
  const g = student.gender;
  const childOf = g === "Male" ? "son" : g === "Female" ? "daughter" : "child";
  const heShe = g === "Male" ? "He" : g === "Female" ? "She" : "He/She";
  const hisHer = g === "Male" ? "his" : g === "Female" ? "her" : "his/her";

  const cls = `${classLabel(student.class)}${student.section ? "-" + student.section : ""}`;
  // Derived from the admission number, so re-printing a lost copy gives the same
  // number rather than a new one.
  const certNo = `${SCHOOL.shortName}/TC/${(student.session || "").replace(/\s/g, "")}/${
    student.admissionNo
  }`;

  // The class the child was first enrolled in, when the history records it.
  const firstEnrolment = student.enrollmentHistory?.[0];

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-3 border-b border-dotted border-foreground/20 py-2 print:py-[3px]">
      <span className="w-[46%] shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );

  return (
    <>
      {/* A transfer certificate must come out on one sheet — a two-page TC gets
          questioned by the school receiving it. The global 14mm print margin plus
          this document's own frame is what tipped it over, so this page asks for a
          tighter one. */}
      <style>{"@media print{@page{margin:8mm}}"}</style>
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4">
        {/* Controls — hidden when printing */}
        <div className="mb-4 space-y-3 rounded-lg border bg-white p-4 print:hidden">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[150px] space-y-1.5">
              <Label>Conduct</Label>
              <Input
                value={conduct}
                onChange={(e) => setConduct(e.target.value)}
                placeholder="Good"
              />
            </div>
            <div className="min-w-[190px] flex-1 space-y-1.5">
              <Label>Qualified for promotion to</Label>
              <Input
                value={promoted}
                onChange={(e) => setPromoted(e.target.value)}
                placeholder="e.g. Class 6 — leave blank to omit"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Issue date</Label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => e.target.value && setIssueDate(e.target.value)}
                className="w-auto"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Remarks (optional)</Label>
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Anything the next school should know"
            />
          </div>
          {!duesCleared && (
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {student.name} still owes <b>{formatINR(totalDue)}</b>. The certificate will say
                dues are outstanding — settle them first if it should say otherwise.
              </span>
            </p>
          )}
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>

        {/* Certificate */}
        <div className="relative overflow-hidden rounded-lg bg-white p-10 shadow-sm print:rounded-none print:p-5 print:shadow-none">
          {/* Decorative double frame */}
          <div className="pointer-events-none absolute inset-3 rounded border-2 border-primary/40" />
          <div className="pointer-events-none absolute inset-[14px] rounded border border-primary/20" />

          <div className="relative">
            {/* Header */}
            <div className="flex flex-col items-center text-center">
              <Crest size="lg" />
              <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
                {SCHOOL.fullName}
              </h1>
              <p className="text-sm text-muted-foreground">{SCHOOL.address}</p>
              {(SCHOOL.phone || SCHOOL.email) && (
                <p className="text-xs text-muted-foreground">
                  {[SCHOOL.phone, SCHOOL.email].filter(Boolean).join(" · ")}
                </p>
              )}
              {SCHOOL.affiliation && (
                <p className="text-xs text-muted-foreground">{SCHOOL.affiliation}</p>
              )}
            </div>

            <div className="mt-5 text-center print:mt-3">
              <span className="inline-block rounded border-2 border-primary px-6 py-1 text-base font-bold uppercase tracking-[0.2em] text-primary">
                {/* A child who finished the school's last class did not transfer
                    anywhere — they completed their studies here, and the heading
                    should say so. */}
                {passedOut ? "School Leaving Certificate" : "Transfer Certificate"}
              </span>
            </div>

            {/* Meta */}
            <div className="mt-5 flex items-center justify-between text-sm print:mt-3 print:text-[12.5px]">
              <span>
                Certificate No: <span className="font-semibold">{certNo}</span>
              </span>
              <span>
                Date: <span className="font-semibold">{fmtDate(issueDate)}</span>
              </span>
            </div>

            {/* The particulars — a TC is read as a table by the admitting school */}
            <div className="mt-6 text-[14px] leading-6 print:mt-3 print:text-[12.5px] print:leading-[1.35]">
              {row("Name of the student", <span className="font-semibold">{student.name}</span>)}
              {row("Father's / Guardian's name", student.parentName)}
              {student.motherName && row("Mother's name", student.motherName)}
              {row("Admission No.", student.admissionNo)}
              {row("Date of birth", fmtDate(student.dateOfBirth))}
              {row("Category", student.category)}
              {row("Date of admission", fmtDate(student.dateOfAdmission))}
              {firstEnrolment &&
                row(
                  "Class in which admitted",
                  `${classLabel(firstEnrolment.class)}${
                    firstEnrolment.section ? "-" + firstEnrolment.section : ""
                  }`
                )}
              {/* classLabel already reads "Class 5" for numbered classes, so it is
                  not prefixed again here. */}
              {row("Class last studied", cls)}
              {row("Academic session", student.session)}
              {row(
                passedOut ? "Date of completing school" : "Date of leaving the school",
                fmtDate(student.exitDate)
              )}
              {row(
                "Reason for leaving",
                student.exitReason || (passedOut ? "Completed studies here" : "On parent's request")
              )}
              {row(
                "School dues",
                duesCleared ? (
                  "All dues cleared"
                ) : (
                  <span className="text-rose-600">
                    {formatINR(totalDue)} outstanding
                  </span>
                )
              )}
              {row("Conduct and character", conduct.trim() || "Good")}
              {promoted.trim() && row("Qualified for promotion to", promoted.trim())}
              {remarks.trim() && row("Remarks", remarks.trim())}
            </div>

            {/* Body */}
            <p className="mt-6 text-justify text-[15px] leading-8 print:mt-3 print:text-[12.5px] print:leading-[1.5]">
              This is to certify that the particulars given above have been taken from the records
              of this school and are correct to the best of our knowledge.{" "}
              {passedOut ? (
                <>
                  {heShe} completed {hisHer} studies at this school in {cls} and left on{" "}
                  <span className="font-semibold">{fmtDate(student.exitDate)}</span>
                </>
              ) : (
                <>
                  {heShe} left the school on{" "}
                  <span className="font-semibold">{fmtDate(student.exitDate)}</span>
                </>
              )}
              , and no disciplinary action is pending against {hisHer} name. We wish {hisHer} every success
              in {hisHer} future studies.
            </p>

            {/* Signatures — the role is printed, never the person's name. Whoever
                holds the post signs and stamps above the line, so a change of
                principal never makes a printed certificate wrong, and the app does
                not have to be touched. */}
            <div className="mt-20 flex items-end justify-between print:mt-8">
              <div className="text-center text-sm text-muted-foreground">
                <div className="h-16 print:h-9" />
                <p>Seal</p>
              </div>
              <div className="text-center text-sm">
                {/* Blank space to sign and stamp in. */}
                <div className="h-16 print:h-9" />
                <div className="border-t border-foreground/50 px-10 pt-1">
                  <p className="font-semibold text-foreground">
                    {SCHOOL.principal.role || "Principal"}
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-8 text-center text-[11px] text-muted-foreground print:hidden">
              Computer-generated certificate · {childOf} of {student.parentName || "—"} ·{" "}
              {certNo}
            </p>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
