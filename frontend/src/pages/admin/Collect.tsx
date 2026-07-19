import { useEffect, useState } from "react";
import { Search, Wallet, Percent, AlertTriangle, Printer, X, ArrowLeft } from "lucide-react";
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

  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", mode: "cash", note: "" });
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

  const selectStudent = async (s: Student) => {
    setSelected(s);
    setResults([]);
    const { data } = await api.get(`/invoices/student/${s._id}`);
    setInvoices(data.invoices);
  };

  const refresh = async () => {
    if (!selected) return;
    const { data } = await api.get(`/invoices/student/${selected._id}`);
    setInvoices(data.invoices);
  };

  // Go back to the search list without having to retype the filters.
  const backToSearch = () => {
    setSelected(null);
    setInvoices([]);
    runSearch(); // restore the results for the filters still in the search box
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payFor) return;
    setBusy(true);
    try {
      const { data } = await api.post("/payments/counter", {
        invoiceId: payFor._id,
        amount: Number(payForm.amount),
        mode: payForm.mode,
        note: payForm.note,
      });
      toast.success("Payment recorded");
      setPayFor(null);
      setReceipt(data.payment);
      await refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setBusy(false);
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
          </Card>

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
                    disabled={inv.dueAmount <= 0}
                    onClick={() => {
                      setPayFor(inv);
                      setPayForm({ amount: String(inv.dueAmount), mode: "cash", note: "" });
                    }}
                  >
                    <Wallet className="h-4 w-4" /> Record Payment
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
        </div>
      )}

      {/* Record payment dialog */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
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

            {payForm.mode === "upi" && (
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
                value={concessionForm.amount}
                onChange={(e) => setConcessionForm({ ...concessionForm, amount: e.target.value })}
                required
              />
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
