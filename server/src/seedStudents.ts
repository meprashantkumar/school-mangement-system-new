import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { CURRENT_SESSION } from "./utils/academics";
import { Student } from "./models/Student";

// Seeds 100 sample students spread across every class and section, so the fee
// flow can be tested with realistic data. Idempotent: re-running only inserts
// admission numbers that don't already exist (ADM1001..ADM1100).
//   Run with: npm run seed:students

const CLASSES = [
  "Nursery",
  "LKG",
  "UKG",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
];
const SECTIONS = ["A", "B", "C", "D", "E", "F", "G"];

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna",
  "Ishaan", "Rohan", "Kabir", "Aryan", "Dhruv", "Kartik", "Advik", "Ayaan",
  "Ananya", "Diya", "Aadhya", "Saanvi", "Ira", "Myra", "Aarohi", "Anika",
  "Navya", "Kiara", "Riya", "Meera", "Tara", "Zara",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Singh", "Patel", "Kumar", "Reddy", "Nair",
  "Mehta", "Iyer", "Das", "Joshi", "Rao", "Chauhan", "Malhotra",
];
const CATEGORIES = [
  "General", "General", "General", "General", "General",
  "OBC", "OBC", "SC", "ST", "RTE",
];

const classLabel = (c: string) => (/^\d/.test(c) ? `Class ${c}` : c);

const buildStudents = () => {
  const students = [];
  for (let i = 0; i < 100; i++) {
    const cls = CLASSES[i % CLASSES.length];
    const section = SECTIONS[Math.floor(i / CLASSES.length) % SECTIONS.length];
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const isMale = i % 2 === 0;

    students.push({
      admissionNo: `ADM${1001 + i}`,
      name: `${first} ${last}`,
      session: CURRENT_SESSION,
      class: cls,
      section,
      rollNo: String(Math.floor(i / CLASSES.length) + 1),
      gender: isMale ? "Male" : "Female",
      category: CATEGORIES[i % CATEGORIES.length],
      parentName: `${isMale ? "Mr." : "Mrs."} ${last}`,
      parentPhone: `9${String(800000000 + i).padStart(9, "0")}`,
      // Give roughly every third student the Transport optional service, so the
      // opt-in fee behaviour can be tested against these records.
      optedServices: i % 3 === 0 ? ["Transport"] : [],
    });
  }
  return students;
};

const run = async () => {
  await connectDB();

  // Normalise any legacy records that predate the `session` field.
  const backfill = await Student.updateMany(
    { $or: [{ session: { $exists: false } }, { session: null }, { session: "" }] },
    { $set: { session: CURRENT_SESSION } }
  );
  if (backfill.modifiedCount) {
    console.log(`Backfilled session on ${backfill.modifiedCount} existing student(s).`);
  }

  // Records that predate `dateOfAdmission`: fall back to when they were created.
  const missingDoa = await Student.find({ dateOfAdmission: { $exists: false } }).select("createdAt");
  for (const s of missingDoa) {
    await Student.updateOne({ _id: s._id }, { $set: { dateOfAdmission: s.createdAt } });
  }
  if (missingDoa.length) {
    console.log(`Backfilled dateOfAdmission on ${missingDoa.length} existing student(s).`);
  }

  const all = buildStudents();
  const admissionNos = all.map((s) => s.admissionNo);
  const existing = await Student.find({ admissionNo: { $in: admissionNos } }).select("admissionNo");
  const existingSet = new Set(existing.map((s) => s.admissionNo));

  const toInsert = all.filter((s) => !existingSet.has(s.admissionNo));

  if (toInsert.length) {
    await Student.insertMany(toInsert);
  }

  // Quick breakdown so it's clear the spread is correct.
  const byClass = all.reduce<Record<string, number>>((acc, s) => {
    acc[s.class] = (acc[s.class] || 0) + 1;
    return acc;
  }, {});

  console.log(`Seeded students: ${toInsert.length} inserted, ${existingSet.size} already existed.`);
  console.log(
    "Per class: " +
      CLASSES.map((c) => `${classLabel(c)}=${byClass[c] || 0}`).join(", ")
  );
  console.log(`Transport opted-in: ${all.filter((s) => s.optedServices.length).length}`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
