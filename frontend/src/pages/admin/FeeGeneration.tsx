import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Layers, Info, Trash2, Undo2, AlertTriangle } from "lucide-react";
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

interface StructureLite {
  class: string;
  name: string;
  items: { name: string; optional?: boolean }[];
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
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoPeriod, setUndoPeriod] = useState("");
  const [undoing, setUndoing] = useState(false);
  // Which classes to bill, and which fees to leave out. Tracking the EXCLUDED fees
  // (rather than the included ones) keeps the ticks stable when the class selection
  // changes and the available fee list is recomputed.
  const [structures, setStructures] = useState<StructureLite[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [excludedFees, setExcludedFees] = useState<string[]>([]);

  const loadRuns = async () => {
    const { data } = await api.get("/invoices/summary");
    setRuns(data.runs);
  };

  // The class and fee menus come from the structures themselves, so they always
  // match what can actually be billed (a class with no structure isn't offered,
  // and neither is a fee head that exists nowhere).
  const loadStructures = async () => {
    const { data } = await api.get("/fees/structures");
    const list: StructureLite[] = (data.structures || []).map((s: any) => ({
      class: String(s.class || "").trim(),
      name: s.name || "—",
      items: (s.items || []).map((i: any) => ({
        name: String(i.name || "").trim(),
        optional: !!i.optional,
      })),
    }));
    setStructures(list);
    setSelectedClasses([...new Set(list.map((s) => s.class))]); // default: every class
  };

  useEffect(() => {
    loadRuns().catch(() => toast.error("Failed to load generated fees"));
    loadStructures().catch(() => {});
  }, []);

  // Classes that can be billed, in ladder order, with their structure name.
  const classChoices = useMemo(() => {
    const byClass = new Map<string, string[]>();
    structures.forEach((s) => {
      if (!s.class) return;
      byClass.set(s.class, [...(byClass.get(s.class) || []), s.name]);
    });
    return [...byClass.entries()]
      .map(([cls, names]) => ({ cls, structureName: names.join(" + ") }))
      .sort((a, b) => CLASSES.indexOf(a.cls) - CLASSES.indexOf(b.cls));
  }, [structures]);

  // Classes with students but no structure would be silently left unbilled.
  const classesWithoutStructure = useMemo(
    () => CLASSES.filter((c) => !classChoices.some((x) => x.cls === c)),
    [classChoices]
  );

  // Only the fees that appear in the SELECTED classes' structures — picking Class 2
  // alone shouldn't offer a fee head that only Class 9 has.
  const feeOptions = useMemo(() => {
    const seen = new Map<string, boolean>();
    structures
      .filter((s) => selectedClasses.includes(s.class))
      .forEach((s) =>
        s.items.forEach((i) => {
          if (!i.name) return;
          // If a fee is optional anywhere, treat it as an opt-in service.
          seen.set(i.name, (seen.get(i.name) || false) || !!i.optional);
        })
      );
    return [...seen.entries()].map(([name, optional]) => ({ name, optional }));
  }, [structures, selectedClasses]);

  const includeItems = feeOptions.map((o) => o.name).filter((n) => !excludedFees.includes(n));

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

  // Generated months rolled up across classes (for the whole-month undo picker).
  const months = Object.values(
    runs.reduce(
      (acc, r) => {
        const m = (acc[r.period] ??= {
          period: r.period,
          periodLabel: r.periodLabel,
          invoices: 0,
          classes: 0,
          totalNet: 0,
          totalPaid: 0,
        });
        m.invoices += r.count;
        m.classes += 1;
        m.totalNet += r.totalNet;
        m.totalPaid += r.totalPaid;
        return acc;
      },
      {} as Record<
        string,
        { period: string; periodLabel: string; invoices: number; classes: number; totalNet: number; totalPaid: number }
      >
    )
  ).sort((a, b) => b.period.localeCompare(a.period));

  const selectedMonth = months.find((m) => m.period === undoPeriod);

  const undoMonth = async () => {
    if (!selectedMonth) return toast.error("Pick a month to undo");
    setUndoing(true);
    try {
      const { data } = await api.delete("/invoices/run", {
        params: { period: selectedMonth.period },
      });
      toast.success(data.message);
      setUndoOpen(false);
      await loadRuns();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Undo failed");
    } finally {
      setUndoing(false);
    }
  };

  const toggleFee = (name: string) =>
    setExcludedFees((list) =>
      list.includes(name) ? list.filter((n) => n !== name) : [...list, name]
    );

  const toggleClass = (cls: string) =>
    setSelectedClasses((list) =>
      list.includes(cls) ? list.filter((c) => c !== cls) : [...list, cls]
    );

  // Which of the picked classes are ALREADY billed for the picked month. One invoice
  // per student per month is the rule, so those classes would simply be skipped —
  // worth saying up front rather than letting the result screen explain it.
  const targetPeriod = `${form.year}-${String(Number(form.month)).padStart(2, "0")}`;
  const alreadyBilled = useMemo(() => {
    const byClass = new Map<string, number>();
    runs
      .filter((r) => r.period === targetPeriod && selectedClasses.includes(r.class))
      .forEach((r) => byClass.set(r.class, (byClass.get(r.class) || 0) + r.count));
    return [...byClass.entries()]
      .map(([cls, count]) => ({ cls, count }))
      .sort((a, b) => CLASSES.indexOf(a.cls) - CLASSES.indexOf(b.cls));
  }, [runs, targetPeriod, selectedClasses]);

  const generate = async () => {
    if (selectedClasses.length === 0) {
      return toast.error("Tick at least one class to generate for");
    }
    if (feeOptions.length > 0 && includeItems.length === 0) {
      return toast.error("Tick at least one fee to include this month");
    }
    setGenerating(true);
    setResults(null);
    try {
      const { data } = await api.post("/invoices/generate-bulk", {
        month: Number(form.month),
        year: Number(form.year),
        dueDate: form.dueDate || undefined,
        classes: selectedClasses,
        includeItems: feeOptions.length > 0 ? includeItems : undefined,
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
            Generate a month's fees for every class — or just the classes you pick — and review
            what's been generated.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={months.length === 0}
            onClick={() => {
              setUndoPeriod(months[0]?.period || "");
              setUndoOpen(true);
            }}
          >
            <Undo2 className="h-4 w-4" /> Undo a Month
          </Button>
          <Button
            onClick={() => {
              setResults(null);
              setOpen(true);
            }}
          >
            <CalendarPlus className="h-4 w-4" /> Generate Monthly Fees
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Fees are generated from the fee structures you created in <strong>Fee Setup</strong> — each
          class is billed its own structure. You can tick <strong>which classes</strong> and{" "}
          <strong>which fees</strong> to bill, so a charge that applies to only some classes (an exam
          fee in a month when only one class sits an exam) goes to those classes alone. Re-running a
          month is safe: a student already billed for that month is skipped, so nobody is ever charged
          twice. Generated a month by mistake? Use <strong>Undo a Month</strong> (or the row's delete
          button for a single class) — invoices that already have payments are always kept.
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

      {/* Undo a whole month */}
      <Dialog open={undoOpen} onOpenChange={setUndoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo a month's fee generation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Removes every invoice generated for the chosen month — all classes at once. Invoices
              that already have a payment, concession or fine are <strong>kept</strong>, so collected
              money and receipts are never lost.
            </p>
            <div className="space-y-1.5">
              <Label>Month to undo</Label>
              <select
                className={`${selectClass} w-full`}
                value={undoPeriod}
                onChange={(e) => setUndoPeriod(e.target.value)}
              >
                {months.map((m) => (
                  <option key={m.period} value={m.period}>
                    {m.periodLabel} — {m.invoices} invoice(s) across {m.classes} class(es)
                  </option>
                ))}
              </select>
            </div>
            {selectedMonth && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>{selectedMonth.periodLabel}</strong>: {selectedMonth.invoices} invoice(s),{" "}
                  {formatINR(selectedMonth.totalNet)} billed
                  {selectedMonth.totalPaid > 0 && (
                    <>
                      {" "}
                      — {formatINR(selectedMonth.totalPaid)} already collected; those invoices will
                      be kept
                    </>
                  )}
                  . You can re-generate the month afterwards.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setUndoOpen(false)} disabled={undoing}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={undoMonth} disabled={undoing || !selectedMonth}>
                <Undo2 className="h-4 w-4" />
                {undoing ? "Undoing…" : "Undo this month"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk generate dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate Monthly Fees</DialogTitle>
          </DialogHeader>

          {results ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {MONTHS[Number(form.month) - 1]} {form.year} — done
                {feeOptions.length > 0 && includeItems.length < feeOptions.length && (
                  <>
                    {" "}
                    (billed: <b>{includeItems.join(", ")}</b>)
                  </>
                )}
                . Breakdown per class:
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
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              <p className="text-sm text-muted-foreground">
                Pick the month, the classes to bill, and which fees to include (optional services
                like Transport only go to opted-in students).
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

              {/* Which classes to bill */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    Classes to bill{" "}
                    <span className="font-normal text-muted-foreground">
                      ({selectedClasses.length} of {classChoices.length})
                    </span>
                  </Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedClasses(classChoices.map((c) => c.cls))}
                    >
                      All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedClasses([])}
                    >
                      None
                    </Button>
                  </div>
                </div>
                {classChoices.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                    No fee structures yet — create them in <b>Fee Setup</b> first.
                  </p>
                ) : (
                  <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-3">
                    {classChoices.map((c) => (
                      <label
                        key={c.cls}
                        title={c.structureName}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          className="shrink-0"
                          checked={selectedClasses.includes(c.cls)}
                          onChange={() => toggleClass(c.cls)}
                        />
                        <span className="truncate font-medium">{classLabel(c.cls)}</span>
                      </label>
                    ))}
                  </div>
                )}
                {classesWithoutStructure.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    No fee structure yet (can't be billed):{" "}
                    {classesWithoutStructure.map(classLabel).join(", ")}.
                  </p>
                )}
              </div>

              {/* Already-billed warning for the chosen month */}
              {alreadyBilled.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Already billed for {MONTHS[Number(form.month) - 1]} {form.year}:{" "}
                    <b>
                      {alreadyBilled.map((a) => `${classLabel(a.cls)} (${a.count})`).join(", ")}
                    </b>
                    . A student is only ever billed once per month, so these will be{" "}
                    <b>skipped</b> — nothing is charged twice. To add a fee to a month already
                    generated, delete that class's row in the table first, then generate it again
                    with the extra fee ticked.
                  </p>
                </div>
              )}

              {feeOptions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Fees to include this month</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setExcludedFees([])}
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setExcludedFees(feeOptions.map((o) => o.name))}
                      >
                        None
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                    {feeOptions.map((o) => (
                      <label
                        key={o.name}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={includeItems.includes(o.name)}
                          onChange={() => toggleFee(o.name)}
                        />
                        <span className="font-medium">{o.name}</span>
                        {o.optional && (
                          <span className="text-xs text-muted-foreground">
                            — optional, opted-in students only
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only the fees set up for the ticked classes are listed. Untick one to leave it
                    out of this month — e.g. tick just Class 2 above and add <b>Exam Fee</b> when
                    only Class 2 sits an exam. Amounts always come from each class's{" "}
                    <b>Fee Setup</b>. Picked the wrong ones? Use <b>Undo a Month</b> and generate
                    again.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={generate}
                  disabled={generating || selectedClasses.length === 0}
                >
                  {generating
                    ? "Generating…"
                    : selectedClasses.length === classChoices.length
                      ? "Generate for all classes"
                      : `Generate for ${selectedClasses.length} class(es)`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
