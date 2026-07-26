import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { Subject } from "./models/Subject";
import { Teacher } from "./models/Teacher";
import { ClassTimetable, ITimetableSlot } from "./models/ClassTimetable";
import { TimetableConfig } from "./models/TimetableConfig";
import { CURRENT_SESSION } from "./utils/academics";

// Seeds the Class 1–5 (section A) weekly timetable for the current session, plus
// the 7 subjects, 7 teachers and the 7-period Mon–Sat bell schedule they need.
// Idempotent: safe to run again (everything is upserted). Run with:
//   npx tsx src/seedTimetable.ts

const SECTION = "A";
const CLASSES = ["1", "2", "3", "4", "5"];

// index 0..6 — teacher i teaches subject i (1:1). This ordering drives the whole
// cyclic rotation, which guarantees no clashes + 2 free periods per teacher.
const SUBJECTS = [
  { name: "English", code: "ENG" },
  { name: "Hindi", code: "HIN" },
  { name: "Mathematics", code: "MATH" },
  { name: "Environmental Studies", code: "EVS" },
  { name: "Computer", code: "COMP" },
  { name: "Drawing", code: "ART" },
  { name: "Physical Education", code: "PE" },
];

const TEACHERS = [
  { name: "Ramesh Kumar", email: "ramesh.kumar@rkpublic.example.com", phone: "9800000001", gender: "Male", designation: "English Teacher", employeeCode: "EMP001", cls: "1" },
  { name: "Sunita Sharma", email: "sunita.sharma@rkpublic.example.com", phone: "9800000002", gender: "Female", designation: "Hindi Teacher", employeeCode: "EMP002", cls: "2" },
  { name: "Anil Verma", email: "anil.verma@rkpublic.example.com", phone: "9800000003", gender: "Male", designation: "Mathematics Teacher", employeeCode: "EMP003", cls: "3" },
  { name: "Pooja Singh", email: "pooja.singh@rkpublic.example.com", phone: "9800000004", gender: "Female", designation: "EVS Teacher", employeeCode: "EMP004", cls: "4" },
  { name: "Kavita Yadav", email: "kavita.yadav@rkpublic.example.com", phone: "9800000005", gender: "Female", designation: "Computer Teacher", employeeCode: "EMP005", cls: "5" },
  { name: "Manoj Gupta", email: "manoj.gupta@rkpublic.example.com", phone: "9800000006", gender: "Male", designation: "Drawing Teacher", employeeCode: "EMP006", cls: "" },
  { name: "Deepak Mishra", email: "deepak.mishra@rkpublic.example.com", phone: "9800000007", gender: "Male", designation: "Physical Education Teacher", employeeCode: "EMP007", cls: "" },
];

// Saturday grid (5 periods x 5 classes) -> teacher index, or null = Activity/Library.
// Hand-verified: every teacher teaches exactly 3 periods (2 free), no clashes.
const SAT: (number | null)[][] = [
  [0, 1, 2, 3, 4], // P1
  [5, 6, 0, 1, null], // P2
  [2, 3, 4, null, 5], // P3
  [6, 0, null, 2, 3], // P4
  [4, null, 1, 5, 6], // P5
];

const run = async () => {
  // Safety: this is a TEST/DEV data seeder only — never let it run against prod.
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_SEED !== "yes") {
    console.error(
      "Refusing to run: this is a test-only seeder. To run it in development, set ALLOW_SEED=yes."
    );
    process.exit(1);
  }
  await connectDB();

  // 1) Subjects (upsert by name).
  const subjectIds: any[] = [];
  for (let i = 0; i < SUBJECTS.length; i++) {
    const s = SUBJECTS[i];
    const doc = await Subject.findOneAndUpdate(
      { name: s.name },
      { $set: { code: s.code, applicableClasses: CLASSES, order: i + 1, isActive: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    subjectIds[i] = doc!._id;
  }
  console.log(`Subjects ready: ${SUBJECTS.length}`);

  // 2) Teachers (upsert by email) + class-teacher assignment for the first five.
  const teacherIds: any[] = [];
  const teacherNames: string[] = [];
  for (let i = 0; i < TEACHERS.length; i++) {
    const t = TEACHERS[i];
    const assignments = t.cls
      ? [{ class: t.cls, section: SECTION, session: CURRENT_SESSION }]
      : [];
    const doc = await Teacher.findOneAndUpdate(
      { email: t.email },
      {
        $set: {
          name: t.name,
          phone: t.phone,
          gender: t.gender,
          designation: t.designation,
          employeeCode: t.employeeCode,
          isActive: true,
          assignments,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    teacherIds[i] = doc!._id;
    teacherNames[i] = t.name;
  }
  console.log(`Teachers ready: ${TEACHERS.length}`);

  // 3) Bell schedule: 7 numbered periods, working days Mon–Sat.
  const periods = Array.from({ length: 7 }, (_, i) => ({
    period: i + 1,
    label: `Period ${i + 1}`,
    start: "",
    end: "",
    isBreak: false,
  }));
  await TimetableConfig.findOneAndUpdate(
    {},
    { $set: { periods, workingDays: [1, 2, 3, 4, 5, 6] } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  console.log("Bell schedule ready: 7 periods, Mon–Sat");

  // Build one slot from a teacher index (idx maps to both teacher & subject).
  const slotFor = (day: number, period: number, idx: number): ITimetableSlot => ({
    day,
    period,
    subject: subjectIds[idx],
    subjectName: SUBJECTS[idx].name,
    teacher: teacherIds[idx],
    teacherName: teacherNames[idx],
    room: "",
  });

  // 4) Class timetables (classes 1..5, section A).
  for (let c = 0; c < CLASSES.length; c++) {
    const slots: ITimetableSlot[] = [];

    // Mon–Fri (ISO days 1..5): cyclic rotation — same grid each weekday.
    for (let day = 1; day <= 5; day++) {
      for (let p = 1; p <= 7; p++) {
        const idx = (p - 1 + c) % 7;
        slots.push(slotFor(day, p, idx));
      }
    }

    // Saturday (ISO day 6): 5 periods, from the verified grid (skip Activity).
    for (let p = 1; p <= 5; p++) {
      const idx = SAT[p - 1][c];
      if (idx === null) continue; // Activity / Library — no teacher slot
      slots.push(slotFor(6, p, idx));
    }

    await ClassTimetable.findOneAndUpdate(
      { class: CLASSES[c], section: SECTION, session: CURRENT_SESSION },
      { $set: { slots } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    console.log(`Timetable saved: Class ${CLASSES[c]}-${SECTION} (${slots.length} slots)`);
  }

  console.log(`\nDone. Session ${CURRENT_SESSION}. Open Timetable → Class timetable to view.`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
