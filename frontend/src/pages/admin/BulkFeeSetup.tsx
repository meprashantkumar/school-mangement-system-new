import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { FeeHead, FeeStructure } from "@/types";
import { CLASSES, classLabel, CURRENT_SESSION } from "@/lib/constants";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// class -> fee-head name -> amount (kept as strings while editing)
type Grid = Record<string, Record<string, string>>;

/**
 * Bulk fee setup: one grid to create/edit every class's fees for a session at once.
 * Rows = classes (Nursery→12, each with an include checkbox), columns = fee heads.
 * "Set all" fills a whole column; unchecking a class simply skips it (never deletes).
 */
export default function BulkFeeSetup({
  open,
  onOpenChange,
  feeHeads,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  feeHeads: FeeHead[];
  onSaved: () => void;
}) {
  const [academicYear, setAcademicYear] = useState(CURRENT_SESSION);
  const [grid, setGrid] = useState<Grid>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [applyAll, setApplyAll] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Prefill from existing structures whenever the dialog opens or the year changes,
  // so this doubles as a bulk editor (already-set classes show their current amounts).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api
      .get("/fees/structures")
      .then((res) => {
        if (cancelled) return;
        const structures: FeeStructure[] = res.data.structures || [];
        const g: Grid = {};
        const inc: Record<string, boolean> = {};
        for (const cls of CLASSES) {
          g[cls] = {};
          inc[cls] = true;
        }
        for (const s of structures) {
          if (s.academicYear !== academicYear) continue;
          if (!g[s.class]) g[s.class] = {};
          for (const it of s.items) g[s.class][it.name] = String(it.amount);
        }
        setGrid(g);
        setIncluded(inc);
        setApplyAll({});
      })
      .catch(() => toast.error("Failed to load existing structures"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, academicYear]);

  const setCell = (cls: string, head: string, val: string) =>
    setGrid((g) => ({ ...g, [cls]: { ...(g[cls] || {}), [head]: val } }));

  const fillColumn = (head: string, val: string) => {
    setApplyAll((a) => ({ ...a, [head]: val }));
    setGrid((g) => {
      const next: Grid = { ...g };
      for (const cls of CLASSES) {
        if (!included[cls]) continue;
        next[cls] = { ...(next[cls] || {}), [head]: val };
      }
      return next;
    });
  };

  const toggleClass = (cls: string) =>
    setIncluded((inc) => ({ ...inc, [cls]: !inc[cls] }));

  const setAllIncluded = (v: boolean) => {
    const inc: Record<string, boolean> = {};
    for (const cls of CLASSES) inc[cls] = v;
    setIncluded(inc);
  };

  const rowTotal = (cls: string) =>
    feeHeads.reduce((sum, h) => sum + (Number(grid[cls]?.[h.name]) || 0), 0);

  const includedCount = CLASSES.filter((c) => included[c]).length;

  const save = async () => {
    const rows = CLASSES.filter((c) => included[c])
      .map((cls) => ({
        class: cls,
        items: feeHeads
          .map((h) => ({
            name: h.name,
            amount: Number(grid[cls]?.[h.name]) || 0,
            optional: h.optional,
          }))
          .filter((i) => i.amount > 0),
      }))
      .filter((r) => r.items.length > 0);

    if (rows.length === 0) {
      toast.error("Nothing to save — enter at least one amount.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/fees/structures/bulk", { academicYear, rows });
      toast.success(res.data.message || "Saved");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Bulk fee setup — all classes at once</DialogTitle>
        </DialogHeader>

        {feeHeads.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Add at least one fee head first (left panel), then use bulk setup.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1.5">
                <Label>Academic Year</Label>
                <Input
                  className="w-40"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {includedCount} of {CLASSES.length} classes selected
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => setAllIncluded(true)}>
                  Select all
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setAllIncluded(false)}>
                  Clear all
                </Button>
              </div>
            </div>

            {/* Matrix */}
            <div className="max-h-[55vh] overflow-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Use</th>
                    <th className="px-3 py-2 font-medium">Class</th>
                    {feeHeads.map((h) => (
                      <th key={h._id} className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-1">
                          {h.name}
                          {h.optional && <Badge status="partial">opt</Badge>}
                        </div>
                        <Input
                          type="number"
                          placeholder="set all"
                          className="mt-1 h-8 w-24"
                          value={applyAll[h.name] || ""}
                          onChange={(e) => fillColumn(h.name, e.target.value)}
                        />
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Total/mo</th>
                  </tr>
                </thead>
                <tbody>
                  {CLASSES.map((cls) => (
                    <tr
                      key={cls}
                      className={`border-t ${included[cls] ? "" : "opacity-40"}`}
                    >
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={!!included[cls]}
                          onChange={() => toggleClass(cls)}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium">
                        {classLabel(cls)}
                      </td>
                      {feeHeads.map((h) => (
                        <td key={h._id} className="px-3 py-1.5">
                          <Input
                            type="number"
                            className="h-8 w-24"
                            placeholder="0"
                            disabled={!included[cls]}
                            value={grid[cls]?.[h.name] || ""}
                            onChange={(e) => setCell(cls, h.name, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-muted-foreground">
                        {formatINR(rowTotal(cls))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Type an amount in a column's <span className="font-medium">set all</span> box to fill
              every selected class, then tweak the ones that differ. Unchecking a class skips it —
              it won't delete an existing structure. Blank cells aren't added. Optional heads (like
              Transport) only bill opted-in students.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading || feeHeads.length === 0}>
            {saving ? "Saving..." : loading ? "Loading..." : "Save all classes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
