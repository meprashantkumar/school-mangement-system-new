import { useEffect, useState } from "react";
import {
  Search,
  Wallet,
  Percent,
  AlertTriangle,
  Printer,
  X,
  ArrowLeft,
  Coins,
  Check,
  Ban,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { AppConfig, Invoice, Payment, Student } from "@/types";
import { formatINR } from "@/lib/utils";
import { CLASSES, SECTIONS, classLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const selectClass = "flex h-10 rounded-md border border-input bg-background px-3 text-sm";

export default function Collect() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [filters, setFilters] = useState({ search: "", class: "", section: "", parentName: "" });
  const [results, setResults] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creditBalance, setCreditBalance] = useState(0);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingCheques, setPendingCheques] = useState<Payment[]>([]);

  // Pay dialog: payInvoice=null means "collect across all dues" (lump-sum/advance);
  // a specific invoice means "pay this month".
  const [payOpen, setPayOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", mode: "cash", reference: "", note: "" });

  const [concessionFor, setConcessionFor] = useState<Invoice | null>(null);
  const [concessionForm, setConcessionForm] = useState({ reason: "", amount: "" });
  const [fineFor, setFineFor] = useState<Invoice | null>(null);
  const [fineAmount, setFineAmount] = useState("");
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/config").then(({ data }) => setConfig(data)).catch(() => {});
  }, []);

  const runSearch = async () => {
    const params: Record<string, string> = {};
    if (filters.search) params.search = filters.search;
    if (filters.class) params.class = filters.class;
    if (filters.section) params.section = filters.section;
    if (filters.parentName) params.parentName = filters.parentName;
    // Nothing to search on -> show no results (don't dump the whole roster).
    if (Object.keys(params).length === 0) {
      setResults([]);
      return;
    }
    try {
      const { data } = await api.get("/students", { params });
      setResults(data.students);
    } catch {
      /* ignore transient errors while typing */
    }
  };

  // Auto-filter as you type / change a dropdown (debounced) — no need to click search.
  useEffect(() => {
    const t = setTimeout(runSearch, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // All of a student's (non-voided) receipts, so any of them can be reprinted;
  // pending cheques are derived from the same list.
  const loadPayments = async (id: string) => {
    try {
      const { data } = await api.get("/payments", { params: { student: id } });
      const list: Payment[] = data.payments || [];
      setPayments(list);
      setPendingCheques(
        list.filter((p) => p.mode === "cheque" && p.chequeStatus === "pending" && !p.voided)
      );
    } catch {
      setPayments([]);
      setPendingCheques([]);
    }
  };

  const loadAccount = async (id: string) => {
    const { data } = await api.get(`/invoices/student/${id}`);
    setInvoices(data.invoices);
    setCreditBalance(data.creditBalance || 0);
    loadPayments(id);
  };

  const selectStudent = async (s: Student) => {
    setSelected(s);
    setResults([]);
    await loadAccount(s._id);
  };

  const refresh = async () => {
    if (selected) await loadAccount(selected._id);
  };

  // Go back to the search list without having to retype the filters.
  const backToSearch = () => {
    setSelected(null);
    setInvoices([]);
    setCreditBalance(0);
    setPayments([]);
    setPendingCheques([]);
    runSearch();
  };

  const outstanding = invoices.reduce((s, i) => s + i.dueAmount, 0);

  const openCollect = () => {
    setPayInvoice(null);
    setPayForm({ amount: outstanding ? String(outstanding) : "", mode: "cash", reference: "", note: "" });
    setPayOpen(true);
  };

  const openPayInvoice = (inv: Invoice) => {
    setPayInvoice(inv);
    setPayForm({ amount: String(inv.dueAmount), mode: "cash", reference: "", note: "" });
    setPayOpen(true);
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const { data } = await api.post("/payments/collect", {
        studentId: selected._id,
        invoiceId: payInvoice?._id, // omit -> distribute across all dues
        amount: Number(payForm.amount),
        mode: payForm.mode,
        reference: payForm.reference,
        note: payForm.note,
      });
      toast.success(data.message || "Payment recorded");
      setPayOpen(false);
      setReceipt(data.payment);
      setInvoices(data.invoices);
      setCreditBalance(data.creditBalance ?? creditBalance);
      loadPayments(selected._id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const applyCreditNow = async () => {
    if (!selected || creditBalance <= 0) return;
    if (!confirm(`Apply ${formatINR(creditBalance)} advance credit to this student's dues?`)) return;
    try {
      const { data } = await api.post("/payments/apply-credit", { studentId: selected._id });
      toast.success(data.message);
      setInvoices(data.invoices);
      setCreditBalance(data.creditBalance ?? 0);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const setChequeStatus = async (id: string, status: "cleared" | "bounced") => {
    if (
      status === "bounced" &&
      !confirm("Mark this cheque as BOUNCED? It reverses the credit it gave and voids the payment.")
    )
      return;
    try {
      await api.patch(`/payments/${id}/cheque`, { status });
      toast.success(`Cheque marked ${status}`);
      await refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const applyConcession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concessionFor) return;
    setBusy(true);
    try {
      await api.post(`/invoices/${concessionFor._id}/concession`, {
        reason: concessionForm.reason,
        amount: Number(concessionForm.amount),
      });
      toast.success("Concession applied");
      setConcessionFor(null);
      setConcessionForm({ reason: "", amount: "" });
      await refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const removeConcession = async (inv: Invoice, index: number) => {
    if (!confirm("Remove this concession? The amount goes back onto the student's dues.")) return;
    try {
      await api.delete(`/invoices/${inv._id}/concession/${index}`);
      toast.success("Concession removed");
      await refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const applyFine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fineFor) return;
    setBusy(true);
    try {
      await api.post(`/invoices/${fineFor._id}/fine`, { amount: Number(fineAmount) });
      toast.success("Fine updated");
      setFineFor(null);
      setFineAmount("");
      await refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const upiString =
    config?.upiVpa && payForm.amount
      ? `upi://pay?pa=${config.upiVpa}&pn=${encodeURIComponent(
          config.upiName
        )}&am=${payForm.amount}&cu=INR&tn=${encodeURIComponent("School Fee")}`
      : "";

  const maxConcession = concessionFor ? concessionFor.netAmount : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Collect Fee</h1>
        <p className="text-muted-foreground">Search a student and record a payment.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Type to search: name / admission no / phone"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <select
          className={`${selectClass} w-auto`}
          value={filters.class}
          onChange={(e) => setFilters((f) => ({ ...f, class: e.target.value }))}
        >
          <option value="">All classes</option>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {classLabel(c)}
            </option>
          ))}
        </select>
        <select
          className={`${selectClass} w-auto`}
          value={filters.section}
          onChange={(e) => setFilters((f) => ({ ...f, section: e.target.value }))}
        >
          <option value="">All sections</option>
          {SECTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          className="w-auto max-w-[180px]"
          placeholder="Father / parent name"
          value={filters.parentName}
          onChange={(e) => setFilters((f) => ({ ...f, parentName: e.target.value }))}
        />
      </form>

      {results.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {results.map((s) => (
              <button
                key={s._id}
                onClick={() => selectStudent(s)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent"
              >
                <span>
                  <span className="font-medium">{s.name}</span>
                  {s.parentName && (
                    <span className="block text-xs text-muted-foreground">
                      Parent: {s.parentName}
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {s.admissionNo} · {classLabel(s.class)}
                  {s.section ? `-${s.section}` : ""}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {selected && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={backToSearch}>
            <ArrowLeft className="h-4 w-4" /> Back to search
          </Button>

          {/* Account summary + collect */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {selected.name}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {selected.admissionNo} · Class {selected.class}
                  {selected.section ? `-${selected.section}` : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">Total outstanding</p>
                  <p className="text-xl font-bold">{formatINR(outstanding)}</p>
                </div>
                {creditBalance > 0 && (
                  <div>
                    <p className="text-muted-foreground">Advance credit</p>
                    <p className="text-xl font-bold text-emerald-600">{formatINR(creditBalance)}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {creditBalance > 0 && outstanding > 0 && (
                  <Button variant="outline" onClick={applyCreditNow}>
                    <Coins className="h-4 w-4" /> Apply credit to dues
                  </Button>
                )}
                <Button onClick={openCollect}>
                  <Wallet className="h-4 w-4" /> Collect payment
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Pending cheques awaiting clearance */}
          {pendingCheques.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cheques awaiting clearance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingCheques.map((c) => (
                  <div
                    key={c._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span>
                      {c.receiptNo} · {formatINR(c.amount)}
                      {c.reference ? ` · Cheque ${c.reference}` : ""}
                      <Badge status="partial" className="ml-2">
                        pending
                      </Badge>
                    </span>
                    <span className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setChequeStatus(c._id, "cleared")}>
                        <Check className="h-4 w-4" /> Cleared
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setChequeStatus(c._id, "bounced")}
                      >
                        <Ban className="h-4 w-4" /> Bounced
                      </Button>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {invoices.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No invoices for this student yet. Generate them from Fee Setup.
            </p>
          )}

          {invoices.map((inv) => (
            <Card key={inv._id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">
                    {inv.periodLabel} · Class {inv.class}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Total {formatINR(inv.netAmount)} · Paid {formatINR(inv.paidAmount)} ·{" "}
                    <span className="font-medium text-foreground">
                      Due {formatINR(inv.dueAmount)}
                    </span>
                    {inv.dueDate && (
                      <> · due {new Date(inv.dueDate).toLocaleDateString("en-IN")}</>
                    )}
                  </p>
                </div>
                <Badge status={inv.status} />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-1 text-sm sm:grid-cols-2">
                  {inv.items.map((it, i) => (
                    <div key={i} className="flex justify-between rounded-md border px-3 py-1.5">
                      <span>{it.name}</span>
                      <span>{formatINR(it.amount)}</span>
                    </div>
                  ))}
                </div>

                {inv.concessions && inv.concessions.length > 0 && (
                  <div className="space-y-1 text-sm">
                    {inv.concessions.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-1.5 text-emerald-700"
                      >
                        <span>
                          Concession: {formatINR(c.amount)}
                          {c.reason ? ` · ${c.reason}` : ""}
                        </span>
                        <button
                          onClick={() => removeConcession(inv, i)}
                          className="text-emerald-700/70 hover:text-rose-600"
                          title="Remove this concession"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {(inv.fineAmount > 0 || (inv.lateFee || 0) > 0) && (
                  <p className="text-sm text-muted-foreground">
                    {inv.fineAmount > 0 && `Fine: ${formatINR(inv.fineAmount)}  `}
                    {(inv.lateFee || 0) > 0 && (
                      <span className="text-rose-600">Late fee: {formatINR(inv.lateFee!)}</span>
                    )}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={inv.dueAmount <= 0}
                    onClick={() => openPayInvoice(inv)}
                  >
                    <Wallet className="h-4 w-4" /> Pay this month
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConcessionFor(inv)}>
                    <Percent className="h-4 w-4" /> Concession
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFineFor(inv);
                      setFineAmount(String(inv.fineAmount || ""));
                    }}
                  >
                    <AlertTriangle className="h-4 w-4" /> Fine
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Receipts — reprint any past payment without leaving this page */}
          {payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receipts / payment history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {payments.map((p) => (
                  <div
                    key={p._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{p.receiptNo}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {formatINR(p.amount)} · {p.mode.toUpperCase()}
                        {p.createdAt
                          ? ` · ${new Date(p.createdAt).toLocaleDateString("en-IN")}`
                          : ""}
                      </span>
                      {p.mode === "cheque" && p.chequeStatus && (
                        <Badge
                          status={
                            p.chequeStatus === "cleared"
                              ? "paid"
                              : p.chequeStatus === "bounced"
                              ? "unpaid"
                              : "partial"
                          }
                          className="ml-2"
                        >
                          {p.chequeStatus}
                        </Badge>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/receipt/${p._id}`, "_blank")}
                    >
                      <Printer className="h-4 w-4" /> Print receipt
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Record payment dialog (student-level collect OR a specific month) */}
      <Dialog open={payOpen} onOpenChange={(o) => !o && setPayOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {payInvoice ? `Pay — ${payInvoice.periodLabel}` : "Collect Payment"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={recordPayment} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                {payInvoice
                  ? "Extra beyond this month's due is saved as advance credit."
                  : `Spread across dues oldest-first (outstanding ${formatINR(
                      outstanding
                    )}). Anything extra is saved as advance credit for future months.`}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={payForm.mode}
                onChange={(e) => setPayForm({ ...payForm, mode: e.target.value })}
              >
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="upi">UPI (scan QR)</option>
              </select>
            </div>

            {payForm.mode === "cheque" && (
              <div className="space-y-1.5">
                <Label>Cheque number</Label>
                <Input
                  value={payForm.reference}
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                  placeholder="e.g. 100245"
                />
                <p className="text-xs text-muted-foreground">
                  Recorded as pending — mark it cleared or bounced later.
                </p>
              </div>
            )}

            {payForm.mode === "upi" && (
              <>
                <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4">
                  {config?.upiVpa && upiString ? (
                    <>
                      <QRCodeSVG value={upiString} size={160} />
                      <p className="text-sm text-muted-foreground">
                        Ask the parent to scan &amp; pay {formatINR(Number(payForm.amount))} to{" "}
                        <span className="font-medium">{config.upiVpa}</span>, then record it.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Set SCHOOL_UPI_VPA in the server .env to show a scannable QR.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>UPI reference / UTR (optional)</Label>
                  <Input
                    value={payForm.reference}
                    onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                    placeholder="12-digit UTR from the parent's app"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                value={payForm.note}
                onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Record & Get Receipt"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Concession dialog */}
      <Dialog open={!!concessionFor} onOpenChange={(o) => !o && setConcessionFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Concession / Discount</DialogTitle>
          </DialogHeader>
          <form onSubmit={applyConcession} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Input
                value={concessionForm.reason}
                onChange={(e) => setConcessionForm({ ...concessionForm, reason: e.target.value })}
                placeholder="Sibling discount, scholarship..."
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                max={maxConcession}
                value={concessionForm.amount}
                onChange={(e) => setConcessionForm({ ...concessionForm, amount: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Max {formatINR(maxConcession)} (can't discount more than what's billable).
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Applying..." : "Apply"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Fine dialog */}
      <Dialog open={!!fineFor} onOpenChange={(o) => !o && setFineFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Late Fine</DialogTitle>
          </DialogHeader>
          <form onSubmit={applyFine} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Fine amount (0 to waive)</Label>
              <Input
                type="number"
                value={fineAmount}
                onChange={(e) => setFineAmount(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          {receipt && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Receipt No</span>
                <span className="font-medium">{receipt.receiptNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student</span>
                <span className="font-medium">{selected?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{formatINR(receipt.amount)}</span>
              </div>
              {!!receipt.creditAdded && receipt.creditAdded > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Saved as advance credit</span>
                  <span className="font-medium">{formatINR(receipt.creditAdded)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium uppercase">{receipt.mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {receipt.createdAt && new Date(receipt.createdAt).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => receipt && window.open(`/receipt/${receipt._id}`, "_blank")}
            >
              <Printer className="h-4 w-4" /> Open Receipt / Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
