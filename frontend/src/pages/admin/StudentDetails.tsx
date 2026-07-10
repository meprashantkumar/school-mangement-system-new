import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, User, Users, Receipt, History, IndianRupee } from "lucide-react";
import api from "@/lib/api";
import type { Invoice, Payment, Student } from "@/types";
import { formatINR } from "@/lib/utils";
import { classLabel } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}

export default function StudentDetails() {
  const { id } = useParams();
  const [student, setStudent] = useState<Student | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get(`/students/${id}`),
      api.get(`/invoices/student/${id}`),
      api.get(`/payments`, { params: { student: id } }),
    ])
      .then(([s, inv, pay]) => {
        setStudent(s.data.student);
        setInvoices(inv.data.invoices);
        setPayments(pay.data.payments);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!student) return <p className="text-muted-foreground">Student not found.</p>;

  const totalDue = invoices.reduce((s, i) => s + (i.dueAmount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-6">
      <Link
        to="/admin/students"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to students
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            {student.name}
            <Badge status={student.status} />
          </h1>
          <p className="text-muted-foreground">
            {student.admissionNo} · {classLabel(student.class)}
            {student.section ? `-${student.section}` : ""} · Session {student.session || "—"}
          </p>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <p className="text-xs uppercase text-muted-foreground">Total due</p>
            <p className="text-xl font-bold text-rose-600">{formatINR(totalDue)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-muted-foreground">Total paid</p>
            <p className="text-xl font-bold text-emerald-600">{formatINR(totalPaid)}</p>
          </div>
        </div>
      </div>

      {student.status === "left" && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="py-3 text-sm text-orange-800">
            Left school on <strong>{fmtDate(student.exitDate)}</strong>
            {student.exitReason ? ` — ${student.exitReason}` : ""}.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" /> Student details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label="Admission No" value={student.admissionNo} />
            <Field label="Date of admission" value={fmtDate(student.dateOfAdmission)} />
            <Field label="Class" value={`${classLabel(student.class)}${student.section ? "-" + student.section : ""}`} />
            <Field label="Roll No" value={student.rollNo} />
            <Field label="Gender" value={student.gender} />
            <Field label="Category" value={student.category} />
            <Field label="Session" value={student.session} />
            <Field
              label="Optional services"
              value={student.optedServices?.length ? student.optedServices.join(", ") : "None"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" /> Parent / guardian
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label="Parent name" value={student.parentName} />
            <Field label="Phone" value={student.parentPhone} />
            <Field label="Email" value={student.parentEmail} />
          </CardContent>
        </Card>
      </div>

      {student.enrollmentHistory && student.enrollmentHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-primary" /> Enrollment history
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-sm">
              {student.enrollmentHistory.map((e, i) => (
                <span key={i} className="rounded-md border px-3 py-1">
                  {e.session}: {classLabel(e.class)}
                  {e.section ? `-${e.section}` : ""}
                </span>
              ))}
              <span className="rounded-md border border-primary/40 bg-primary/5 px-3 py-1 font-medium">
                {student.session}: {classLabel(student.class)}
                {student.section ? `-${student.section}` : ""} (current)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <IndianRupee className="h-5 w-5 text-primary" /> Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <TableRow key={inv._id}>
                    <TableCell>{inv.periodLabel}</TableCell>
                    <TableCell>{formatINR(inv.netAmount)}</TableCell>
                    <TableCell>{formatINR(inv.paidAmount)}</TableCell>
                    <TableCell>{formatINR(inv.dueAmount)}</TableCell>
                    <TableCell>
                      <Badge status={inv.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-primary" /> Payment history
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    No payments yet.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => window.open(`/receipt/${p._id}`, "_blank")}
                        className="text-primary hover:underline"
                        title="Open receipt"
                      >
                        {p.receiptNo}
                      </button>
                    </TableCell>
                    <TableCell>{p.createdAt && new Date(p.createdAt).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="uppercase">{p.mode}</TableCell>
                    <TableCell>{formatINR(p.amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
