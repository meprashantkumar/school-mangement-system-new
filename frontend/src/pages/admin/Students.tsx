import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  GraduationCap,
  ArrowUpCircle,
  UserMinus,
  RotateCcw,
  Eye,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { FeeHead, Student } from "@/types";
import { CLASSES, SECTIONS, classLabel } from "@/lib/constants";
import { toCSV, parseCSV, downloadFile } from "@/lib/csv";
import PromoteStudentsDialog from "@/components/PromoteStudentsDialog";
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

const categories = ["General", "OBC", "SC", "ST", "RTE", "Staff Ward"];
const genders = ["", "Male", "Female", "Other"];

const emptyForm = {
  admissionNo: "",
  name: "",
  dateOfAdmission: "",
  class: "",
  section: "",
  rollNo: "",
  gender: "",
  category: "General",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
};

// Columns used for CSV import/export (order matters for the CSV header).
const CSV_COLUMNS = [
  "admissionNo",
  "name",
  "dateOfAdmission",
  "session",
  "class",
  "section",
  "rollNo",
  "gender",
  "category",
  "parentName",
  "parentPhone",
  "parentEmail",
  "optedServices",
  "status",
];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const today = () => new Date().toISOString().slice(0, 10);

export default function Students() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [optionalHeads, setOptionalHeads] = useState<FeeHead[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ session: "", class: "", status: "" });
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1, limit: 50 });
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [optedServices, setOptedServices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [leaveFor, setLeaveFor] = useState<Student | null>(null);
  const [leaveForm, setLeaveForm] = useState({ date: today(), reason: "" });
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkService, setBulkService] = useState("Transport");

  const fetchStudents = async () => {
    try {
      const params: Record<string, string | number> = { page, limit: 50 };
      if (search) params.search = search;
      if (filters.session) params.session = filters.session;
      if (filters.class) params.class = filters.class;
      if (filters.status) params.status = filters.status;
      const { data } = await api.get("/students", { params });
      setStudents(data.students);
      setMeta({ total: data.total, pages: data.pages, limit: data.limit });
    } catch {
      toast.error("Failed to load students");
    }
  };

  // Change a filter and jump back to the first page of the (re-filtered) results.
  const changeFilter = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const loadSessions = () =>
    api
      .get("/students/sessions")
      .then(({ data }) => setSessions(data.sessions))
      .catch(() => {});

  // Refetch on filter change, page change, or an explicit search (reloadKey).
  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, reloadKey]);

  useEffect(() => {
    loadSessions();
    api
      .get("/fees/heads")
      .then(({ data }) => {
        const opts = data.feeHeads.filter((h: FeeHead) => h.optional);
        setOptionalHeads(opts);
        if (opts[0]) setBulkService(opts[0].name);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allVisibleSelected = students.length > 0 && students.every((s) => selectedIds.has(s._id));

  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (students.every((s) => next.has(s._id))) {
        students.forEach((s) => next.delete(s._id));
      } else {
        students.forEach((s) => next.add(s._id));
      }
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  const bulkServices = async (action: "add" | "remove") => {
    if (!bulkService) return toast.error("Choose a service");
    try {
      const { data } = await api.post("/students/bulk-services", {
        ids: [...selectedIds],
        service: bulkService,
        action,
      });
      toast.success(data.message);
      clearSelection();
      await fetchStudents();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, dateOfAdmission: today() });
    setOptedServices([]);
    setOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditingId(s._id);
    setForm({
      admissionNo: s.admissionNo,
      name: s.name,
      dateOfAdmission: s.dateOfAdmission ? s.dateOfAdmission.slice(0, 10) : "",
      class: s.class,
      section: s.section || "",
      rollNo: s.rollNo || "",
      gender: s.gender || "",
      category: s.category || "General",
      parentName: s.parentName || "",
      parentPhone: s.parentPhone || "",
      parentEmail: s.parentEmail || "",
    });
    setOptedServices(s.optedServices || []);
    setOpen(true);
  };

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const toggleService = (name: string) =>
    setOptedServices((list) =>
      list.includes(name) ? list.filter((s) => s !== name) : [...list, name]
    );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, optedServices, dateOfAdmission: form.dateOfAdmission || undefined };
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, payload);
        toast.success("Student updated");
      } else {
        await api.post("/students", payload);
        toast.success("Student added");
      }
      setOpen(false);
      await fetchStudents();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Student) => {
    if (!confirm(`Move ${s.name} to the recycle bin? You can restore this record later.`)) return;
    try {
      await api.delete(`/students/${s._id}`);
      toast.success("Student moved to recycle bin");
      await fetchStudents();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  const openLeave = (s: Student) => {
    setLeaveFor(s);
    setLeaveForm({ date: today(), reason: "" });
  };

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveFor) return;
    try {
      await api.post(`/students/${leaveFor._id}/leave`, {
        date: leaveForm.date || undefined,
        reason: leaveForm.reason || undefined,
      });
      toast.success(`${leaveFor.name} marked as left`);
      setLeaveFor(null);
      await fetchStudents();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const rejoin = async (s: Student) => {
    if (!confirm(`Reactivate ${s.name}?`)) return;
    try {
      await api.post(`/students/${s._id}/rejoin`);
      toast.success("Student reactivated");
      await fetchStudents();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  // Export ALL students (ignores current filters) as a backup file.
  const exportData = async (format: "csv" | "json") => {
    try {
      const { data } = await api.get("/students", { params: { all: 1 } });
      const all: Student[] = data.students;
      const stamp = today();
      if (format === "json") {
        downloadFile(`students-${stamp}.json`, JSON.stringify(all, null, 2), "application/json");
      } else {
        const rows = all.map((s) => ({
          ...s,
          dateOfAdmission: s.dateOfAdmission ? s.dateOfAdmission.slice(0, 10) : "",
          optedServices: (s.optedServices || []).join(";"),
        }));
        downloadFile(`students-${stamp}.csv`, toCSV(rows as any, CSV_COLUMNS), "text/csv;charset=utf-8");
      }
      toast.success(`Exported ${all.length} student(s)`);
    } catch {
      toast.error("Export failed");
    }
  };

  // Import from a .csv or .json file (skips admission numbers that already exist).
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again later
    if (!file) return;
    setImporting(true);
    setImportErrors([]);
    try {
      const text = await file.text();
      let rows: any[];
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.students;
      } else {
        rows = parseCSV(text);
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        toast.error("No rows found in that file");
        return;
      }
      const { data } = await api.post("/students/import", { students: rows });
      toast.success(data.message);
      setImportErrors(data.errors || []);
      await fetchStudents();
      loadSessions();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Import failed — check the file format");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Students</h1>
          <p className="text-muted-foreground">Add, manage, and promote student records.</p>
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
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => exportData("json")}>
            JSON
          </Button>
          <Button variant="outline" onClick={() => setPromoteOpen(true)}>
            <ArrowUpCircle className="h-4 w-4" />
            Promote Class
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Add Student
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setReloadKey((k) => k + 1);
          }}
          className="relative flex-1 min-w-[220px] max-w-sm"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, admission no, or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
        <select
          className={`${selectClass} w-auto`}
          value={filters.session}
          onChange={(e) => changeFilter({ session: e.target.value })}
        >
          <option value="">All sessions</option>
          {sessions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={`${selectClass} w-auto`}
          value={filters.class}
          onChange={(e) => changeFilter({ class: e.target.value })}
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
          value={filters.status}
          onChange={(e) => changeFilter({ status: e.target.value })}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="left">Left</option>
        </select>
      </div>

      {importErrors.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold text-rose-700">
              {importErrors.length} row(s) couldn't be imported
            </p>
            <button
              onClick={() => setImportErrors([])}
              className="text-xs text-rose-600 hover:underline"
            >
              Dismiss
            </button>
          </div>
          <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-rose-700">
            {importErrors.slice(0, 50).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {importErrors.length > 50 && <li>…and {importErrors.length - 50} more</li>}
          </ul>
          <p className="mt-2 text-xs text-rose-600/80">
            Fix these rows in your file and import again — the ones that succeeded are already saved.
          </p>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <span className="text-sm text-muted-foreground">·</span>
          <select
            className={`${selectClass} w-auto`}
            value={bulkService}
            onChange={(e) => setBulkService(e.target.value)}
          >
            {optionalHeads.length === 0 && <option value="Transport">Transport</option>}
            {optionalHeads.map((h) => (
              <option key={h._id} value={h.name}>
                {h.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => bulkServices("add")}>
            Add as taken
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkServices("remove")}>
            Remove
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  title="Select all"
                />
              </TableHead>
              <TableHead>Adm. No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                    <GraduationCap className="h-8 w-8" />
                    <p>No students match. Adjust filters or click "Add Student".</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              students.map((s) => (
                <TableRow key={s._id} className={s.status === "left" ? "opacity-60" : ""}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s._id)}
                      onChange={() => toggleSelect(s._id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{s.admissionNo}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>
                    {classLabel(s.class)}
                    {s.section ? `-${s.section}` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.session || "—"}</TableCell>
                  <TableCell>{s.category}</TableCell>
                  <TableCell>
                    <div>{s.parentName || "-"}</div>
                    <div className="text-xs text-muted-foreground">{s.parentPhone || ""}</div>
                  </TableCell>
                  <TableCell>
                    <Badge status={s.status} />
                    {s.status === "left" && s.exitDate && (
                      <div
                        className="mt-1 text-xs text-muted-foreground"
                        title={s.exitReason || ""}
                      >
                        {new Date(s.exitDate).toLocaleDateString("en-IN")}
                        {s.exitReason ? ` · ${s.exitReason}` : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/admin/students/${s._id}`)}
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {s.status === "left" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rejoin(s)}
                        title="Reactivate (undo left)"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openLeave(s)}
                        title="Mark as left school"
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove(s)}
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

      {meta.total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {meta.total} student(s) · showing {(page - 1) * meta.limit + 1}–
            {Math.min(page * meta.limit, meta.total)}
          </span>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span>
              Page {page} of {meta.pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= meta.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add / edit student */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Student" : "Add Student"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Admission No</Label>
              <Input
                name="admissionNo"
                value={form.admissionNo}
                onChange={change}
                disabled={!!editingId}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input name="name" value={form.name} onChange={change} required />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Admission</Label>
              <Input
                name="dateOfAdmission"
                type="date"
                value={form.dateOfAdmission}
                onChange={change}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <select name="class" value={form.class} onChange={change} className={selectClass} required>
                <option value="">Select class</option>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {classLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <select name="section" value={form.section} onChange={change} className={selectClass}>
                <option value="">None</option>
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Roll No</Label>
              <Input name="rollNo" value={form.rollNo} onChange={change} />
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
              <Label>Category</Label>
              <select
                name="category"
                value={form.category}
                onChange={change}
                className={selectClass}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Parent Name</Label>
              <Input name="parentName" value={form.parentName} onChange={change} />
            </div>
            <div className="space-y-1.5">
              <Label>Parent Phone</Label>
              <Input name="parentPhone" value={form.parentPhone} onChange={change} />
            </div>
            <div className="space-y-1.5">
              <Label>Parent Email</Label>
              <Input
                name="parentEmail"
                type="email"
                value={form.parentEmail}
                onChange={change}
              />
            </div>

            {optionalHeads.length > 0 && (
              <div className="col-span-2 space-y-2">
                <Label>Optional services used</Label>
                <div className="flex flex-wrap gap-3">
                  {optionalHeads.map((h) => (
                    <label
                      key={h._id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={optedServices.includes(h.name)}
                        onChange={() => toggleService(h.name)}
                      />
                      {h.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Only checked services (e.g. Transport) will be added to this student's fee.
                </p>
              </div>
            )}

            <DialogFooter className="col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mark as left */}
      <Dialog open={!!leaveFor} onOpenChange={(o) => !o && setLeaveFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {leaveFor?.name} as left school</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitLeave} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The student stops appearing in fee generation and promotions. Their past records are
              kept. Date and reason are optional.
            </p>
            <div className="space-y-1.5">
              <Label>Date of leaving</Label>
              <Input
                type="date"
                value={leaveForm.date}
                onChange={(e) => setLeaveForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input
                placeholder="e.g. Transferred, Relocated, TC issued"
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLeaveFor(null)}>
                Cancel
              </Button>
              <Button type="submit">Mark as left</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PromoteStudentsDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        sessions={sessions}
        onDone={() => {
          fetchStudents();
          loadSessions();
        }}
      />
    </div>
  );
}
