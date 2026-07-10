import { useEffect, useRef, useState } from "react";
import { Plus, Search, Pencil, Trash2, Users, Download, Upload } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Staff } from "@/types";
import { STAFF_CATEGORIES } from "@/lib/constants";
import { toCSV, parseCSV, downloadFile } from "@/lib/csv";
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

const genders = ["", "Male", "Female", "Other"];
const CSV_COLUMNS = ["name", "category", "designation", "phone", "gender", "employeeCode"];
const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const emptyForm = {
  name: "",
  category: "Driver",
  designation: "",
  phone: "",
  gender: "",
  employeeCode: "",
  joiningDate: "",
};

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStaff = async () => {
    try {
      const { data } = await api.get("/staff", { params: search ? { search } : {} });
      setStaff(data.staff);
    } catch {
      toast.error("Failed to load staff");
    }
  };

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (s: Staff) => {
    setEditingId(s._id);
    setForm({
      name: s.name,
      category: s.category || "Driver",
      designation: s.designation || "",
      phone: s.phone || "",
      gender: s.gender || "",
      employeeCode: s.employeeCode || "",
      joiningDate: s.joiningDate ? s.joiningDate.slice(0, 10) : "",
    });
    setOpen(true);
  };

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/staff/${editingId}`, { ...form, joiningDate: form.joiningDate || undefined });
        toast.success("Staff updated");
      } else {
        await api.post("/staff", { ...form, joiningDate: form.joiningDate || undefined });
        toast.success("Staff added");
      }
      setOpen(false);
      await fetchStaff();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Staff) => {
    if (!confirm(`Move ${s.name} to the recycle bin?`)) return;
    try {
      await api.delete(`/staff/${s._id}`);
      toast.success("Moved to recycle bin");
      await fetchStaff();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  const exportData = async (format: "csv" | "json") => {
    try {
      const { data } = await api.get("/staff");
      const all: Staff[] = data.staff;
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "json") {
        downloadFile(`staff-${stamp}.json`, JSON.stringify(all, null, 2), "application/json");
      } else {
        downloadFile(`staff-${stamp}.csv`, toCSV(all as any, CSV_COLUMNS), "text/csv;charset=utf-8");
      }
      toast.success(`Exported ${all.length} staff`);
    } catch {
      toast.error("Export failed");
    }
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
        rows = Array.isArray(parsed) ? parsed : parsed.staff;
      } else {
        rows = parseCSV(text);
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        toast.error("No rows found");
        return;
      }
      const { data } = await api.post("/staff/import", { staff: rows });
      toast.success(data.message);
      await fetchStaff();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
          <p className="text-muted-foreground">
            Drivers, conductors, peons, guards and other non-teaching employees.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,.json" className="hidden" onChange={onImportFile} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4" /> {importing ? "Importing…" : "Import"}
          </Button>
          <Button variant="outline" onClick={() => exportData("csv")}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Staff
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
          placeholder="Search name, role, phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                    <Users className="h-8 w-8" />
                    <p>No staff yet. Click "Add Staff".</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              staff.map((s) => (
                <TableRow key={s._id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {s.category}
                    </span>
                  </TableCell>
                  <TableCell>{s.designation || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone || "—"}</TableCell>
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
            <DialogTitle>{editingId ? "Edit Staff" : "Add Staff"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input name="name" value={form.name} onChange={change} required />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select name="category" value={form.category} onChange={change} className={selectClass}>
                {STAFF_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input name="designation" placeholder="e.g. Bus 3 Driver" value={form.designation} onChange={change} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input name="phone" value={form.phone} onChange={change} />
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
