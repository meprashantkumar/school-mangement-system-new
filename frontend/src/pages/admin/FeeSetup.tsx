import { useEffect, useState } from "react";
import { Plus, Trash2, FileText, Layers, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { FeeHead, FeeStructure } from "@/types";
import { CLASSES, classLabel } from "@/lib/constants";
import { formatINR } from "@/lib/utils";
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

type ItemRow = { name: string; amount: string; optional: boolean };

export default function FeeSetup() {
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [headForm, setHeadForm] = useState({ name: "", optional: false });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // structure form (used for both create and edit)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [meta, setMeta] = useState({ name: "", class: "", academicYear: "2026-27" });
  const [items, setItems] = useState<ItemRow[]>([{ name: "", amount: "", optional: false }]);

  const load = async () => {
    const [h, s] = await Promise.all([api.get("/fees/heads"), api.get("/fees/structures")]);
    setFeeHeads(h.data.feeHeads);
    setStructures(s.data.structures);
  };

  useEffect(() => {
    load().catch(() => toast.error("Failed to load fee setup"));
  }, []);

  /* ---- fee heads ---- */
  const addHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headForm.name.trim()) return;
    try {
      await api.post("/fees/heads", headForm);
      setHeadForm({ name: "", optional: false });
      toast.success("Fee head added");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const deleteHead = async (id: string) => {
    await api.delete(`/fees/heads/${id}`);
    toast.success("Deleted");
    load();
  };

  /* ---- structure builder ---- */
  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const openCreate = () => {
    setEditingId(null);
    setMeta({ name: "", class: "", academicYear: "2026-27" });
    setItems([{ name: "", amount: "", optional: false }]);
    setOpen(true);
  };

  const openEdit = (s: FeeStructure) => {
    setEditingId(s._id);
    setMeta({ name: s.name, class: s.class, academicYear: s.academicYear });
    setItems(
      s.items.length
        ? s.items.map((i) => ({ name: i.name, amount: String(i.amount), optional: i.optional }))
        : [{ name: "", amount: "", optional: false }]
    );
    setOpen(true);
  };

  const pickHead = (idx: number, name: string) => {
    const head = feeHeads.find((h) => h.name === name);
    const next = [...items];
    next[idx].name = name;
    next[idx].optional = head?.optional || false;
    setItems(next);
  };

  const saveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...meta,
      items: items
        .filter((i) => i.name && i.amount)
        .map((i) => ({ name: i.name, amount: Number(i.amount), optional: i.optional })),
    };
    try {
      if (editingId) {
        await api.put(`/fees/structures/${editingId}`, payload);
        toast.success("Fee structure updated");
      } else {
        await api.post("/fees/structures", payload);
        toast.success("Fee structure created");
      }
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteStructure = async (id: string) => {
    if (!confirm("Delete this fee structure?")) return;
    await api.delete(`/fees/structures/${id}`);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fee Setup</h1>
        <p className="text-muted-foreground">
          Define fee heads and each class's fee structure. Bill a month from the{" "}
          <span className="font-medium">Fee Generation</span> page.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Fee heads */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-primary" /> Fee Heads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={addHead} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Tuition, Transport"
                  value={headForm.name}
                  onChange={(e) => setHeadForm({ ...headForm, name: e.target.value })}
                />
                <Button type="submit" size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={headForm.optional}
                  onChange={(e) => setHeadForm({ ...headForm, optional: e.target.checked })}
                />
                Optional service (e.g. Transport — only for opted-in students)
              </label>
            </form>
            <div className="space-y-2">
              {feeHeads.length === 0 && (
                <p className="text-sm text-muted-foreground">No fee heads yet.</p>
              )}
              {feeHeads.map((h) => (
                <div
                  key={h._id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {h.name}
                    {h.optional && <Badge status="partial">optional</Badge>}
                  </span>
                  <button
                    onClick={() => deleteHead(h._id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Structures */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" /> Fee Structures
            </CardTitle>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New Structure
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {structures.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No structures yet. Create one for each class, then bill a month from Fee Generation.
              </p>
            )}
            {structures.map((s) => (
              <div
                key={s._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {classLabel(s.class)} · {s.academicYear} · {formatINR(s.totalAmount)}/mo
                    (mandatory) · {s.items.length} item(s)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => deleteStructure(s._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Create / edit structure dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Fee Structure" : "New Fee Structure"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveStructure} className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={meta.name}
                  onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                  placeholder="Class 6 Monthly Fees"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Class</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={meta.class}
                  onChange={(e) => setMeta({ ...meta, class: e.target.value })}
                  required
                >
                  <option value="">Select class</option>
                  {CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {classLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Academic Year</Label>
                <Input
                  value={meta.academicYear}
                  onChange={(e) => setMeta({ ...meta, academicYear: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Fee items (per month)</Label>
                <span className="text-sm text-muted-foreground">Total: {formatINR(total)}</span>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      value={it.name}
                      onChange={(e) => pickHead(idx, e.target.value)}
                    >
                      <option value="">Select fee head</option>
                      {feeHeads.map((h) => (
                        <option key={h._id} value={h.name}>
                          {h.name}
                          {h.optional ? " (optional)" : ""}
                        </option>
                      ))}
                    </select>
                    {it.optional && <Badge status="partial">optional</Badge>}
                    <Input
                      type="number"
                      placeholder="Amount"
                      className="w-32"
                      value={it.amount}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].amount = e.target.value;
                        setItems(next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setItems([...items, { name: "", amount: "", optional: false }])}
              >
                <Plus className="h-4 w-4" /> Add item
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Optional items (like Transport) are only billed to students who use that service.
                Editing a structure changes future generations; already-generated invoices stay as they
                are.
              </p>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Create structure"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
