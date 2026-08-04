import { Student } from "../models/Student";
import { Teacher } from "../models/Teacher";
import { User } from "../models/User";
import { normalizePhone } from "./phone";

// Mobile numbers are login IDs now, so they must be stored in ONE canonical form.
// Records created before that (or typed as "+91 98765 43210" / "098765 43210")
// still hold their raw text, and a raw value never matches the normalised number
// on the login — the parent would log in fine but see none of their children.
//
// This rewrites any stored number that isn't already a clean 10-digit mobile.
// Idempotent: once normalised, the filter matches nothing and it costs one cheap
// query per collection at boot.
const fixField = async (model: any, field: string, label: string): Promise<number> => {
  // Go through the native driver and compare in JS: Mongoose mis-casts a `$not`
  // regex on a String path (it silently matches nothing), and getting this wrong
  // fails silently in the worst way — parents log in but see no children.
  const coll = model.collection;
  const docs = await coll
    .find({ [field]: { $nin: [null, ""] } }, { projection: { _id: 1, [field]: 1 } })
    .toArray();

  const ops = [];
  for (const d of docs) {
    const current = d[field];
    const normalised = normalizePhone(current);
    // Leave unparseable junk alone rather than destroying what was entered.
    if (!normalised || normalised === current) continue;
    ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { [field]: normalised } } } });
  }

  if (ops.length) {
    await coll.bulkWrite(ops, { ordered: false });
    console.log(`[phones] normalised ${ops.length} ${label}`);
  }
  return ops.length;
};

export const normalizeStoredPhones = async (): Promise<void> => {
  try {
    await fixField(Student, "parentPhone", "student parent number(s)");
    await fixField(Teacher, "phone", "teacher number(s)");
    await fixField(User, "phone", "login number(s)");
  } catch (err: any) {
    // Housekeeping must never stop the server from starting.
    console.error("[phones] normalisation failed:", err?.message || err);
  }
};
