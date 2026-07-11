import { useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, CheckCircle2, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { CLASSES, CATEGORIES, CURRENT_SESSION, classLabel } from "@/lib/constants";
import { SCHOOL } from "@/lib/school";
import { Crest } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const empty = {
  studentName: "",
  gender: "",
  dateOfBirth: "",
  applyingForClass: "",
  category: "General",
  previousSchool: "",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  address: "",
  message: "",
};

export default function Admissions() {
  const [form, setForm] = useState({ ...empty });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.studentName.trim() || !form.applyingForClass || !form.parentName.trim() || !form.parentPhone.trim()) {
      toast.error("Please fill the required (*) fields.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/admissions/public", { ...form, session: CURRENT_SESSION });
      setDone(data.applicationNo);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3">
            <Crest size="sm" />
            <div className="leading-tight">
              <div className="font-heading text-sm font-bold">{SCHOOL.name}</div>
              <div className="text-xs text-muted-foreground">Online Admission</div>
            </div>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Home
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {done ? (
          <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
            <h1 className="mt-4 font-heading text-2xl font-bold">Application submitted!</h1>
            <p className="mt-2 text-muted-foreground">
              Thank you for applying to {SCHOOL.name}. Our admissions team will review your
              application and contact you.
            </p>
            <div className="mx-auto mt-5 inline-block rounded-lg border bg-secondary px-5 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Your application number</p>
              <p className="font-mono text-xl font-bold text-primary">{done}</p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Please keep this number for future reference.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="outline" onClick={() => { setForm({ ...empty }); setDone(null); }}>
                Submit another
              </Button>
              <Button asChild>
                <Link to="/">Back to home</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight">Admission Application</h1>
                <p className="text-sm text-muted-foreground">
                  Fill this form to apply for admission for session {CURRENT_SESSION}. Fields marked * are required.
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-6">
              {/* Student */}
              <section className="rounded-xl border bg-card p-5 shadow-sm">
                <h2 className="mb-4 font-heading font-semibold">Student details</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>Student's full name *</Label>
                    <Input value={form.studentName} onChange={(e) => set("studentName", e.target.value)} placeholder="e.g. Aarav Sharma" />
                  </div>
                  <div>
                    <Label>Applying for class *</Label>
                    <select
                      value={form.applyingForClass}
                      onChange={(e) => set("applyingForClass", e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select class…</option>
                      {CLASSES.map((c) => (
                        <option key={c} value={c}>{classLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <select
                      value={form.gender}
                      onChange={(e) => set("gender", e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select…</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <Label>Date of birth</Label>
                    <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <select
                      value={form.category}
                      onChange={(e) => set("category", e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Previous school (if any)</Label>
                    <Input value={form.previousSchool} onChange={(e) => set("previousSchool", e.target.value)} />
                  </div>
                </div>
              </section>

              {/* Parent */}
              <section className="rounded-xl border bg-card p-5 shadow-sm">
                <h2 className="mb-4 font-heading font-semibold">Parent / guardian details</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Parent / guardian name *</Label>
                    <Input value={form.parentName} onChange={(e) => set("parentName", e.target.value)} />
                  </div>
                  <div>
                    <Label>Contact phone *</Label>
                    <Input value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} placeholder="10-digit mobile" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={form.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} placeholder="Used later for the parent login" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Address</Label>
                    <textarea
                      value={form.address}
                      onChange={(e) => set("address", e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Anything you'd like to tell us?</Label>
                    <textarea
                      value={form.message}
                      onChange={(e) => set("message", e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </section>

              <div className="flex items-center justify-end gap-3">
                <Button type="submit" size="lg" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit application"}
                </Button>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
