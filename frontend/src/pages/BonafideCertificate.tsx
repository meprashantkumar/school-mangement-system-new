import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import api from "@/lib/api";
import type { Student } from "@/types";
import { classLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crest } from "@/components/Brand";
import { SCHOOL } from "@/lib/school";

// yyyy-mm-dd for the <input type="date"> default.
const todayKey = () => new Date().toLocaleDateString("en-CA");
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—";

// A printable Bonafide Certificate for a student. Standalone route (no admin
// chrome), opened in a new tab from the student's detail page. Staff can add an
// optional purpose + issue date, then Print / Save as PDF. Reads the student via
// the existing GET /students/:id — no backend changes.
export default function BonafideCertificate() {
  const { id } = useParams();
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [issueDate, setIssueDate] = useState(todayKey());

  useEffect(() => {
    api
      .get(`/students/${id}`)
      .then(({ data }) => setStudent(data.student))
      .catch(() => setError(true));
  }, [id]);

  if (error) return <p className="p-10 text-center text-muted-foreground">Student not found.</p>;
  if (!student) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;

  // Gender-aware wording, with a neutral fallback when gender isn't recorded.
  const g = student.gender;
  const childOf = g === "Male" ? "son" : g === "Female" ? "daughter" : "child";
  const heShe = g === "Male" ? "He" : g === "Female" ? "She" : "He/She";
  const hisHerLower = g === "Male" ? "his" : g === "Female" ? "her" : "his/her";

  const cls = `${classLabel(student.class)}${student.section ? "-" + student.section : ""}`;
  const certNo = `${SCHOOL.shortName}/BC/${(student.session || "").replace(/\s/g, "")}/${student.admissionNo}`;

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4">
        {/* Controls — hidden when printing */}
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4 print:hidden">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label>Purpose (optional)</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. bank account opening, passport, scholarship"
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
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>

        {/* Certificate */}
        <div className="relative overflow-hidden rounded-lg bg-white p-10 shadow-sm print:rounded-none print:shadow-none">
          {/* Decorative double frame */}
          <div className="pointer-events-none absolute inset-3 rounded border-2 border-primary/40" />
          <div className="pointer-events-none absolute inset-[14px] rounded border border-primary/20" />

          <div className="relative">
            {/* Header */}
            <div className="flex flex-col items-center text-center">
              <Crest size="lg" />
              <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">{SCHOOL.fullName}</h1>
              <p className="text-sm text-muted-foreground">{SCHOOL.address}</p>
              {(SCHOOL.phone || SCHOOL.email) && (
                <p className="text-xs text-muted-foreground">
                  {[SCHOOL.phone, SCHOOL.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <div className="mt-6 text-center">
              <span className="inline-block rounded border-2 border-primary px-6 py-1 text-base font-bold uppercase tracking-[0.2em] text-primary">
                Bonafide Certificate
              </span>
            </div>

            {/* Meta */}
            <div className="mt-6 flex items-center justify-between text-sm">
              <span>
                Certificate No: <span className="font-semibold">{certNo}</span>
              </span>
              <span>
                Date: <span className="font-semibold">{fmtDate(issueDate)}</span>
              </span>
            </div>

            {/* Body */}
            <div className="mt-8 space-y-5 text-justify text-[15px] leading-8 text-foreground">
              <p>
                This is to certify that <span className="font-semibold">{student.name}</span>, {childOf} of{" "}
                <span className="font-semibold">{student.parentName || "—"}</span>, bearing Admission No.{" "}
                <span className="font-semibold">{student.admissionNo}</span>, is a bonafide student of{" "}
                <span className="font-semibold">{SCHOOL.fullName}</span>. {heShe} is studying in{" "}
                {/* classLabel already yields "Class 5" — prefixing again printed
                    "Class Class 5-A" on every certificate the school handed out. */}
                <span className="font-semibold">{cls}</span> during the academic session{" "}
                <span className="font-semibold">{student.session || "—"}</span>.
              </p>
              <p>
                {student.dateOfAdmission && (
                  <>
                    According to the school records, {hisHerLower} date of admission to the school is{" "}
                    <span className="font-semibold">{fmtDate(student.dateOfAdmission)}</span>.{" "}
                  </>
                )}
                {heShe} belongs to the <span className="font-semibold">{student.category}</span> category, and{" "}
                {hisHerLower} general conduct and character are good.
              </p>
              <p>
                This certificate is issued{" "}
                {purpose.trim() ? (
                  <>
                    for the purpose of <span className="font-semibold">{purpose.trim()}</span>
                  </>
                ) : (
                  "on request for whatever purpose it may serve"
                )}
                .
              </p>
            </div>

            {/* Signatures — the role is printed, never the person's name. Whoever
                holds the post signs and stamps above the line, so a change of
                principal never makes a printed certificate wrong, and the app does
                not have to be touched. */}
            <div className="mt-20 flex items-end justify-between">
              <div className="text-center text-sm text-muted-foreground">
                <div className="h-16" />
                <p>Seal</p>
              </div>
              <div className="text-center text-sm">
                {/* Blank space to sign and stamp in. */}
                <div className="h-16" />
                <div className="border-t border-foreground/50 px-10 pt-1">
                  <p className="font-semibold text-foreground">
                    {SCHOOL.principal.role || "Principal"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
