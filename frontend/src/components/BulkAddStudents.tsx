import { useState } from "react";
import { Plus, Trash2, Wand2, CopyCheck } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { FeeHead, FeeStructure } from "@/types";
import { CLASSES, SECTIONS, classLabel } from "@/lib/constants";
import { useSettings } from "@/context/SettingsContext";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const categories = ["General", "OBC", "SC", "ST", "RTE", "Staff Ward"];
const genders = ["", "Male", "Female", "Other"];
const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const miniLabel = "text-[11px] font-medium text-muted-foreground";

const today = () => new Date().toISOString().slice(0, 10);

interface Row {
  admissionNo: string;
  name: string;
  dateOfAdmission: string;
  dateOfBirth: string;
  rollNo: string;
  gender: string;
  category: string;
  parentName: string;
  motherName: string;
  parentPhone: string;
  parentEmail: string;
  address: string;
  optedServices: string[];
  serviceFees: Record<string, string>; // service name -> amount (string, editable)
}
const emptyRow = (date = today(), category = "General"): Row => ({
  admissionNo: "",
  name: "",
  dateOfAdmission: date,
  dateOfBirth: "",
  rollNo: "",
  gender: "",
  category,
  parentName: "",
  motherName: "",
  parentPhone: "",
  parentEmail: "",
  address: "",
  optedServices: [],
  serviceFees: {},
});

// Date, category & services are auto-defaulted, so they don't count toward
// "is this row filled in?" — only the identifying fields do.
const CONTENT_FIELDS: (keyof Row)[] = [
  "admissionNo",
  "name",
  "rollNo",
  "gender",
  "parentName",
  "motherName",
  "parentPhone",
  "parentEmail",
  "address",
];
const isRowUsed = (r: Row) =>
  CONTENT_FIELDS.some((f) => String(r[f]).trim() !== "");

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  optionalHeads: FeeHead[];
  structures: FeeStructure[];
  sessions: string[];
  onDone: () => void;
}

export default function BulkAddStudents({
  open,
  onOpenChange,
  optionalHeads,
  structures,
  sessions,
  onDone,
}: Props) {
  const { currentSession } = useSettings();
  const [shared, setShared] = useState({
    session: currentSession,
    class: "",
    section: "",
    dateOfAdmission: today(),
    category: "General",
  });
  const [admPrefix, setAdmPrefix] = useState("");
  const [admStart, setAdmStart] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: 5 }, () => emptyRow())
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const sessionOptions = Array.from(new Set([currentSession, ...sessions]));

  // The class's base amount for an optional service (from its fee structure).
  const baseFeeFor = (headName: string): number | null => {
    if (!shared.class) return null;
    const forClass = structures.filter((s) => s.class === shared.class);
    const s = forClass.find((x) => x.academicYear === shared.session) || forClass[0];
    const item = s?.items.find((i) => i.name === headName);
    return item ? item.amount : null;
  };

  const reset = () => {
    setShared({
      session: currentSession,
      class: "",
      section: "",
      dateOfAdmission: today(),
      category: "General",
    });
    setAdmPrefix("");
    setAdmStart("");
    setRows(Array.from({ length: 5 }, () => emptyRow()));
    setErrors([]);
  };

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((rs) => [...rs, emptyRow(shared.dateOfAdmission, shared.category)]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  const applyCommonToAll = () =>
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        dateOfAdmission: shared.dateOfAdmission,
        category: shared.category,
      }))
    );

  // Toggle an optional service (e.g. Transport) on ONE student, prefilling the
  // fee with the class base when turning it on.
  const toggleRowService = (i: number, name: string) =>
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        if (r.optedServices.includes(name)) {
          const { [name]: _drop, ...restFees } = r.serviceFees;
          return {
            ...r,
            optedServices: r.optedServices.filter((s) => s !== name),
            serviceFees: restFees,
          };
        }
        const base = baseFeeFor(name);
        return {
          ...r,
          optedServices: [...r.optedServices, name],
          serviceFees: { ...r.serviceFees, [name]: base != null ? String(base) : "" },
        };
      })
    );

  const setRowServiceFee = (i: number, name: string, val: string) =>
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i ? { ...r, serviceFees: { ...r.serviceFees, [name]: val } } : r
      )
    );

  // Turn a service on/off for EVERY student at once (fee = class base).
  const quickSetService = (name: string, on: boolean) =>
    setRows((rs) =>
      rs.map((r) => {
        if (on) {
          if (r.optedServices.includes(name)) return r;
          const base = baseFeeFor(name);
          return {
            ...r,
            optedServices: [...r.optedServices, name],
            serviceFees: { ...r.serviceFees, [name]: base != null ? String(base) : "" },
          };
        }
        if (!r.optedServices.includes(name)) return r;
        const { [name]: _drop, ...restFees } = r.serviceFees;
        return {
          ...r,
          optedServices: r.optedServices.filter((s) => s !== name),
          serviceFees: restFees,
        };
      })
    );

  const fillDown = () => {
    const startStr = admStart.trim();
    const startNum = parseInt(startStr, 10);
    if (Number.isNaN(startNum)) {
      toast.error("Enter a starting number to fill down (e.g. 101)");
      return;
    }
    const width = startStr.replace(/[^0-9]/g, "").length;
    setRows((rs) =>
      rs.map((r, i) => ({
        ...r,
        admissionNo: `${admPrefix}${String(startNum + i).padStart(width, "0")}`,
      }))
    );
  };

  const submit = async () => {
    if (!shared.class) {
      toast.error("Choose a class for this batch");
      return;
    }
    const used = rows
      .map((r, i) => ({ r, gridRow: i + 1 }))
      .filter(({ r }) => isRowUsed(r));

    if (used.length === 0) {
      toast.error("Fill in at least one student");
      return;
    }

    const seen = new Set<string>();
    for (const { r, gridRow } of used) {
      if (!r.admissionNo.trim() || !r.name.trim()) {
        toast.error(
          `Student ${gridRow}: needs an admission no. and a name (or clear it)`
        );
        return;
      }
      const key = r.admissionNo.trim();
      if (seen.has(key)) {
        toast.error(`Student ${gridRow}: duplicate admission no. "${key}" in this batch`);
        return;
      }
      seen.add(key);
    }

    const students = used.map(({ r }) => {
      // Only store a service-fee override when it differs from the class base;
      // an unedited service keeps following the class fee structure.
      const serviceFees = r.optedServices
        .map((name) => {
          const raw = r.serviceFees[name];
          if (raw === undefined || raw === "") return null;
          const amount = Number(raw);
          if (!Number.isFinite(amount) || amount < 0) return null;
          const base = baseFeeFor(name);
          if (base != null && amount === base) return null;
          return { name, amount };
        })
        .filter((x): x is { name: string; amount: number } => x !== null);

      return {
        admissionNo: r.admissionNo.trim(),
        name: r.name.trim(),
        session: shared.session || undefined,
        class: shared.class,
        section: shared.section || undefined,
        dateOfAdmission: r.dateOfAdmission || undefined,
        dateOfBirth: r.dateOfBirth || undefined,
        category: r.category || "General",
        rollNo: r.rollNo.trim() || undefined,
        gender: r.gender || "",
        parentName: r.parentName.trim() || undefined,
        motherName: r.motherName.trim() || undefined,
        parentPhone: r.parentPhone.trim() || undefined,
        parentEmail: r.parentEmail.trim() || undefined,
        address: r.address.trim() || undefined,
        optedServices: r.optedServices,
        serviceFees,
      };
    });

    setSaving(true);
    setErrors([]);
    try {
      const { data } = await api.post("/students/import", { students });
      toast.success(data.message);
      if (data.inserted) onDone();
      if ((data.errors || []).length === 0) {
        reset();
        onOpenChange(false);
      } else {
        setErrors(data.errors);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not add students");
    } finally {
      setSaving(false);
    }
  };

  const usedCount = rows.filter(isRowUsed).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] max-w-5xl flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Bulk add students</DialogTitle>
          <DialogDescription>
            Set the class &amp; common details once, then fill each student below.
            Empty ones are ignored — add only as many as you need.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Shared fields */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Session</Label>
              <select
                className={selectClass}
                value={shared.session}
                onChange={(e) => setShared((s) => ({ ...s, session: e.target.value }))}
              >
                {sessionOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Class <span className="text-rose-500">*</span>
              </Label>
              <select
                className={selectClass}
                value={shared.class}
                onChange={(e) => setShared((s) => ({ ...s, class: e.target.value }))}
              >
                <option value="">Select class</option>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {classLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Section</Label>
              <select
                className={selectClass}
                value={shared.section}
                onChange={(e) => setShared((s) => ({ ...s, section: e.target.value }))}
              >
                <option value="">None</option>
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date of adm. (common)</Label>
              <Input
                type="date"
                className="h-9"
                value={shared.dateOfAdmission}
                onChange={(e) =>
                  setShared((s) => ({ ...s, dateOfAdmission: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category (common)</Label>
              <select
                className={selectClass}
                value={shared.category}
                onChange={(e) => setShared((s) => ({ ...s, category: e.target.value }))}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-full"
                onClick={applyCommonToAll}
                title="Copy the common date & category into every student below"
              >
                <CopyCheck className="h-4 w-4" />
                Apply to all
              </Button>
            </div>
          </div>

          {/* Admission auto-fill + quick service set */}
          <div className="flex flex-wrap items-end gap-4 rounded-lg border px-3 py-2">
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Adm. no. prefix</Label>
                <Input
                  className="h-9 w-32"
                  placeholder="e.g. 2026/"
                  value={admPrefix}
                  onChange={(e) => setAdmPrefix(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start at</Label>
                <Input
                  className="h-9 w-24"
                  placeholder="101"
                  value={admStart}
                  onChange={(e) => setAdmStart(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" onClick={fillDown}>
                <Wand2 className="h-4 w-4" />
                Fill down
              </Button>
            </div>

            {optionalHeads.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-l pl-4">
                <span className="text-xs text-muted-foreground">Quick set:</span>
                {optionalHeads.map((h) => (
                  <span key={h._id} className="flex items-center gap-1 text-sm">
                    <b>{h.name}</b>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => quickSetService(h.name, true)}
                    >
                      All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => quickSetService(h.name, false)}
                    >
                      None
                    </Button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Student cards — two lines each, no sideways scrolling */}
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Student {i + 1}
                    {r.name.trim() ? ` · ${r.name.trim()}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-muted-foreground hover:text-rose-600"
                    title="Remove this student"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Line 1 — identity */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="space-y-1">
                    <span className={miniLabel}>
                      Admission no. <span className="text-rose-500">*</span>
                    </span>
                    <Input
                      className="h-9"
                      value={r.admissionNo}
                      onChange={(e) => setRow(i, { admissionNo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>
                      Name <span className="text-rose-500">*</span>
                    </span>
                    <Input
                      className="h-9"
                      value={r.name}
                      onChange={(e) => setRow(i, { name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>Date of adm.</span>
                    <Input
                      type="date"
                      className="h-9"
                      value={r.dateOfAdmission}
                      onChange={(e) => setRow(i, { dateOfAdmission: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>Date of birth</span>
                    <Input
                      type="date"
                      className="h-9"
                      value={r.dateOfBirth}
                      onChange={(e) => setRow(i, { dateOfBirth: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>Roll no.</span>
                    <Input
                      className="h-9"
                      value={r.rollNo}
                      onChange={(e) => setRow(i, { rollNo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>Gender</span>
                    <select
                      className={selectClass}
                      value={r.gender}
                      onChange={(e) => setRow(i, { gender: e.target.value })}
                    >
                      {genders.map((g) => (
                        <option key={g} value={g}>
                          {g || "—"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>Category</span>
                    <select
                      className={selectClass}
                      value={r.category}
                      onChange={(e) => setRow(i, { category: e.target.value })}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Line 2 — contact + optional services */}
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <span className={miniLabel}>Parent name</span>
                    <Input
                      className="h-9"
                      value={r.parentName}
                      onChange={(e) => setRow(i, { parentName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>Mother's name</span>
                    <Input
                      className="h-9"
                      value={r.motherName}
                      onChange={(e) => setRow(i, { motherName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>Parent phone</span>
                    <Input
                      className="h-9"
                      value={r.parentPhone}
                      onChange={(e) => setRow(i, { parentPhone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>Parent email</span>
                    <Input
                      type="email"
                      className="h-9"
                      value={r.parentEmail}
                      onChange={(e) => setRow(i, { parentEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={miniLabel}>Address</span>
                    <Input
                      className="h-9"
                      value={r.address}
                      onChange={(e) => setRow(i, { address: e.target.value })}
                    />
                  </div>
                  {optionalHeads.length > 0 && (
                    <div className="space-y-1">
                      <span className={miniLabel}>Services (e.g. Transport)</span>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {optionalHeads.map((h) => {
                          const on = r.optedServices.includes(h.name);
                          const base = baseFeeFor(h.name);
                          return (
                            <div key={h._id} className="flex items-center gap-1.5">
                              <label className="flex cursor-pointer items-center gap-1 text-sm">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleRowService(i, h.name)}
                                />
                                {h.name}
                              </label>
                              {on && (
                                <Input
                                  type="number"
                                  className="h-8 w-24"
                                  placeholder={base != null ? String(base) : "amount"}
                                  value={r.serviceFees[h.name] ?? ""}
                                  onChange={(e) => setRowServiceFee(i, h.name, e.target.value)}
                                  title={
                                    base != null
                                      ? `Class base ${formatINR(base)} — edit for this student`
                                      : "Fee per month"
                                  }
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" />
            Add student
          </Button>

          {errors.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="mb-1 text-sm font-semibold text-rose-700">
                {errors.length} student(s) couldn't be added
              </p>
              <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-rose-700">
                {errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-rose-600/80">
                The others were saved. Fix these and add again.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-3">
          <span className="mr-auto self-center text-sm text-muted-foreground">
            {usedCount} student{usedCount === 1 ? "" : "s"} ready
            {shared.class
              ? ` · ${classLabel(shared.class)}${shared.section ? `-${shared.section}` : ""}`
              : ""}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || usedCount === 0}>
            {saving ? "Adding…" : `Add ${usedCount || ""} student${usedCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
