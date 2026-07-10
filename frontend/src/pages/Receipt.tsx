import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import api from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Crest } from "@/components/Brand";
import { SCHOOL } from "@/lib/school";

export default function Receipt() {
  const { id } = useParams();
  const [payment, setPayment] = useState<any>(null);
  const [schoolName, setSchoolName] = useState("School");
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get(`/payments/${id}/receipt`)
      .then(({ data }) => setPayment(data.payment))
      .catch(() => setError(true));
    api
      .get("/config")
      .then(({ data }) => setSchoolName(data.schoolName || "School"))
      .catch(() => {});
  }, [id]);

  if (error) return <p className="p-10 text-center text-muted-foreground">Receipt not found.</p>;
  if (!payment) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;

  const student = payment.student || {};
  const invoice = payment.invoice || {};
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between border-b border-dashed py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-md space-y-4 px-4">
        <div className="flex justify-end gap-2 print:hidden">
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm print:border-0 print:shadow-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-3">
              <Crest size="sm" />
              <div>
                <h1 className="font-heading text-lg font-bold leading-tight">{schoolName}</h1>
                <p className="text-xs text-muted-foreground">{SCHOOL.address} · Fee Receipt</p>
              </div>
            </div>
            <QRCodeSVG value={payment.receiptNo || String(id)} size={56} />
          </div>

          {/* Meta */}
          <div className="mt-4 space-y-0.5">
            {row("Receipt No", payment.receiptNo)}
            {row(
              "Date",
              payment.createdAt ? new Date(payment.createdAt).toLocaleString("en-IN") : "—"
            )}
            {row("Student", student.name)}
            {row(
              "Class",
              `${student.class || invoice.class || "—"}${student.section ? "-" + student.section : ""}`
            )}
            {student.admissionNo && row("Admission No", student.admissionNo)}
            {invoice.periodLabel && row("Fee period", invoice.periodLabel)}
            {invoice.academicYear && row("Session", invoice.academicYear)}
            {row("Mode", String(payment.mode || "").toUpperCase())}
            {payment.collectedBy?.name && row("Collected by", payment.collectedBy.name)}
          </div>

          {/* Amount — for online payments show fee + convenience fee + true total */}
          {payment.platformCharge > 0 ? (
            <div className="mt-4 space-y-1 rounded-lg bg-primary/5 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Fee paid</span>
                <span className="font-medium">{formatINR(payment.amount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Convenience fee</span>
                <span className="font-medium">{formatINR(payment.platformCharge)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-primary/20 pt-1">
                <span className="text-sm font-medium">Total paid</span>
                <span className="text-2xl font-bold text-primary">
                  {formatINR(payment.amount + payment.platformCharge)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between rounded-lg bg-primary/5 px-4 py-3">
              <span className="text-sm font-medium">Amount paid</span>
              <span className="text-2xl font-bold text-primary">{formatINR(payment.amount)}</span>
            </div>
          )}

          {typeof invoice.dueAmount === "number" && (
            <p className="mt-2 text-right text-sm text-muted-foreground">
              Remaining due:{" "}
              <span className="font-medium text-foreground">{formatINR(invoice.dueAmount)}</span>
            </p>
          )}

          <p className="mt-6 border-t pt-3 text-center text-xs text-muted-foreground">
            This is a computer-generated receipt.
          </p>
        </div>
      </div>
    </div>
  );
}
