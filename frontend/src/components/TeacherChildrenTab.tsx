import { useEffect, useState } from "react";
import { GraduationCap, IndianRupee } from "lucide-react";
import api from "@/lib/api";
import type { Invoice, Student } from "@/types";
import { classLabel } from "@/lib/constants";
import { formatINR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Staff whose own child studies here share ONE login for both roles (their mobile
// number). Since the role resolves to "teacher", this tab is how they still see
// their child's fees — the same data a parent sees in the parent portal.
export function TeacherChildrenTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/teacher/children"), api.get("/teacher/children/invoices")])
      .then(([s, i]) => {
        setStudents(s.data.students || []);
        setInvoices(i.data.invoices || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-8 text-center text-muted-foreground">Loading…</p>;

  if (students.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <GraduationCap className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">No children linked to your account</p>
        <p className="mt-1 text-sm text-muted-foreground">
          If your child studies here, ask the office to record your mobile number on their student
          record — then their fees will appear here.
        </p>
      </div>
    );
  }

  const totalDue = invoices.reduce((s, i) => s + (i.dueAmount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          My {students.length === 1 ? "child" : "children"}
        </p>
        <div className="mt-3 space-y-2">
          {students.map((s) => (
            <div key={s._id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.admissionNo} · {classLabel(s.class)}
                  {s.section ? `-${s.section}` : ""}
                </p>
              </div>
              <Badge status={s.status} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <IndianRupee className="h-4 w-4" /> Fees
          </p>
          <p className="text-sm">
            Total due <span className="font-bold text-rose-600">{formatINR(totalDue)}</span>
          </p>
        </div>

        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No fees generated yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {invoices.map((inv) => (
              <div key={inv._id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{inv.periodLabel}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {typeof inv.student === "object" ? inv.student.name : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{formatINR(inv.netAmount)}</p>
                  <p className="text-xs">
                    {inv.dueAmount > 0 ? (
                      <span className="text-rose-600">{formatINR(inv.dueAmount)} due</span>
                    ) : (
                      <span className="text-emerald-600">Paid</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Pay at the school office — receipts are issued there.
        </p>
      </div>
    </div>
  );
}
