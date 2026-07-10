import { useEffect, useRef, useState } from "react";
import { Plus, Search, Pencil, Trash2, Contact, Download, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Teacher } from "@/types";
import { CLASSES, SECTIONS, classLabel } from "@/lib/constants";
import { toCSV, parseCSV, downloadFile } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const genders = ["", "Male", "Female", "Other"];
// Export omits class/section on purpose: a teacher can be class-teacher of several
// sections, but a flat CSV only holds one — round-tripping it would wipe the rest.
// Class assignments are managed in the UI. (Import still accepts class/section for
// first-time bulk setup.)
const CSV_COLUMNS = ["name", "email", "phone", "gender", "designation", "employeeCode"];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  gender: "",
  designation: "",
  employeeCode: "",
  joiningDate: "",
};

type AsgDraft = { class: string; section: string };

export default function Teachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [assignments, setAssignments] = useState<AsgDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTeachers = async () => {
    try {
      const { data } = await api.get("/teachers", { params: search ? { search } : {} });
      setTeachers(data.teachers);
    } catch {
      toast.error("Failed to load teachers");
    }
  };

  useEffect(() => {
    fetchTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setAssignments([]);
    setOpen(true);
  };

  const openEdit = (t: Teacher) => {
    setEditingId(t._id);
    setForm({
      name: t.name,
      email: t.email,
      phone: t.phone || "",
      gender: t.gender || "",
      designation: t.designation || "",
      employeeCode: t.employeeCode || "",
      joiningDate: t.joiningDate ? t.joiningDate.slice(0, 10) : "",
    });
    setAssignments((t.assignments || []).map((a) => ({ class: a.class, section: a.section })));
    setOpen(true);
  };

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const addRow = () => setAssignments((a) => [...a, { class: "", section: "" }]);
  const setRow = (i: number, patch: Partial<AsgDraft>) =>
    setAssignments((a) => a.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setAssignments((a) => a.filter((_, idx) => idx !== i));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      joiningDate: form.joiningDate || undefined,
      assignments: assignments.filter((a) => a.class && a.section),
    };
    try {
      if (editingId) {
        await api.put(`/teachers/${editingId}`, payload);
        toast.success("Teacher updated");
      } else {
        await api.post("/teachers", payload);
        toast.success("Teacher added");
      }
      setOpen(false);
      await fetchTeachers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Teacher) => {
    if (!confirm(`Move ${t.name} to the recycle bin? You can restore them (and their login) later.`))
      return;
    try {
      await api.delete(`/teachers/${t._id}`);
      toast.success("Teacher moved to recycle bin");
      await fetchTeachers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  const exportData = async (format: "csv" | "json") => {
    try {
      const { data } = await api.get("/teachers");
      const all: Teacher[] = data.teachers;
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "json") {
        downloadFile(`teachers-${stamp}.json`, JSON.stringify(all, null, 2), "application/json");
      } else {
        const rows = all.map((t) => ({
          name: t.name,
          email: t.email,
          phone: t.phone || "",
          gender: t.gender || "",
          designation: t.designation || "",
          employeeCode: t.employeeCode || "",
        }));
        downloadFile(`teachers-${stamp}.csv`, toCSV(rows as any, CSV_COLUMNS), "text/csv;charset=utf-8");
      }
      toast.success(`Exported ${all.length} teacher(s)`);
    } catch {
      toast.error("Export failed");
    }
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportErrors([]);
    try {
      const text = await file.text();
      let rows: any[];
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.teachers;
      } else {
        rows = parseCSV(text);
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        toast.error("No rows found in that file");
        return;
      }
      const { data } = await api.post("/teachers/import", { teachers: rows });
      toast.success(data.message);
      setImportErrors(data.errors || []);
      await fetchTeachers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Import failed — check the file format");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teachers</h1>
          <p className="text-muted-foreground">
            Add staff, assign class-teachers, and let them sign up with their email.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={onImportFile}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4" />
            {importing ? "Importing…" : "Import"}
          </Button>
          <Button variant="outline" onClick={() => exportData("csv")}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => exportData("json")}>
            JSON
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Teacher
          </Button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setReloadKey((k) => k + 1);
        }}
        className="relative max-w-sm"
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search name, email, phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      {importErrors.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold text-rose-700">
              {importErrors.length} row(s) couldn't be imported
            </p>
            <button onClick={() => setImportErrors([])} className="text-xs text-rose-600 hover:underline">
              Dismiss
            </button>
          </div>
          <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-rose-700">
            {importErrors.slice(0, 50).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {importErrors.length > 50 && <li>…and {importErrors.length - 50} more</li>}
          </ul>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Class-teacher of</TableHead>
              <TableHead>Login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teachers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                    <Contact className="h-8 w-8" />
                    <p>No teachers yet. Click "Add Teacher" to get started.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              teachers.map((t) => (
                <TableRow key={t._id}>
                  <TableCell className="font-medium">
                    {t.name}
                    {t.phone && <div className="text-xs text-muted-foreground">{t.phone}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.email}</TableCell>
                  <TableCell>{t.designation || "—"}</TableCell>
                  <TableCell>
                    {t.assignments?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {t.assignments.map((a) => (
                          <span
                            key={`${a.class}-${a.section}`}
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          >
                            {classLabel(a.class)}-{a.section}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.user ? (
                      <Badge status="active">Signed up</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not yet</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove(t)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add / edit teacher */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Teacher" : "Add Teacher"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input name="name" value={form.name} onChange={change} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email (their login)</Label>
              <Input
                name="email"
                type="email"
                value={form.email}
                onChange={change}
                disabled={!!editingId}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input name="phone" value={form.phone} onChange={change} />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input
                name="designation"
                placeholder="e.g. PGT Maths"
                value={form.designation}
                onChange={change}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <select name="gender" value={form.gender} onChange={change} className={selectClass}>
                {genders.map((g) => (
                  <option key={g} value={g}>
                    {g || "Select"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Employee Code</Label>
              <Input name="employeeCode" value={form.employeeCode} onChange={change} />
            </div>
            <div className="space-y-1.5">
              <Label>Joining Date</Label>
              <Input name="joiningDate" type="date" value={form.joiningDate} onChange={change} />
            </div>

            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Class-teacher of</Label>
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-4 w-4" /> Add class
                </Button>
              </div>
              {assignments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Optional. Add the class + section(s) this teacher manages for attendance.
                </p>
              )}
              <div className="space-y-2">
                {assignments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className={selectClass}
                      value={a.class}
                      onChange={(e) => setRow(i, { class: e.target.value })}
                    >
                      <option value="">Class</option>
                      {CLASSES.map((c) => (
                        <option key={c} value={c}>
                          {classLabel(c)}
                        </option>
                      ))}
                    </select>
                    <select
                      className={selectClass}
                      value={a.section}
                      onChange={(e) => setRow(i, { section: e.target.value })}
                    >
                      <option value="">Section</option>
                      {SECTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
