// Exam types and their default relative weights in the weighted overall/final rank
// (e.g. 10%·UnitTest + 40%·HalfYearly + 50%·Annual — admin can override per exam).
export interface ExamType {
  value: string;
  label: string;
  weight: number;
}

export const EXAM_TYPES: ExamType[] = [
  { value: "unit", label: "Unit Test", weight: 10 },
  { value: "halfyearly", label: "Half-Yearly Exam", weight: 40 },
  { value: "annual", label: "Annual Exam", weight: 50 },
  { value: "other", label: "Other", weight: 10 },
];

export const defaultWeightFor = (type: string): number =>
  EXAM_TYPES.find((t) => t.value === type)?.weight ?? 10;

// Standard pass mark = 33% of the subject's max (rounded up), overridable per subject.
export const PASS_PERCENT = 33;
export const defaultPassMarks = (max: number): number => Math.ceil((max * PASS_PERCENT) / 100);

// Round to 2 decimals for display/ranking stability.
export const round2 = (n: number): number => Math.round(n * 100) / 100;
