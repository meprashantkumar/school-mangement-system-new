import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, Trash2, Eye, ExternalLink, Search, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Admission, AdmissionStatus } from "@/types";
import { SECTIONS, classLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

const TABS: { value: AdmissionStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const statusBadge = (s: AdmissionStatus) => {
  const map: Record<AdmissionStatus, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-rose-100 text-rose-700",
  };
  return `rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${map[s]}`;
};

export default function Admissions() {
  const [items, setItems] = useState<Admission[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [tab, setTab] = useState<AdmissionStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<Admission | null>(null);
  const [approve, setApprove] = useState<Admission | null>(null);
  const [reject, setReject] = useState<Admission | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admissions", {
        params: { status: tab === "all" ? undefined : tab, search: search || undefined },
      });
      setItems(data.applications);
      setCounts(data.counts);
    } catch {
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admissions</h1>
        <p className="text-muted-foreground">
          Applications submitted from the website. Approve to enrol the student, or reject.
        </p>
      </div>

      {/* Tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              {t.label}
              {t.value === "pending" && counts.pending > 0 && (
                <span className="ml-2 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                  {counts.pending}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name / no. / phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-9"
          />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No applications here.</TableCell></TableRow>
            ) : (
              items.map((a) => (
                <TableRow key={a._id}>
                  <TableCell className="font-mono text-xs">{a.applicationNo}</TableCell>
                  <TableCell className="font-medium">{a.studentName}</TableCell>
                  <TableCell>{classLabel(a.applyingForClass)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <div>{a.parentName}</div>
                    <div className="text-xs">{a.parentPhone}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell><span className={statusBadge(a.status)}>{a.status}</span></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => setView(a)} title="View">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {a.status !== "approved" && (
                      <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => setApprove(a)} title="Approve & enrol">
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    {a.status === "pending" && (
                      <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => setReject(a)} title="Reject">
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <DeleteButton a={a} onDone={load} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {view && <ViewDialog a={view} onClose={() => setView(null)} onReopen={load} />}
      {approve && <ApproveDialog a={approve} onClose={() => setApprove(null)} onDone={() => { setApprove(null); load(); }} />}
      {reject && <RejectDialog a={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); load(); }} />}
    </div>
  );
}

function DeleteButton({ a, onDone }: { a: Admission; onDone: () => void }) {
  const del = async () => {
    if (!confirm(`Move application "${a.applicationNo}" to the recycle bin?`)) return;
    try {
      await api.delete(`/admissions/${a._id}`);
      toast.success("Moved to recycle bin");
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };
  return (
    <Button variant="ghost" size="sm" className="text-destructive" onClick={del} title="Delete">
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function ViewDialog({ a, onClose, onReopen }: { a: Admission; onClose: () => void; onReopen: () => void }) {
  const student = typeof a.convertedStudent === "object" ? a.convertedStudent : null;
  const reopen = async () => {
    try {
      await api.post(`/admissions/${a._id}/reopen`);
      toast.success("Moved back to pending");
      onClose();
      onReopen();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't reopen");
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{a.studentName}</DialogTitle>
          <DialogDescription className="font-mono">{a.applicationNo}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] divide-y overflow-y-auto">
          <div className="pb-2">
            <Row label="Applying for" value={classLabel(a.applyingForClass)} />
            <Row label="Session" value={a.session} />
            <Row label="Gender" value={a.gender} />
            <Row label="Date of birth" value={a.dateOfBirth ? new Date(a.dateOfBirth).toLocaleDateString("en-IN") : undefined} />
            <Row label="Category" value={a.category} />
            <Row label="Previous school" value={a.previousSchool} />
          </div>
          <div className="py-2">
            <Row label="Parent / guardian" value={a.parentName} />
            <Row label="Phone" value={a.parentPhone} />
            <Row label="Email" value={a.parentEmail} />
            <Row label="Address" value={a.address} />
            <Row label="Message" value={a.message} />
          </div>
          {a.reviewNote && <div className="py-2"><Row label="Staff note" value={a.reviewNote} /></div>}
          {student && (
            <div className="py-2 text-sm">
              <p className="mb-1 font-medium text-emerald-700">Enrolled as student</p>
              <Link to={`/admin/students/${student._id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                {student.name} ({student.admissionNo}) <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
        <DialogFooter>
          {a.status !== "pending" && !student && (
            <Button variant="outline" onClick={reopen}>
              <RotateCcw className="h-4 w-4" /> Reopen
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ a, onClose, onDone }: { a: Admission; onClose: () => void; onDone: () => void }) {
  const [admissionNo, setAdmissionNo] = useState("");
  const [section, setSection] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!admissionNo.trim()) return toast.error("Enter an admission number");
    setSaving(true);
    try {
      await api.post(`/admissions/${a._id}/approve`, { admissionNo: admissionNo.trim(), section, rollNo });
      toast.success(`${a.studentName} enrolled`);
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Approval failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve &amp; enrol</DialogTitle>
          <DialogDescription>
            This creates a student record for <b>{a.studentName}</b> in {classLabel(a.applyingForClass)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Admission number *</Label>
            <Input value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} placeholder="e.g. 2026-045" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Section</Label>
              <select value={section} onChange={(e) => setSection(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">—</option>
                {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label>Roll no.</Label>
              <Input value={rollNo} onChange={(e) => setRollNo(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Enrolling…" : "Approve & enrol"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ a, onClose, onDone }: { a: Admission; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/admissions/${a._id}/reject`, { note });
      toast.success("Application rejected");
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't reject");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject application</DialogTitle>
          <DialogDescription>Optionally add a reason. This can be reopened later.</DialogDescription>
        </DialogHeader>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Reason (optional)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>{saving ? "…" : "Reject"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
