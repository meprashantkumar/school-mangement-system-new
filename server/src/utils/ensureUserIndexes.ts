import { Model } from "mongoose";
import { User } from "../models/User";
import { Teacher } from "../models/Teacher";

// Login identifiers changed shape when phone-based login was introduced: `email`
// went from required+unique to optional+unique+sparse, and `phone` became a
// unique+sparse login ID (on both User and Teacher).
//
// Mongoose will NOT alter an index that already exists with different options, so
// an older deployment keeps its non-sparse `email_1`. That matters: on a
// non-sparse unique index a missing field counts as `null`, so the SECOND record
// created without an email is rejected as a duplicate — which is now the common
// case, since parents and teachers log in by phone and often have no email.
//
// This drops only the stale identifier indexes so Mongoose can rebuild them with
// the right options. Idempotent and safe on every boot: it never touches data and
// does nothing once the indexes are already correct.
const IDENTIFIER_INDEXES = ["email_1", "phone_1"] as const;

const fixIdentifierIndexes = async (model: Model<any>, label: string) => {
  const coll = model.collection;
  const existing = await coll.indexes();

  for (const name of IDENTIFIER_INDEXES) {
    const idx = existing.find((i) => i.name === name);
    // Rebuild only if it exists but isn't the unique+sparse shape we now need.
    if (idx && !(idx.unique && idx.sparse)) {
      await coll.dropIndex(name);
      console.log(`[${label}] rebuilt stale index ${name} as unique+sparse`);
    }
  }

  // Recreate anything missing from the current schema definition.
  await model.createIndexes();
};

export const ensureUserIndexes = async (): Promise<void> => {
  try {
    await fixIdentifierIndexes(User, "users");
    await fixIdentifierIndexes(Teacher, "teachers");
  } catch (err: any) {
    // Never block startup on index housekeeping — log it and carry on.
    console.error("[indexes] login-identifier index check failed:", err?.message || err);
  }
};
