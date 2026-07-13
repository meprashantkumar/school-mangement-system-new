import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  CreditCard,
  Receipt,
  Info,
  CalendarClock,
  CheckCircle2,
  Wallet,
  Award,
  FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { payInvoiceOnline } from "@/lib/pay";
import { useAuth } from "@/context/AuthContext";
import type { AppConfig, Invoice, Payment, PortalStudentResult } from "@/types";
import { formatINR, cn } from "@/lib/utils";
import { classLabel, examTypeLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/Brand";
import { Pager } from "@/components/Pager";
import { PortalTimetable } from "@/components/PortalTimetable";

const RESULTS_PER_EXAM_PAGE = 4;
const DUES_PER_PAGE = 4;
const PAYMENTS_PER_PAGE = 6;

export default function Portal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [results, setResults] = useState<PortalStudentResult[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  // Client-side pagination (portal loads everything up-front).
  const [duesPage, setDuesPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [examPage, setExamPage] = useState<Record<string, number>>({});

  const load = async () => {
    const [inv, pay, res] = await Promise.all([
      api.get("/portal/invoices"),
      api.get("/portal/payments"),
      api.get("/portal/results"),
    ]);
    setInvoices(inv.data.invoices);
    setPayments(pay.data.payments);
    setResults(res.data.results || []);
  };

  useEffect(() => {
    load().catch(() => {});
    api
      .get("/config")
      .then(({ data }: { data: AppConfig }) => setConfig(data))
      .catch(() => {});
  }, []);

  const platformFeePct = config?.onlinePlatformFeePct ?? 2.5;
  // Convenience fee = a % of the amount paid, rounded up to the rupee — must match
  // the server's platformFeeFor() so the amount shown is exactly what's charged.
  const feeFor = (amount: number) => Math.ceil((amount * platformFeePct) / 100);
  const lateFeePerDay = config?.lateFeePerDay ?? 0;
  const schoolName = config?.schoolName || "School";

  const totalDue = invoices.reduce((s, i) => s + (i.dueAmount || 0), 0);
  const isOverdue = (inv: Invoice) =>
    inv.dueAmount > 0 && !!inv.dueDate && new Date(inv.dueDate) < new Date();

  const pay = async (inv: Invoice) => {
    setPaying(inv._id);
    try {
      await payInvoiceOnline(inv._id, inv.dueAmount, {
        name: user?.name,
        email: user?.email,
        phone: user?.phone,
      });
      toast.success("Payment successful");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Payment failed");
    } finally {
      setPaying(null);
    }
  };

  const duesPages = Math.max(1, Math.ceil(invoices.length / DUES_PER_PAGE));
  const safeDuesPage = Math.min(duesPage, duesPages);
  const duesShown = invoices.slice((safeDuesPage - 1) * DUES_PER_PAGE, safeDuesPage * DUES_PER_PAGE);

  const payPages = Math.max(1, Math.ceil(payments.length / PAYMENTS_PER_PAGE));
  const safePayPage = Math.min(payPage, payPages);
  const payShown = payments.slice((safePayPage - 1) * PAYMENTS_PER_PAGE, safePayPage * PAYMENTS_PER_PAGE);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3 font-semibold">
          <Crest size="sm" />
          <div className="leading-tight">
            <div className="font-heading">{schoolName}</div>
            <div className="text-xs font-normal text-muted-foreground">Parent Portal</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">Hi, {user?.name}</span>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="sm:col-span-2 border-0 bg-gradient-to-br from-primary to-brand-blue text-white">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-white/80">Total amount due</p>
                <p className="mt-1 text-3xl font-bold">{formatINR(totalDue)}</p>
                <p className="mt-1 text-sm text-white/80">
                  {totalDue > 0
                    ? "Please clear the dues to avoid late fees."
                    : "You're all caught up. Thank you!"}
                </p>
              </div>
              <Wallet className="h-12 w-12 text-white/40" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex h-full flex-col justify-center p-6">
              <p className="text-sm text-muted-foreground">Children</p>
              <p className="mt-1 text-3xl font-bold">
                {new Set(invoices.map((i) => i.student?._id)).size || "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{invoices.length} fee record(s)</p>
            </CardContent>
          </Card>
        </div>

        {/* Good to know */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Info className="h-4 w-4 text-primary" /> Good to know
            </p>
            <ul className="ml-6 list-disc space-y-1 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Pay online</span> using UPI, card, net
                banking or wallet — a convenience fee of{" "}
                <span className="font-medium text-foreground">{platformFeePct}%</span> applies
                per online payment (it covers the payment-gateway charge).
              </li>
              <li>
                To <span className="font-medium text-foreground">avoid the convenience fee</span>, pay
                by cash, cheque, or by scanning the school's UPI QR at the fee counter.
              </li>
              {lateFeePerDay > 0 && (
                <li>
                  A <span className="font-medium text-foreground">late fee of {formatINR(lateFeePerDay)}/day</span>
                  {config?.lateFeeMax ? ` (up to ${formatINR(config.lateFeeMax)})` : ""} is added after
                  a fee's due date, so please pay on time.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Dues */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Fee Dues</h2>
          {invoices.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No fee records yet. Please check back soon.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {duesShown.map((inv) => {
                const overdue = isOverdue(inv);
                return (
                  <Card key={inv._id} className={overdue ? "border-rose-300" : ""}>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">
                          {inv.student?.name}{" "}
                          <span className="text-sm font-normal text-muted-foreground">
                            · {inv.periodLabel} · Class {inv.class}
                          </span>
                        </CardTitle>
                        {inv.dueDate && (
                          <p
                            className={`mt-1 flex items-center gap-1 text-xs ${
                              overdue ? "font-medium text-rose-600" : "text-muted-foreground"
                            }`}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            Due by {new Date(inv.dueDate).toLocaleDateString("en-IN")}
                            {overdue ? " · Overdue" : ""}
                          </p>
                        )}
                      </div>
                      <Badge status={inv.status} />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Line items */}
                      <div className="grid gap-1 text-sm sm:grid-cols-2">
                        {inv.items.map((it, i) => (
                          <div
                            key={i}
                            className="flex justify-between rounded-md border px-3 py-1.5"
                          >
                            <span>{it.name}</span>
                            <span>{formatINR(it.amount)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Breakdown */}
                      <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
                        <Row label="Subtotal" value={formatINR(inv.totalAmount)} />
                        {inv.discountAmount > 0 && (
                          <Row
                            label="Concession"
                            value={`− ${formatINR(inv.discountAmount)}`}
                            className="text-emerald-600"
                          />
                        )}
                        {inv.fineAmount > 0 && (
                          <Row label="Fine" value={`+ ${formatINR(inv.fineAmount)}`} className="text-rose-600" />
                        )}
                        {(inv.lateFee || 0) > 0 && (
                          <Row
                            label="Late fee (overdue)"
                            value={`+ ${formatINR(inv.lateFee!)}`}
                            className="text-rose-600"
                          />
                        )}
                        <Row label="Paid" value={`− ${formatINR(inv.paidAmount)}`} />
                        <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                          <span>Amount due</span>
                          <span className={inv.dueAmount > 0 ? "text-rose-600" : "text-emerald-600"}>
                            {formatINR(inv.dueAmount)}
                          </span>
                        </div>
                      </div>

                      {inv.dueAmount > 0 ? (
                        <div className="space-y-1">
                          <Button onClick={() => pay(inv)} disabled={paying === inv._id}>
                            <CreditCard className="h-4 w-4" />
                            {paying === inv._id
                              ? "Processing…"
                              : `Pay ${formatINR(inv.dueAmount)} online`}
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            + {formatINR(feeFor(inv.dueAmount))} convenience fee ({platformFeePct}%). Pay at the
                            counter to avoid it.
                          </p>
                        </div>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" /> Fully paid
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              <Pager
                page={safeDuesPage}
                pages={duesPages}
                total={invoices.length}
                pageSize={DUES_PER_PAGE}
                noun="fee records"
                onPage={setDuesPage}
              />
            </div>
          )}
        </section>

        {/* Results */}
        {results.some((r) => r.exams.length > 0) && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Award className="h-5 w-5 text-primary" /> Exam Results
            </h2>
            <div className="space-y-4">
              {results
                .filter((r) => r.exams.length > 0)
                .map((r) => {
                  const examsNewest = [...r.exams].reverse(); // freshest first
                  const pages = Math.max(1, Math.ceil(examsNewest.length / RESULTS_PER_EXAM_PAGE));
                  const page = Math.min(examPage[r.student._id] || 1, pages);
                  const shown = examsNewest.slice(
                    (page - 1) * RESULTS_PER_EXAM_PAGE,
                    page * RESULTS_PER_EXAM_PAGE
                  );
                  return (
                    <Card key={r.student._id}>
                      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {r.student.name}{" "}
                            <span className="text-sm font-normal text-muted-foreground">
                              · {classLabel(r.student.class)}
                              {r.student.section ? `-${r.student.section}` : ""} · {r.student.session}
                            </span>
                          </CardTitle>
                          {r.overall && r.overall.rank != null && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Overall rank{" "}
                              <span className="font-semibold text-foreground">
                                {r.overall.rank} of {r.overall.classSize}
                              </span>{" "}
                              · {r.overall.pct}%
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={() => navigate(`/portal/report-card/${r.student._id}`)}
                        >
                          <FileText className="h-4 w-4" /> Report card
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {shown.map((ex) => (
                          <div
                            key={ex.examId}
                            className="flex flex-col gap-2 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <span className="font-medium">{ex.name}</span>{" "}
                              <span className="text-xs text-muted-foreground">· {examTypeLabel(ex.type)}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="text-muted-foreground">
                                {ex.total}/{ex.maxTotal}
                              </span>
                              <span className={cn("font-semibold", ex.pct >= 33 ? "text-emerald-600" : "text-rose-600")}>
                                {ex.pct}%
                              </span>
                              {ex.rank != null && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  Rank {ex.rank}/{ex.classSize}
                                </span>
                              )}
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
                                {!ex.complete ? "Awaited" : ex.passed ? "Pass" : "Fail"}
                              </span>
                            </div>
                          </div>
                        ))}
                        <Pager
                          page={page}
                          pages={pages}
                          total={examsNewest.length}
                          pageSize={RESULTS_PER_EXAM_PAGE}
                          noun="exams"
                          onPage={(p) => setExamPage((prev) => ({ ...prev, [r.student._id]: p }))}
                        />
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </section>
        )}

        {/* Timetable + exam schedule */}
        <PortalTimetable />

        {/* History */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Receipt className="h-5 w-5 text-primary" /> Payment History
          </h2>
          {payments.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground">
                No payments yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <Card>
                <CardContent className="divide-y p-0">
                  {payShown.map((p) => (
                    <div key={p._id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{p.receiptNo}</p>
                        <p className="text-muted-foreground">
                          {p.student?.name} ·{" "}
                          {p.createdAt && new Date(p.createdAt).toLocaleDateString("en-IN")} ·{" "}
                          <span className="uppercase">{p.mode}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{formatINR(p.amount)}</span>
                        <button
                          onClick={() => window.open(`/receipt/${p._id}`, "_blank")}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Receipt
                        </button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Pager
                page={safePayPage}
                pages={payPages}
                total={payments.length}
                pageSize={PAYMENTS_PER_PAGE}
                noun="payments"
                onPage={setPayPage}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={className}>{value}</span>
    </div>
  );
}
