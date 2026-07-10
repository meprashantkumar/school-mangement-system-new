import { useEffect, useState } from "react";
import { CalendarPlus, Layers, Info, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { CLASSES, classLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const selectClass = "flex h-10 rounded-md border border-input bg-background px-3 text-sm";

interface Run {
  academicYear: string;
  period: string;
  periodLabel: string;
  class: string;
  structureName: string;
  count: number;
  totalNet: number;
  totalPaid: number;
  totalDue: number;
}

interface BulkResult {
  class: string;
  structureName: string;
  created: number;
  skipped: number;
  total: number;
}

export default function FeeGeneration() {
  const now = new Date();
  const [runs, setRuns] = useState<Run[]>([]);
  const [filters, setFilters] = useState({ session: "", class: "" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    dueDate: "",
  });
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const loadRuns = async () => {
    const { data } = await api.get("/invoices/summary");
    setRuns(data.runs);
  };

  useEffect(() => {
    loadRuns().catch(() => toast.error("Failed to load generated fees"));
  }, []);

  const sessions = [...new Set(runs.map((r) => r.academicYear))].sort().reverse();

  const shown = runs
    .filter((r) => (!filters.session || r.academicYear === filters.session))
    .filter((r) => (!filters.class || r.class === filters.class))
    .sort((a, b) =>
      a.period === b.period
        ? CLASSES.indexOf(a.class) - CLASSES.indexOf(b.class)
        : b.period.localeCompare(a.period)
    );

  const deleteRun = async (r: Run) => {
    if (
      !confirm(
        `Delete the generated fee for ${classLabel(r.class)} · ${r.periodLabel}?\n` +
          `This removes ${r.count} invoice(s). Invoices that already have payments are kept.`
      )
    )
      return;
    try {
      const { data } = await api.delete("/invoices/run", {
        params: { period: r.period, class: r.class, session: r.academicYear },
      });
      toast.success(data.message);
      await loadRuns();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  const generate = async () => {
    setGenerating(true);
    setResults(null);
    try {
      const { data } = await api.post("/invoices/generate-bulk", {
        month: Number(form.month),
        year: Number(form.year),
        dueDate: form.dueDate || undefined,
      });
      toast.success(data.message);
      setResults(data.results);
      await loadRuns();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fee Generation</h1>
          <p className="text-muted-foreground">
            Generate a month's fees for every class at once, and review what's been generated.
          </p>
        </div>
        <Button
          onClick={() => {
            setResults(null);
            setOpen(true);
          }}
        >
          <CalendarPlus className="h-4 w-4" /> Generate Monthly Fees
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Fees are generated from the fee structures you created in <strong>Fee Setup</strong> — each
          class is billed its own structure. Re-running a month is safe: a class already generated for
          that month is skipped, so a single month for a single class is never duplicated.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Layers className="h-5 w-5 text-primary" /> Generated Fees
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <select
              className={selectClass}
              value={filters.session}
              onChange={(e) => setFilters((f) => ({ ...f, session: e.target.value }))}
            >
              <option value="">All sessions</option>
              {sessions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Fee Structure</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No fees generated yet. Click "Generate Monthly Fees" to bill a month for all
                    classes.
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((r) => (
                  <TableRow key={`${r.period}-${r.class}-${r.structureName}`}>
                    <TableCell>{r.academicYear}</TableCell>
                    <TableCell className="font-medium">{r.periodLabel}</TableCell>
                    <TableCell>{classLabel(r.class)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.structureName}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{formatINR(r.totalNet)}</TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {formatINR(r.totalPaid)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-rose-600">
                      {formatINR(r.totalDue)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteRun(r)}
                        title="Delete this generated fee"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Bulk generate dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Monthly Fees — all classes</DialogTitle>
          </DialogHeader>

          {results ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {MONTHS[Number(form.month) - 1]} {form.year} — done. Breakdown per class:
              </p>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {results.map((r) => (
                  <div
                    key={r.class + r.structureName}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span>
                      {classLabel(r.class)}{" "}
                      <span className="text-muted-foreground">· {r.structureName}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {r.created > 0 ? (
                        <Badge status="active">+{r.created} new</Badge>
                      ) : (
                        <Badge status="inactive">already done</Badge>
                      )}
                      {r.skipped > 0 && r.created > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {r.skipped} skipped
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick the month to bill. Every class with a fee structure gets that month's invoice
                (optional services like Transport only for opted-in students).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Month</Label>
                  <select
                    className={`${selectClass} w-full`}
                    value={form.month}
                    onChange={(e) => setForm({ ...form, month: e.target.value })}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Year</Label>
                  <Input
                    type="number"
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Due date (optional)</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={generate} disabled={generating}>
                  {generating ? "Generating…" : "Generate for all classes"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
