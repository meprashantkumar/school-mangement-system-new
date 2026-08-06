import { Student } from "../models/Student";

// Finishing school used to be recorded as status "left" with the exit reason
// "Graduated (2025-26)", so the only way to tell a passout from a child whose family
// moved away was to pattern-match that sentence. It is now its own status, and the
// reports read the status instead — so any records written the old way have to be
// converted, or a school's earlier passouts would be counted as leavers forever.
//
// Cheap and idempotent: after the first run there is nothing left to match.
export const migratePassouts = async (): Promise<void> => {
  try {
    const result = await Student.updateMany(
      { status: "left", exitReason: { $regex: "^Graduated", $options: "i" } },
      { $set: { status: "passed" } }
    );
    if (result.modifiedCount) {
      console.log(`[students] marked ${result.modifiedCount} earlier graduate(s) as passed out`);
    }
  } catch (err: any) {
    // Never block startup on housekeeping — log it and carry on.
    console.error("[students] passout migration failed:", err?.message || err);
  }
};
