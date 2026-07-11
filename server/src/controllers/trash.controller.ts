import { Request } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Trash, TrashKind } from "../models/Trash";
import { Student } from "../models/Student";
import { Teacher } from "../models/Teacher";
import { Staff } from "../models/Staff";
import { FeeStructure } from "../models/FeeStructure";
import { FeeHead } from "../models/FeeHead";
import { Subject } from "../models/Subject";
import { Exam } from "../models/Exam";
import { Mark } from "../models/Mark";
import { Admission } from "../models/Admission";
import { User } from "../models/User";
import { logAudit, AUDIT } from "../utils/audit";

const MODELS: Record<TrashKind, any> = {
  Student,
  Teacher,
  Staff,
  FeeStructure,
  FeeHead,
  Subject,
  Exam,
  Admission,
};

// Snapshots a mongoose document into the recycle bin, then deletes it. Restoring
// re-inserts the exact document (same _id) so references stay valid.
export const moveToTrash = async (
  req: Request,
  kind: TrashKind,
  doc: any,
  label: string
): Promise<void> => {
  await Trash.create({
    kind,
    originalId: doc._id,
    label,
    data: doc.toObject(),
    deletedBy: req.user?._id,
    deletedByName: req.user?.name,
  });
  await doc.deleteOne();
};

// GET /api/trash
export const getTrash = asyncHandler(async (req, res) => {
  const { kind } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (kind) filter.kind = kind;
  const items = await Trash.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json({ items });
});

// POST /api/trash/:id/restore
export const restoreTrash = asyncHandler(async (req, res) => {
  const entry = await Trash.findById(req.params.id);
  if (!entry) throw new ApiError(404, "Item not found in recycle bin");

  const Model = MODELS[entry.kind as TrashKind];
  if (!Model) throw new ApiError(400, "Unknown item type");

  // Exams carry their marks along (see deleteExam) — restore both together.
  const data: any = { ...entry.data };
  const cascadedMarks: any[] = Array.isArray(data.__marks) ? data.__marks : [];
  delete data.__marks;

  // Only restore if nothing else has taken its place.
  const exists = await Model.findById(entry.originalId);
  if (!exists) {
    // Raw insert preserves the original _id, timestamps and every field exactly.
    await Model.collection.insertOne(data);
    if (entry.kind === "Exam" && cascadedMarks.length) {
      await Mark.collection.insertMany(cascadedMarks);
    }
  }

  // Deleting a teacher downgraded their login to "parent" — restoring must put
  // the "teacher" role back, or they'd get 403 on the teacher dashboard.
  if (entry.kind === "Teacher" && data?.email) {
    const user = await User.findOne({ email: data.email });
    if (user && user.role === "parent") {
      user.role = "teacher";
      await user.save({ validateBeforeSave: false });
    }
  }

  await entry.deleteOne();

  logAudit(req, AUDIT.RESTORE, `Restored ${entry.kind}: ${entry.label}`, {
    entity: entry.kind,
    entityId: String(entry.originalId),
  });
  res.json({ message: `${entry.kind} restored` });
});

// DELETE /api/trash/:id  (permanent)
export const purgeTrash = asyncHandler(async (req, res) => {
  const entry = await Trash.findByIdAndDelete(req.params.id);
  if (!entry) throw new ApiError(404, "Item not found in recycle bin");
  logAudit(req, AUDIT.RESTORE, `Permanently deleted ${entry.kind}: ${entry.label}`);
  res.json({ message: "Deleted permanently" });
});
