import { useEffect, useRef, useState } from "react";
import { Plus, Search, Pencil, Trash2, BookOpen, Download, Upload } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Subject } from "@/types";
import { CLASSES, classLabel } from "@/lib/constants";
import { toCSV, parseCSV, downloadFile } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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

const CSV_COLUMNS = ["name", "code", "classes", "order"];

const emptyForm = { name: "", code: "", order: 0 };

export default function Subjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [classes, setClasses] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSubjects = async () => {
    try {
      const { data } = await api.get("/subjects");
      setSubjects(data.subjects);
    } catch {
      toast.error("Failed to load subjects");
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setClasses([]);
    setOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditingId(s._id);
    setForm({ name: s.name, code: s.code || "", order: s.order || 0 });
    setClasses(s.applicableClasses || []);
    setOpen(true);
  };

  const toggleClass = (c: string) =>
    setClasses((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Enter a subject name");
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        order: Number(form.order) || 0,
        applicableClasses: classes,
      };
      if (editingId) {
        await api.put(`/subjects/${editingId}`, body);
        toast.success("Subject updated");
      } else {
        await api.post("/subjects", body);
        toast.success("Subject added");
      }
      setOpen(false);
      await fetchSubjects();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Subject) => {
    if (!confirm(`Move "${s.name}" to the recycle bin? Past results keep their own copy.`)) return;
    try {
      await api.delete(`/subjects/${s._id}`);
      toast.success("Moved to recycle bin");
      await fetchSubjects();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  const exportData = () => {
    const rows = subjects.map((s) => ({
      name: s.name,
      code: s.code || "",
      classes: (s.applicableClasses || []).join(";"),
      order: s.order || 0,
    }));
    downloadFile(
      `subjects-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(rows, CSV_COLUMNS),
      "text/csv;charset=utf-8"
    );
    toast.success(`Exported ${rows.length} subject(s)`);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      let rows: any[];
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.subjects;
      } else {
        rows = parseCSV(text);
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        toast.error("No rows found");
        return;
      }
      const { data } = await api.post("/subjects/import", { subjects: rows });
      toast.success(data.message);
      await fetchSubjects();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const filtered = subjects.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.code || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subjects</h1>
          <p className="text-muted-foreground">
            The master list teachers pick from when creating an exam. Tag each subject with the
            classes it's taught in.
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
            <Upload className="h-4 w-4" /> {importing ? "Importing…" : "Import"}
          </Button>
          <Button variant="outline" onClick={exportData}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Subject
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search subject or code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                    <BookOpen className="h-8 w-8" />
                    <p>No subjects yet. Click "Add Subject".</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s._id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.code || "—"}</TableCell>
                  <TableCell>
                    {s.applicableClasses?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {s.applicableClasses.map((c) => (
                          <span
                            key={c}
                            className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                          >
                            {classLabel(c)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">All classes</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Subject" : "Add Subject"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Mathematics"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Code (optional)</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. MATH"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Taught in classes</Label>
              <p className="text-xs text-muted-foreground">
                Leave all unticked to make it available to every class.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CLASSES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleClass(c)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      classes.includes(c)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    {classLabel(c)}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter>
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
