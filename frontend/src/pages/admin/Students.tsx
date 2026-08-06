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
  FileText,
  Eye,
  Download,
  Upload,
  Users,
  KeyRound,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { FeeHead, FeeStructure, Student } from "@/types";
import {
  CLASSES,
  SECTIONS,
  classLabel,
  classesUpTo,
  nextClass,
  nextSession,
} from "@/lib/constants";
import { useSettings } from "@/context/SettingsContext";
import { formatINR } from "@/lib/utils";
import { toCSV, parseCSV, downloadFile } from "@/lib/csv";
import PromoteStudentsDialog from "@/components/PromoteStudentsDialog";
import BulkAddStudents from "@/components/BulkAddStudents";
import GiveAccessDialog, { type AccessTarget } from "@/components/GiveAccessDialog";
import BulkAccessDialog from "@/components/BulkAccessDialog";
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
  dateOfBirth: "",
  class: "",
  section: "",
  rollNo: "",
  gender: "",
  category: "General",
  parentName: "",
  motherName: "",
  parentPhone: "",
  parentEmail: "",
  address: "",
};

// Columns used for CSV import/export (order matters for the CSV header).
const CSV_COLUMNS = [
  "admissionNo",
  "name",
  "dateOfAdmission",
  "dateOfBirth",
  "session",
  "class",
  "section",
  "rollNo",
  "gender",
  "category",
  "parentName",
  "motherName",
  "parentPhone",
  "parentEmail",
  "address",
  "optedServices",
  // The per-student amounts, as "Transport:900;Meal:300". Without this column a CSV
  // export loses every custom bus fare, and re-importing the file recreates the
  // students with the service ticked but no amount against it.
  "serviceFees",
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [accessTarget, setAccessTarget] = useState<AccessTarget | null>(null);
  const [bulkAccessOpen, setBulkAccessOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [optedServices, setOptedServices] = useState<string[]>([]);
  // Per-service amount override for the student being edited (head name -> amount string).
  const [serviceFeeInputs, setServiceFeeInputs] = useState<Record<string, string>>({});
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [saving, setSaving] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [leaveFor, setLeaveFor] = useState<Student | null>(null);
  const [leaveForm, setLeaveForm] = useState({ date: today(), reason: "" });
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  // Rows that DID import but carried something the office should look at — a fee
  // amount that could not be read, for instance. These used to be dropped in silence.
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  // A picked file whose students are already on file — waiting on skip-or-refresh.
  const [pendingImport, setPendingImport] = useState<
    { rows: any[]; already: number; name: string } | null
  >(null);
  // Bringing finished students back in — e.g. last year's Class 10 into a Class 11
  // the school has just started teaching.
  const [readmitOpen, setReadmitOpen] = useState(false);
  const [readmitting, setReadmitting] = useState(false);
  const { currentSession, highestClass } = useSettings();
  const [readmitForm, setReadmitForm] = useState({ class: "", session: currentSession, section: "" });
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
    // Fee structures let us show each class's base amount for an optional service.
    api
      .get("/fees/structures")
      .then(({ data }) => setStructures(data.structures || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The class's base amount for an optional service (from its fee structure), or null.
  const baseFeeFor = (className: string, headName: string): number | null => {
    const forClass = structures.filter((s) => s.class === className);
    const s =
      forClass.find((x) => x.academicYear === currentSession) || forClass[0];
    const item = s?.items.find((i) => i.name === headName);
    return item ? item.amount : null;
  };

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
    setServiceFeeInputs({});
    setOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditingId(s._id);
    setForm({
      admissionNo: s.admissionNo,
      name: s.name,
      dateOfAdmission: s.dateOfAdmission ? s.dateOfAdmission.slice(0, 10) : "",
      dateOfBirth: s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : "",
      class: s.class,
      section: s.section || "",
      rollNo: s.rollNo || "",
      gender: s.gender || "",
      category: s.category || "General",
      parentName: s.parentName || "",
      motherName: s.motherName || "",
      parentPhone: s.parentPhone || "",
      parentEmail: s.parentEmail || "",
      address: s.address || "",
    });
    setOptedServices(s.optedServices || []);
    // Show each opted service's effective amount: the student's override if set,
    // otherwise the class's base fee (so the field is prefilled and editable).
    const overrides = new Map((s.serviceFees || []).map((f) => [f.name, f.amount]));
    const inputs: Record<string, string> = {};
    for (const name of s.optedServices || []) {
      const amt = overrides.has(name) ? overrides.get(name)! : baseFeeFor(s.class, name);
      inputs[name] = amt != null ? String(amt) : "";
    }
    setServiceFeeInputs(inputs);
    setOpen(true);
  };

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const toggleService = (name: string) =>
    setOptedServices((list) => {
      if (list.includes(name)) return list.filter((s) => s !== name);
      // Turning a service on: prefill its amount with the class's base fee.
      const base = baseFeeFor(form.class, name);
      setServiceFeeInputs((m) => ({ ...m, [name]: base != null ? String(base) : "" }));
      return [...list, name];
    });

  const setServiceFee = (name: string, val: string) =>
    setServiceFeeInputs((m) => ({ ...m, [name]: val }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Only store an override when the amount differs from the class base — an
    // unedited service keeps following the class fee structure automatically.
    const serviceFees = optedServices
      .map((name) => {
        const raw = serviceFeeInputs[name];
        if (raw === undefined || raw === "") return null;
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount < 0) return null;
        const base = baseFeeFor(form.class, name);
        if (base != null && amount === base) return null;
        return { name, amount };
      })
      .filter((x): x is { name: string; amount: number } => x !== null);
    const payload = {
      ...form,
      optedServices,
      serviceFees,
      dateOfAdmission: form.dateOfAdmission || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
    };
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

  // Students on this page who have finished or left — the ones a re-admission
  // applies to. Selection is per page, so this counts what is actually visible.
  const finishedIds = students.filter((s) => s.status !== "active").map((s) => s._id);
  const selectedFinished = finishedIds.filter((id) => selectedIds.has(id)).length;

  const openReadmit = (s?: Student) => {
    if (s) {
      clearSelection();
      toggleSelect(s._id);
    }
    // Default to the class after the one they finished, which is the usual case:
    // last year's Class 10 going into the Class 11 the school has just opened.
    const base = s || students.find((x) => selectedIds.has(x._id) && x.status !== "active");
    const up = base ? nextClass(base.class) : null;
    setReadmitForm({
      class: up && classesUpTo(highestClass).includes(up) ? up : "",
      session: base ? nextSession(base.session || currentSession) : currentSession,
      section: base?.section || "",
    });
    setReadmitOpen(true);
  };

  const submitReadmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = finishedIds.filter((id) => selectedIds.has(id));
    if (ids.length === 0) return toast.error("Select at least one finished student");
    if (!readmitForm.class) return toast.error("Choose the class they are joining");
    setReadmitting(true);
    try {
      const { data } = await api.post("/students/readmit", {
        ids,
        class: readmitForm.class,
        session: readmitForm.session,
        section: readmitForm.section || undefined,
      });
      toast.success(data.message);
      (data.skipped || []).forEach((m: string) => toast.error(m));
      // Re-admitting into a year the school has not started hides their register just
      // as promoting into it does, so it is said just as plainly.
      if (data.sessionWarning) toast.error(data.sessionWarning, { duration: 12000 });
      setReadmitOpen(false);
      clearSelection();
      await fetchStudents();
      loadSessions();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Re-admission failed");
    } finally {
      setReadmitting(false);
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
          dateOfBirth: s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : "",
          optedServices: (s.optedServices || []).join(";"),
          serviceFees: (s.serviceFees || []).map((f) => `${f.name}:${f.amount}`).join(";"),
        }));
        downloadFile(`students-${stamp}.csv`, toCSV(rows as any, CSV_COLUMNS), "text/csv;charset=utf-8");
      }
      toast.success(`Exported ${all.length} student(s)`);
    } catch {
      toast.error("Export failed");
    }
  };

  // Send a prepared set of rows to the server and report what happened.
  const runImport = async (rows: any[], updateExisting: boolean) => {
    setImporting(true);
    setImportErrors([]);
    setImportWarnings([]);
    try {
      const { data } = await api.post("/students/import", { students: rows, updateExisting });
      toast.success(data.message);
      setImportErrors(data.errors || []);
      setImportWarnings(data.warnings || []);
      await fetchStudents();
      loadSessions();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Import failed — check the file format");
    } finally {
      setImporting(false);
    }
  };

  // Import from a .csv or .json file. Admission numbers already on file are skipped
  // unless the office chooses to refresh them from the file — which is how a first
  // import that came in without fee amounts gets put right.
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again later
    if (!file) return;
    let rows: any[];
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.students;
      } else {
        rows = parseCSV(text);
      }
    } catch {
      toast.error("Could not read that file — check the format");
      return;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      toast.error("No rows found in that file");
      return;
    }

    // Ask first if the file is mostly students we already have, rather than
    // reporting "skipped 341" and leaving the office to wonder why nothing changed.
    setImporting(true);
    let already = 0;
    try {
      const { data } = await api.post("/students/import-preview", {
        admissionNos: rows.map((r) => r?.admissionNo).filter((a) => a != null),
      });
      already = data.existing || 0;
    } catch {
      /* not fatal — fall through and import as an add-only run */
    } finally {
      setImporting(false);
    }

    if (already > 0) {
      setPendingImport({ rows, already, name: file.name });
      return;
    }
    await runImport(rows, false);
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
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Users className="h-4 w-4" />
            Bulk add
          </Button>
          <Button variant="outline" onClick={() => setBulkAccessOpen(true)}>
            <KeyRound className="h-4 w-4" />
            Give class access
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
          <option value="passed">Passed out</option>
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

      {importWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-800">
              {importWarnings.length} thing(s) to check — these students were imported
            </p>
            <button
              onClick={() => setImportWarnings([])}
              className="text-xs text-amber-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
          <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-amber-800">
            {importWarnings.slice(0, 50).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {importWarnings.length > 50 && <li>…and {importWarnings.length - 50} more</li>}
          </ul>
          <p className="mt-2 text-xs text-amber-700/80">
            The students are saved. Only what is listed here was left unset — correct it on the
            student, or fix the file and import again with "update existing" ticked.
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
          {selectedFinished > 0 && (
            <>
              <span className="text-sm text-muted-foreground">·</span>
              <Button size="sm" variant="outline" onClick={() => openReadmit()}>
                <RotateCcw className="h-3.5 w-3.5" /> Re-admit {selectedFinished}
              </Button>
            </>
          )}
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
                <TableRow key={s._id} className={s.status !== "active" ? "opacity-60" : ""}>
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
                    <Badge status={s.status}>{s.status === "passed" ? "Passed out" : undefined}</Badge>
                    {s.status !== "active" && s.exitDate && (
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className={s.parent ? "text-emerald-600 hover:text-emerald-700" : ""}
                      onClick={() =>
                        setAccessTarget({
                          kind: "student",
                          id: s._id,
                          name: s.name,
                          phone: s.parentPhone,
                          hasLogin: !!s.parent,
                        })
                      }
                      title={
                        s.parent
                          ? "Parent can log in — reset password or remove access"
                          : "Give dashboard access to the parent"
                      }
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    {s.status === "left" || s.status === "passed" ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/certificate/tc/${s._id}`, "_blank")}
                          title={
                            s.status === "passed"
                              ? "Print school leaving / transfer certificate"
                              : "Print transfer certificate"
                          }
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        {s.status === "passed" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReadmit(s)}
                            title="Re-admit into a higher class"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => rejoin(s)}
                            title="Reactivate (undo left)"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </>
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
        <DialogContent
          className="max-h-[90vh] max-w-2xl"
          // A stray backdrop click shouldn't wipe a half-filled form.
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Student" : "Add Student"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={save}
            className="grid max-h-[75vh] grid-cols-2 gap-4 overflow-y-auto pr-1"
          >
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
              <Label>Date of Birth <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                name="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
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
              <Label>Mother's Name <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input name="motherName" value={form.motherName} onChange={change} />
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
            <div className="col-span-2 space-y-1.5">
              <Label>Address <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                name="address"
                value={form.address}
                onChange={change}
                placeholder="Residential address"
              />
            </div>

            {optionalHeads.length > 0 && (
              <div className="col-span-2 space-y-2">
                <Label>Optional services used</Label>
                <div className="space-y-2">
                  {optionalHeads.map((h) => {
                    const on = optedServices.includes(h.name);
                    const base = baseFeeFor(form.class, h.name);
                    return (
                      <div
                        key={h._id}
                        className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm"
                      >
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleService(h.name)}
                          />
                          {h.name}
                        </label>
                        {on && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Fee/mo:</span>
                            <Input
                              type="number"
                              className="h-8 w-28"
                              placeholder={base != null ? String(base) : "amount"}
                              value={serviceFeeInputs[h.name] ?? ""}
                              onChange={(e) => setServiceFee(h.name, e.target.value)}
                            />
                            {base != null && (
                              <span className="text-xs text-muted-foreground">
                                base {formatINR(base)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Checked services are added to this student's fee. The amount defaults to the
                  class's base fee — edit it for this student (e.g. a longer bus route). Leave it at
                  the base to keep following the class fee.
                </p>
              </div>
            )}

            <DialogFooter className="sticky bottom-0 col-span-2 -mx-1 border-t bg-background px-1 pt-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dashboard access for a parent (single student) */}
      <GiveAccessDialog
        target={accessTarget}
        onClose={() => setAccessTarget(null)}
        onDone={fetchStudents}
      />

      {/* Dashboard access for a whole class */}
      <BulkAccessDialog
        open={bulkAccessOpen}
        onOpenChange={setBulkAccessOpen}
        onDone={fetchStudents}
      />

      {/* Bulk add students */}
      <BulkAddStudents
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        optionalHeads={optionalHeads}
        structures={structures}
        sessions={sessions}
        onDone={() => {
          fetchStudents();
          loadSessions();
        }}
      />

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

      {/* Re-admit finished students into a higher class */}
      <Dialog open={readmitOpen} onOpenChange={setReadmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Re-admit {selectedFinished} student{selectedFinished === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitReadmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              They come back as active students in the class you choose. The class they passed out
              of stays in their record, they keep their admission number, and their fee history
              follows them — so this is a re-enrolment, not an undo.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Joining class</Label>
                <select
                  className={selectClass}
                  value={readmitForm.class}
                  onChange={(e) => setReadmitForm((f) => ({ ...f, class: e.target.value }))}
                >
                  <option value="">Select</option>
                  {classesUpTo(highestClass).map((c) => (
                    <option key={c} value={c}>
                      {classLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Section (optional)</Label>
                <select
                  className={selectClass}
                  value={readmitForm.section}
                  onChange={(e) => setReadmitForm((f) => ({ ...f, section: e.target.value }))}
                >
                  <option value="">None</option>
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Session</Label>
                <Input
                  value={readmitForm.session}
                  onChange={(e) => setReadmitForm((f) => ({ ...f, session: e.target.value }))}
                  placeholder="e.g. 2027-28"
                />
              </div>
            </div>
            {readmitForm.class === highestClass && (
              <p className="text-sm text-amber-700">
                {classLabel(highestClass)} is the last class here, so they will pass out again at the
                end of this session.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReadmitOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={readmitting || !readmitForm.class}>
                {readmitting ? "Re-admitting…" : "Re-admit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingImport} onOpenChange={(o) => !o && setPendingImport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Some of these students are already here</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{pendingImport?.already}</span> of the{" "}
              {pendingImport?.rows.length} students in {pendingImport?.name} are already on
              file.
            </p>
            <p className="text-muted-foreground">
              Adding only the new ones leaves those records exactly as they are. Refreshing
              them updates each one from the file — including transport and other service
              amounts, which is what you want if they were first loaded without them.
              Anything the file doesn't mention is left alone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingImport(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const p = pendingImport!;
                setPendingImport(null);
                runImport(p.rows, false);
              }}
            >
              Add new only
            </Button>
            <Button
              onClick={() => {
                const p = pendingImport!;
                setPendingImport(null);
                runImport(p.rows, true);
              }}
            >
              Refresh {pendingImport?.already} from the file
            </Button>
          </DialogFooter>
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
