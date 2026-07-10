import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Exam, Subject } from "@/types";
import { classLabel, EXAM_TYPES, defaultWeightFor, defaultPassMarks } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Picked {
  checked: boolean;
  max: string;
  pass: string;
}

/**
 * Create / edit an exam definition (subjects + max/pass + weight). Shared by the admin
 * page and the teacher dashboard — `createPath` is where a new exam is POSTed
 * ("/exams" for admin, "/teacher/exams" for a class-teacher). Editing (PUT /exams/:id)
 * is admin-only, so teachers should never pass `editing`.
 */
export function ExamFormDialog({
  open,
  onOpenChange,
  klass,
  editing,
  onSaved,
  createPath = "/exams",
  session,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  klass: string;
  editing?: Exam | null;
  onSaved: () => void;
  createPath?: string;
  session?: string;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("halfyearly");
  const [weight, setWeight] = useState<string>(String(defaultWeightFor("halfyearly")));
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const [bulkMax, setBulkMax] = useState("100");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .get("/subjects", { params: { class: klass } })
      .then(({ data }) => {
        const subs: Subject[] = data.subjects;
        setSubjects(subs);
        const seed: Record<string, Picked> = {};
        subs.forEach((s) => (seed[s._id] = { checked: false, max: "100", pass: String(defaultPassMarks(100)) }));
        if (editing) {
          editing.subjects.forEach((es) => {
            seed[es.subject] = { checked: true, max: String(es.maxMarks), pass: String(es.passMarks) };
          });
        }
        setPicked(seed);
      })
      .catch(() => toast.error("Couldn't load subjects"));

    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setWeight(String(editing.weight));
    } else {
      setName("");
      setType("halfyearly");
      setWeight(String(defaultWeightFor("halfyearly")));
      setBulkMax("100");
    }
  }, [open, klass, editing]);

  const toggle = (id: string) => setPicked((p) => ({ ...p, [id]: { ...p[id], checked: !p[id]?.checked } }));
  const setField = (id: string, field: "max" | "pass", v: string) =>
    setPicked((p) => ({ ...p, [id]: { ...p[id], [field]: v } }));

  const applyBulkMax = () => {
    const m = Number(bulkMax);
    if (!Number.isFinite(m) || m <= 0) return toast.error("Enter a valid max");
    setPicked((p) => {
      const next = { ...p };
      Object.keys(next).forEach((id) => {
        if (next[id].checked) next[id] = { ...next[id], max: String(m), pass: String(defaultPassMarks(m)) };
      });
      return next;
    });
    toast.success(`Max set to ${m} for all ticked subjects`);
  };

  const chosenCount = Object.values(picked).filter((p) => p.checked).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Enter an exam name");
    // Build from the checked entries (keyed by subject id), not the fetched list —
    // so a subject that's on the exam but no longer in the class list (renamed /
    // recycled / "all classes") isn't silently dropped when editing.
    const chosen = Object.entries(picked)
      .filter(([, p]) => p.checked)
      .map(([id, p]) => ({ subject: id, maxMarks: Number(p.max), passMarks: Number(p.pass) }));
    if (chosen.length === 0) return toast.error("Pick at least one subject");
    if (chosen.some((c) => !Number.isFinite(c.maxMarks) || c.maxMarks <= 0))
      return toast.error("Every subject needs a valid max mark");

    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        type,
        class: klass,
        weight: Number(weight) || 0,
        subjects: chosen,
        ...(session ? { session } : {}),
      };
      if (editing) {
        await api.put(`/exams/${editing._id}`, body);
        toast.success("Exam updated");
      } else {
        const { data } = await api.post(createPath, body);
        toast.success(data.message);
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit exam" : "Create exam"} · {classLabel(klass)}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Exam name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Half-Yearly Examination"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select
                className={selectClass}
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setWeight(String(defaultWeightFor(e.target.value)));
                }}
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Weight (final rank)</Label>
              <Input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Set max marks for all ticked subjects</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  value={bulkMax}
                  onChange={(e) => setBulkMax(e.target.value)}
                  className="w-28"
                />
                <Button type="button" variant="outline" onClick={applyBulkMax}>
                  Apply to all
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Subjects ({chosenCount} chosen)</Label>
            {subjects.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No subjects tagged for {classLabel(klass)}. Ask the admin to add them under Subjects.
              </p>
            ) : (
              <div className="space-y-1.5 rounded-lg border p-2">
                {subjects.map((s) => {
                  const p = picked[s._id] || { checked: false, max: "100", pass: "33" };
                  return (
                    <div
                      key={s._id}
                      className={cn("flex items-center gap-3 rounded-md px-2 py-1.5", p.checked ? "bg-primary/5" : "")}
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={p.checked} onChange={() => toggle(s._id)} />
                        <span className="font-medium">{s.name}</span>
                      </label>
                      {p.checked && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Max</span>
                          <Input
                            type="number"
                            min={1}
                            value={p.max}
                            onChange={(e) => setField(s._id, "max", e.target.value)}
                            className="h-8 w-20"
                          />
                          <span className="text-muted-foreground">Pass</span>
                          <Input
                            type="number"
                            min={0}
                            value={p.pass}
                            onChange={(e) => setField(s._id, "pass", e.target.value)}
                            className="h-8 w-16"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Update exam" : "Create exam"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
