import { useEffect, useState } from "react";
import { BellRing, IndianRupee, Search, ChevronLeft, ChevronRight, Ban } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { Invoice, Payment } from "@/types";
import { formatINR } from "@/lib/utils";
import { CLASSES, classLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const selectClass = "flex h-10 rounded-md border border-input bg-background px-3 text-sm";
const MODES = ["cash", "cheque", "upi", "online"];

interface CollectionData {
  payments: Payment[];
  summary: { total: number; count: number; byMode: Record<string, number> };
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export default function Reports() {
  const { user } = useAuth();
  const isSuper = user?.role === "superadmin";

  // Collection report (filtered + paginated)
  const [colFilters, setColFilters] = useState({ from: "", to: "", mode: "", search: "" });
  const [colPage, setColPage] = useState(1);
  const [colReload, setColReload] = useState(0);
  const [col, setCol] = useState<CollectionData | null>(null);

  // Defaulters (searchable, not paginated)
  const [defFilters, setDefFilters] = useState({ search: "", class: "" });
  const [defaulters, setDefaulters] = useState<Invoice[]>([]);
  const [reminding, setReminding] = useState(false);

  const loadCollection = async () => {
    const params: Record<string, string | number> = { page: colPage, limit: 30 };
    if (colFilters.from) params.from = colFilters.from;
    if (colFilters.to) params.to = colFilters.to;
    if (colFilters.mode) params.mode = colFilters.mode;
    if (colFilters.search) params.search = colFilters.search;
    const { data } = await api.get("/reports/collection", { params });
    setCol(data);
  };

  const loadDefaulters = async () => {
    const params: Record<string, string> = {};
    if (defFilters.search) params.search = defFilters.search;
    if (defFilters.class) params.class = defFilters.class;
    const { data } = await api.get("/reports/defaulters", { params });
    setDefaulters(data.defaulters);
  };

  useEffect(() => {
    loadCollection().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colPage, colReload]);

  // Defaulters filter as you type (debounced).
  useEffect(() => {
    const t = setTimeout(() => loadDefaulters().catch(() => {}), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defFilters]);

  const applyCollection = () => {
    setColPage(1);
    setColReload((k) => k + 1);
  };

  const voidPayment = async (p: Payment) => {
    const reason = window.prompt(
      `Void receipt ${p.receiptNo} (${formatINR(p.amount)})?\nThe amount is removed from the student's paid total. Enter a reason:`
    );
    if (reason === null) return;
    try {
      await api.post(`/payments/${p._id}/void`, { reason });
      toast.success("Payment voided");
      setColReload((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't void");
    }
  };

  const sendReminder = async (invoiceId: string) => {
    try {
      const { data } = await api.post(`/reports/reminder/${invoiceId}`);
      toast.success(data.message);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to send reminder");
    }
  };

  const remindAll = async () => {
    if (!confirm("Email a fee reminder to every defaulting parent who has an email on file?")) return;
    setReminding(true);
    try {
      const { data } = await api.post("/reports/remind-all");
      toast.success(data.message);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setReminding(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Collections and outstanding dues.</p>
      </div>

      {/* Collection report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <IndianRupee className="h-5 w-5 text-primary" /> Collection Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">From</label>
              <Input
                type="date"
                value={colFilters.from}
                onChange={(e) => setColFilters({ ...colFilters, from: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">To</label>
              <Input
                type="date"
                value={colFilters.to}
                onChange={(e) => setColFilters({ ...colFilters, to: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Mode</label>
              <select
                className={selectClass}
                value={colFilters.mode}
                onChange={(e) => setColFilters({ ...colFilters, mode: e.target.value })}
              >
                <option value="">All modes</option>
                {MODES.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-muted-foreground">Search</label>
              <div className="relative min-w-[180px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Student or receipt no"
                  value={colFilters.search}
                  onChange={(e) => setColFilters({ ...colFilters, search: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && applyCollection()}
                />
              </div>
            </div>
            <Button variant="outline" onClick={applyCollection}>
              Apply
            </Button>
          </div>

          {col?.summary && (
            <div className="flex flex-wrap gap-6 rounded-lg bg-muted/50 p-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total collected</p>
                <p className="text-xl font-bold">{formatINR(col.summary.total)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Transactions</p>
                <p className="text-xl font-bold">{col.summary.count}</p>
              </div>
              {Object.entries(col.summary.byMode).map(([mode, amt]) => (
                <div key={mode}>
                  <p className="capitalize text-muted-foreground">{mode}</p>
                  <p className="text-xl font-bold">{formatINR(amt)}</p>
                </div>
              ))}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {isSuper && <TableHead className="text-right">Void</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!col || col.payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isSuper ? 6 : 5} className="py-8 text-center text-muted-foreground">
                    No payments match.
                  </TableCell>
                </TableRow>
              ) : (
                col.payments.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="font-medium">{p.receiptNo}</TableCell>
                    <TableCell>{p.student?.name}</TableCell>
                    <TableCell className="capitalize">{p.mode}</TableCell>
                    <TableCell>
                      {p.createdAt && new Date(p.createdAt).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right">{formatINR(p.amount)}</TableCell>
                    {isSuper && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => voidPayment(p)}
                          title="Void this payment"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {col && col.total > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {col.total} payment(s) · showing {(col.page - 1) * col.limit + 1}–
                {Math.min(col.page * col.limit, col.total)}
              </span>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={col.page <= 1}
                  onClick={() => setColPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <span>
                  Page {col.page} of {col.pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={col.page >= col.pages}
                  onClick={() => setColPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Defaulters */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BellRing className="h-5 w-5 text-primary" /> Defaulters ({defaulters.length})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-52 pl-9"
                placeholder="Search student / parent"
                value={defFilters.search}
                onChange={(e) => setDefFilters({ ...defFilters, search: e.target.value })}
              />
            </div>
            <select
              className={selectClass}
              value={defFilters.class}
              onChange={(e) => setDefFilters({ ...defFilters, class: e.target.value })}
            >
              <option value="">All classes</option>
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {classLabel(c)}
                </option>
              ))}
            </select>
            {defaulters.length > 0 && (
              <Button size="sm" variant="outline" onClick={remindAll} disabled={reminding}>
                <BellRing className="h-4 w-4" /> {reminding ? "Sending…" : "Remind all"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {defaulters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No outstanding dues match. 🎉
                  </TableCell>
                </TableRow>
              ) : (
                defaulters.map((inv) => (
                  <TableRow key={inv._id}>
                    <TableCell className="font-medium">{inv.student?.name}</TableCell>
                    <TableCell>{classLabel(inv.class)}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.periodLabel}</TableCell>
                    <TableCell>{inv.student?.parentName || "-"}</TableCell>
                    <TableCell className="text-right font-medium text-rose-600">
                      {formatINR(inv.dueAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.student?.parentEmail ? (
                        <Button size="sm" variant="outline" onClick={() => sendReminder(inv._id)}>
                          <BellRing className="h-4 w-4" /> Remind
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">No parent email</span>
                      )}
                    </TableCell>
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
