import { Holiday } from "../models/Holiday";

// Holidays gained a scope: `class` is "" for the whole school, or a class name when
// only that class is off. Two things have to happen on an existing deployment before
// the new queries work, and both are cheap and idempotent:
//
// 1. Rows written before this change have no `class` field at all. A missing field
//    does not match `class: ""`, so those holidays would silently stop applying to
//    anyone. Backfill them as whole-school, which is what they were.
//
// 2. `dateKey` was a unique index on its own. It has to go, or a holiday for Class 10
//    would be rejected on a day that already has one for Class 12. Mongoose will not
//    alter an existing index, so the old one is dropped here and the compound
//    (dateKey, class) index is rebuilt from the schema.
export const migrateHolidayScope = async (): Promise<void> => {
  try {
    const backfilled = await Holiday.updateMany(
      { class: { $exists: false } },
      { $set: { class: "" } }
    );
    if (backfilled.modifiedCount) {
      console.log(`[holidays] marked ${backfilled.modifiedCount} existing holiday(s) whole-school`);
    }

    const coll = Holiday.collection;
    const existing = await coll.indexes();
    const stale = existing.find((i) => i.name === "dateKey_1");
    if (stale) {
      await coll.dropIndex("dateKey_1");
      console.log("[holidays] dropped the old dateKey-only unique index");
    }

    await Holiday.createIndexes();
  } catch (err: any) {
    // Never block startup on housekeeping — log it and carry on.
    console.error("[holidays] scope migration failed:", err?.message || err);
  }
};
