export type Role = "superadmin" | "admin" | "teacher" | "parent" | "student";

export type AttendanceStatus = "present" | "absent";

export interface TeacherAssignment {
  class: string;
  section: string;
  session: string;
}

export interface Teacher {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  gender?: string;
  designation?: string;
  employeeCode?: string;
  joiningDate?: string;
  isActive: boolean;
  user?: string; // linked login id, present once they've signed up
  assignments: TeacherAssignment[];
  createdAt?: string;
}

export interface Holiday {
  _id: string;
  dateKey: string;
  date: string;
  name: string;
  session: string;
}

export interface AttendanceRow {
  _id: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  status: AttendanceStatus | null;
  present: number;
  absent: number;
  pct: number | null;
}

export interface RosterDay {
  class: string;
  section: string;
  date: string;
  dayInfo: { sunday: boolean; holiday: boolean; holidayName: string | null };
  students: AttendanceRow[];
  counts: {
    present: number;
    absent: number;
    unmarked: number;
    total: number;
    classAvgPct: number | null;
  };
}

export interface Staff {
  _id: string;
  name: string;
  category: string;
  designation?: string;
  phone?: string;
  gender?: string;
  employeeCode?: string;
  joiningDate?: string;
  isActive: boolean;
}

export interface StaffPerson {
  _id: string;
  kind: "teacher" | "staff";
  name: string;
  category: string;
  role: string;
  status: AttendanceStatus | null;
  present: number;
  absent: number;
  pct: number | null;
}

export interface StaffRosterDay {
  date: string;
  dayInfo: { sunday: boolean; holiday: boolean; holidayName: string | null };
  people: StaffPerson[];
  counts: { present: number; absent: number; unmarked: number; total: number; avgPct: number | null };
}

export interface TrashItem {
  _id: string;
  kind: string;
  originalId: string;
  label: string;
  deletedByName?: string;
  createdAt: string;
}

export interface PromotionRun {
  _id: string;
  fromSession: string;
  fromClass: string;
  fromSection?: string;
  toSession: string;
  summary: string;
  undone: boolean;
  byName?: string;
  createdAt: string;
  entries?: unknown[];
}

export interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  createdAt?: string;
}

export interface Enrollment {
  session: string;
  class: string;
  section?: string;
}

export interface Student {
  _id: string;
  admissionNo: string;
  name: string;
  dateOfAdmission?: string;
  session?: string;
  class: string;
  section?: string;
  rollNo?: string;
  gender?: string;
  category: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  optedServices?: string[];
  enrollmentHistory?: Enrollment[];
  status: "active" | "left" | "inactive";
  exitDate?: string;
  exitReason?: string;
  createdAt?: string;
}

export interface FeeHead {
  _id: string;
  name: string;
  description?: string;
  optional: boolean;
  isActive: boolean;
}

export interface StructureItem {
  name: string;
  amount: number;
  optional: boolean;
}

export interface FeeStructure {
  _id: string;
  name: string;
  class: string;
  academicYear: string;
  items: StructureItem[];
  totalAmount: number;
}

export interface Invoice {
  _id: string;
  student: Student;
  class: string;
  academicYear: string;
  period: string;
  periodLabel: string;
  dueDate?: string;
  items: { name: string; amount: number }[];
  concessions: { reason: string; amount: number }[];
  totalAmount: number;
  discountAmount: number;
  fineAmount: number;
  lateFee?: number;
  netAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: "unpaid" | "partial" | "paid";
  createdAt?: string;
}

export interface Payment {
  _id: string;
  student: Student;
  invoice: string;
  amount: number;
  mode: "cash" | "cheque" | "upi" | "online";
  platformCharge?: number;
  receiptNo: string;
  collectedBy?: { name: string };
  note?: string;
  createdAt?: string;
}

// ---- Subjects, exams & results ----

export interface Subject {
  _id: string;
  name: string;
  code?: string;
  applicableClasses: string[];
  order: number;
  isActive: boolean;
}

export interface ExamSubject {
  subject: string;
  name: string;
  maxMarks: number;
  passMarks: number;
}

export interface Exam {
  _id: string;
  name: string;
  type: string;
  session: string;
  class: string;
  weight: number;
  subjects: ExamSubject[];
  published: boolean;
  publishedAt?: string;
  createdAt?: string;
}

export interface SubjectResult {
  subject: string;
  name: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  absent: boolean;
  entered: boolean;
  passed: boolean;
}

export interface StudentResult {
  student: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  section: string;
  subjects: SubjectResult[];
  total: number;
  maxTotal: number;
  pct: number;
  entered: number;
  complete: boolean;
  passed: boolean;
  rank: number | null;
}

export interface ExamResults {
  exam: Exam;
  meta: { maxTotal: number; classSize: number; total: number; completed: number; pending: number };
  rows: StudentResult[];
}

export interface OverallRow {
  student: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  section: string;
  breakdown: {
    examId: string;
    name: string;
    type: string;
    weight: number;
    pct: number | null;
    rank: number | null;
    complete: boolean;
  }[];
  overallPct: number | null;
  complete: boolean;
  rank: number | null;
}

export interface OverallResults {
  session: string;
  class: string;
  exams: { _id: string; name: string; type: string; weight: number }[];
  totalWeight: number;
  classSize: number;
  rows: OverallRow[];
}

export interface ExamEntryStudent {
  _id: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  marks: Record<string, { marksObtained: number | null; absent: boolean }>;
}

export interface ExamEntry {
  exam: {
    _id: string;
    name: string;
    type: string;
    class: string;
    session: string;
    published: boolean;
    weight: number;
    subjects: ExamSubject[];
  };
  section: string;
  students: ExamEntryStudent[];
}

export interface PortalExamResult {
  examId: string;
  name: string;
  type: string;
  weight: number;
  subjects: SubjectResult[];
  total: number;
  maxTotal: number;
  pct: number;
  rank: number | null;
  classSize: number;
  complete: boolean;
  passed: boolean;
}

export interface PortalStudentResult {
  student: {
    _id: string;
    name: string;
    admissionNo: string;
    class: string;
    section: string;
    rollNo: string;
    session: string;
  };
  exams: PortalExamResult[];
  overall: { pct: number | null; rank: number | null; classSize: number; complete: boolean } | null;
}

export interface AppConfig {
  schoolName: string;
  razorpayKeyId: string;
  upiVpa: string;
  upiName: string;
  onlinePlatformFee: number;
  lateFeePerDay?: number;
  lateFeeMax?: number;
}

// ---- Admissions ----

export type AdmissionStatus = "pending" | "approved" | "rejected";

export interface Admission {
  _id: string;
  applicationNo: string;
  studentName: string;
  gender?: string;
  dateOfBirth?: string;
  applyingForClass: string;
  session: string;
  previousSchool?: string;
  category: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  address?: string;
  message?: string;
  status: AdmissionStatus;
  reviewNote?: string;
  reviewedAt?: string;
  convertedStudent?:
    | { _id: string; name: string; admissionNo: string; class: string; section?: string }
    | string;
  createdAt: string;
}

// ---- Timetable ----

export interface PeriodSlot {
  period: number;
  label: string;
  start: string;
  end: string;
  isBreak: boolean;
}

export interface TimetableConfig {
  periods: PeriodSlot[];
  workingDays: number[];
}

export interface TimetableSlot {
  day: number;
  period: number;
  subject?: string;
  subjectName: string;
  teacher?: string;
  teacherName: string;
  room?: string;
}

export interface ClassTimetable {
  _id?: string;
  class: string;
  section: string;
  session: string;
  slots: TimetableSlot[];
}

export interface TeacherTTEntry {
  day: number;
  period: number;
  class: string;
  section: string;
  subjectName: string;
  room?: string;
}

export interface ExamPaper {
  subject?: string;
  subjectName: string;
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
}

export interface ExamTimetable {
  _id?: string;
  exam: string;
  session?: string;
  class?: string;
  examName?: string;
  papers: ExamPaper[];
}
