import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  // CreditCard,          // ← online payment (disabled, see below)
  Receipt,
  Info,
  CalendarClock,
  CheckCircle2,
  Wallet,
  Award,
  FileText,
  ChevronDown,
} from "lucide-react";
// import toast from "react-hot-toast";   // ← only used by the payment flow
import api from "@/lib/api";
// import { payInvoiceOnline } from "@/lib/pay";

/* -----------------------------------------------------------------------------
 * ONLINE PAYMENT IS TURNED OFF IN THE PARENT PORTAL (school's decision).
 *
 * The payment gateway adds a 2.5% convenience fee on every online payment, and
 * the school doesn't want parents paying it — fees are collected at the office
 * instead (cash / cheque / the school's UPI QR, none of which carry a charge).
 *
 * Only the FRONTEND is switched off. The backend still has the Razorpay routes,
 * ONLINE_PLATFORM_FEE_PCT, and the ownership checks, so nothing needs
 * redeploying on the server side to bring this back.
 *
 * To re-enable: uncomment the three imports above, then the four blocks below
 * marked "ONLINE PAYMENT". They are the paying state, the fee helpers, the pay()
 * function, the "Good to know" bullets, and the Pay button.
 * -------------------------------------------------------------------------- */
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

/** Jump to a section, clearing the sticky header. */
const jumpTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function Portal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [results, setResults] = useState<PortalStudentResult[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  // ONLINE PAYMENT (1/5) — const [paying, setPaying] = useState<string | null>(null);
  const [hasTimetable, setHasTimetable] = useState(false);
  // The fee notes are worth a whole screen on a phone, so they start folded
  // there and stay open on the roomier desktop layout.
  const [notesOpen, setNotesOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );

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

  // ONLINE PAYMENT (2/5) — the convenience fee shown to parents.
  // const platformFeePct = config?.onlinePlatformFeePct ?? 2.5;
  // Convenience fee = a % of the amount paid, rounded up to the rupee — must match
  // the server's platformFeeFor() so the amount shown is exactly what's charged.
  // const feeFor = (amount: number) => Math.ceil((amount * platformFeePct) / 100);
  const lateFeePerDay = config?.lateFeePerDay ?? 0;
  const schoolName = config?.schoolName || "School";

  const totalDue = invoices.reduce((s, i) => s + (i.dueAmount || 0), 0);
  const isOverdue = (inv: Invoice) =>
    inv.dueAmount > 0 && !!inv.dueDate && new Date(inv.dueDate) < new Date();

  // ONLINE PAYMENT (3/5) — opens Razorpay checkout for one invoice.
  // const pay = async (inv: Invoice) => {
  //   setPaying(inv._id);
  //   try {
  //     await payInvoiceOnline(inv._id, inv.dueAmount, {
  //       name: user?.name,
  //       email: user?.email,
  //       phone: user?.phone,
  //     });
  //     toast.success("Payment successful");
  //     await load();
  //   } catch (err: any) {
  //     toast.error(err?.message || "Payment failed");
  //   } finally {
  //     setPaying(null);
  //   }
  // };

  const duesPages = Math.max(1, Math.ceil(invoices.length / DUES_PER_PAGE));
  const safeDuesPage = Math.min(duesPage, duesPages);
  const duesShown = invoices.slice((safeDuesPage - 1) * DUES_PER_PAGE, safeDuesPage * DUES_PER_PAGE);

  const payPages = Math.max(1, Math.ceil(payments.length / PAYMENTS_PER_PAGE));
  const safePayPage = Math.min(payPage, payPages);
  const payShown = payments.slice((safePayPage - 1) * PAYMENTS_PER_PAGE, safePayPage * PAYMENTS_PER_PAGE);

  const hasResults = results.some((r) => r.exams.length > 0);
  // Shortcuts so a phone user doesn't have to scroll past everything to reach
  // their payment history.
  const jumps = [
    { id: "dues", label: "Fees" },
    ...(hasResults ? [{ id: "results", label: "Results" }] : []),
    ...(hasTimetable ? [{ id: "timetable", label: "Timetable" }] : []),
    ...(payments.length ? [{ id: "history", label: "Receipts" }] : []),
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5 font-semibold">
          <Crest size="sm" />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-heading">{schoolName}</div>
            <div className="text-xs font-normal text-muted-foreground">Parent Portal</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">Hi, {user?.name}</span>
          {/* Icon-only on phones so a long school name still fits. */}
          <Button variant="outline" size="sm" onClick={logout} aria-label="Logout" className="h-10 px-3">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 p-3 pb-20 sm:space-y-6 sm:p-6">
        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          <Card className="border-0 bg-gradient-to-br from-primary to-brand-blue text-white sm:col-span-2">
            <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-6">
              <div className="min-w-0">
                <p className="text-sm text-white/80">Total amount due</p>
                <p className="mt-1 text-2xl font-bold sm:text-3xl">{formatINR(totalDue)}</p>
                <p className="mt-1 text-xs text-white/80 sm:text-sm">
                  {totalDue > 0
                    ? "Please clear the dues to avoid late fees."
                    : "You're all caught up. Thank you!"}
                </p>
              </div>
              <Wallet className="h-10 w-10 shrink-0 text-white/40 sm:h-12 sm:w-12" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex h-full flex-row items-center justify-between gap-3 p-4 sm:flex-col sm:items-start sm:justify-center sm:p-6">
              <div>
                <p className="text-sm text-muted-foreground">Children</p>
                <p className="mt-0.5 text-2xl font-bold sm:mt-1 sm:text-3xl">
                  {new Set(invoices.map((i) => i.student?._id)).size || "—"}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{invoices.length} fee record(s)</p>
            </CardContent>
          </Card>
        </div>

        {/* Section shortcuts (phones only — desktop shows everything at once) */}
        {jumps.length > 1 && (
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 sm:hidden">
            {jumps.map((j) => (
              <button
                key={j.id}
                onClick={() => jumpTo(j.id)}
                className="h-10 shrink-0 touch-manipulation rounded-full border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                {j.label}
              </button>
            ))}
          </div>
        )}

        {/* Good to know */}
        <Card className="border-primary/20 bg-primary/5">
          <button
            onClick={() => setNotesOpen((o) => !o)}
            aria-expanded={notesOpen}
            className="flex w-full touch-manipulation items-center justify-between gap-2 p-4 text-left text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-primary" /> Good to know
            </span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", notesOpen && "rotate-180")}
            />
          </button>
          {notesOpen && (
            <CardContent className="p-4 pt-0 text-sm">
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Fees are paid at the school office</span>{" "}
                  — by cash, cheque, or by scanning the school's UPI QR at the fee counter. A receipt
                  is issued there and appears in your payment history below.
                </li>
                {/* ONLINE PAYMENT (4/5) — the two bullets explaining the convenience fee.
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
                */}
                {lateFeePerDay > 0 && (
                  <li>
                    A{" "}
                    <span className="font-medium text-foreground">
                      late fee of {formatINR(lateFeePerDay)}/day
                    </span>
                    {config?.lateFeeMax ? ` (up to ${formatINR(config.lateFeeMax)})` : ""} is added
                    after a fee's due date, so please pay on time.
                  </li>
                )}
              </ul>
            </CardContent>
          )}
        </Card>

        {/* Dues */}
        <section id="dues" className="scroll-mt-20">
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
                    <CardHeader className="flex flex-row items-start justify-between gap-3 p-4 pb-3 sm:p-6 sm:pb-4">
                      <div className="min-w-0">
                        {/* Name and period on separate lines — as one sentence they
                            wrap into an unreadable block on a narrow screen. */}
                        <CardTitle className="truncate text-base">{inv.student?.name}</CardTitle>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {inv.periodLabel} · Class {inv.class}
                        </p>
                        {inv.dueDate && (
                          <p
                            className={`mt-1 flex items-center gap-1 text-xs ${
                              overdue ? "font-medium text-rose-600" : "text-muted-foreground"
                            }`}
                          >
                            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                            Due by {new Date(inv.dueDate).toLocaleDateString("en-IN")}
                            {overdue ? " · Overdue" : ""}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <Badge status={inv.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
                      {/* Line items */}
                      <div className="grid gap-1 text-sm sm:grid-cols-2">
                        {inv.items.map((it, i) => (
                          <div
                            key={i}
                            className="flex justify-between gap-2 rounded-md border px-3 py-1.5"
                          >
                            <span className="min-w-0 truncate">{it.name}</span>
                            <span className="shrink-0">{formatINR(it.amount)}</span>
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
                        /* ONLINE PAYMENT (5/5) — the Pay button. Replaced with a line
                           pointing parents at the fee counter so the card isn't a
                           dead end. Delete this <p> when re-enabling the block below. */
                        <p className="flex items-start gap-1.5 rounded-md bg-muted/40 p-2.5 text-sm text-muted-foreground">
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>
                            Please pay <span className="font-medium text-foreground">{formatINR(inv.dueAmount)}</span>{" "}
                            at the school fee counter — cash, cheque, or scan the school's UPI QR.
                          </span>
                        </p>
                        /* The original Pay button, kept for when the school wants it back:
                        <div className="space-y-1.5">
                          <Button
                            onClick={() => pay(inv)}
                            disabled={paying === inv._id}
                            className="h-11 w-full touch-manipulation sm:w-auto"
                          >
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
                        */
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
        {hasResults && (
          <section id="results" className="scroll-mt-20">
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
                      <CardHeader className="flex flex-col gap-3 p-4 pb-3 sm:flex-row sm:items-start sm:justify-between sm:p-6 sm:pb-4">
                        <div className="min-w-0">
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
                          className="h-11 w-full touch-manipulation sm:h-9 sm:w-auto"
                          onClick={() => navigate(`/portal/report-card/${r.student._id}`)}
                        >
                          <FileText className="h-4 w-4" /> Report card
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
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
        <PortalTimetable onContent={setHasTimetable} />

        {/* History */}
        <section id="history" className="scroll-mt-20">
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
                    <div
                      key={p._id}
                      className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{p.receiptNo}</p>
                        <p className="text-muted-foreground">
                          {p.student?.name} ·{" "}
                          {p.createdAt && new Date(p.createdAt).toLocaleDateString("en-IN")} ·{" "}
                          <span className="uppercase">{p.mode}</span>
                        </p>
                      </div>
                      {/* Amount and receipt sit on their own row on a phone, where
                          squeezing them next to the details left both unreadable. */}
                      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                        <span className="font-semibold">{formatINR(p.amount)}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 touch-manipulation"
                          onClick={() => window.open(`/receipt/${p._id}`, "_blank")}
                        >
                          <Receipt className="h-3.5 w-3.5" /> Receipt
                        </Button>
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
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("shrink-0", className)}>{value}</span>
    </div>
  );
}
