import mongoose, { Document, Schema, Types } from "mongoose";
import { DEFAULT_SESSION } from "../utils/academics";

// School-wide academic settings — a single document, like the timetable's bell
// schedule. Kept in the database rather than the env file so a school can change
// it in the app: the same image runs every school, and a school that adds Class 11
// and 12 should not need a redeploy.
export interface ISchoolSetting extends Document {
  // The last class this school teaches. Promotion stops here: a student who passes
  // the highest class has finished school rather than moving up to a class that
  // does not exist. "10" for a school up to matriculation, "8" for a middle school,
  // "12" for a senior secondary one.
  highestClass: string;
  // The academic session the school is currently running, e.g. "2026-27". Rosters,
  // attendance, exams, timetables and class-teacher assignments are all read for
  // this session, so it is what makes April feel like a new year. It lives here
  // rather than in the code because moving it is the school's decision, taken on
  // their own promotion day — not something they should wait for a release for.
  currentSession: string;
  // The session in use before the last change, so starting a new year can be put
  // back with one click — the same reversibility promotion already has. Set only
  // when the session actually moves.
  previousSession?: string;
  sessionChangedAt?: Date;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schoolSettingSchema = new Schema<ISchoolSetting>(
  {
    highestClass: { type: String, default: "12", trim: true },
    currentSession: { type: String, default: DEFAULT_SESSION, trim: true },
    previousSession: { type: String, trim: true },
    sessionChangedAt: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const SchoolSetting = mongoose.model<ISchoolSetting>("SchoolSetting", schoolSettingSchema);

// There is only ever one settings document. Create it on first use so nothing has
// to be seeded at deploy time, and so a school that never touches the setting
// behaves exactly as it did before (up to Class 12).
export const getSchoolSetting = async (): Promise<ISchoolSetting> => {
  const existing = await SchoolSetting.findOne();
  if (existing) return existing;
  return SchoolSetting.create({});
};
