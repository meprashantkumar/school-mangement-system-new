import { asyncHandler } from "../utils/asyncHandler";
import { Student } from "../models/Student";
import { Invoice } from "../models/Invoice";
import { Payment } from "../models/Payment";
import { syncInvoiceLateFee } from "../utils/lateFee";
import { resultsForStudents } from "./exam.controller";

// Students linked to the logged-in parent (matched by parent email).
const childStudentIds = async (email: string) => {
  const students = await Student.find({ parentEmail: email }).select("_id");
  return students.map((s) => s._id);
};

// GET /api/portal/students
export const getMyStudents = asyncHandler(async (req, res) => {
  const students = await Student.find({ parentEmail: req.user!.email }).sort({ name: 1 });
  res.json({ students });
});

// GET /api/portal/invoices
export const getMyInvoices = asyncHandler(async (req, res) => {
  const ids = await childStudentIds(req.user!.email);
  const invoices = await Invoice.find({ student: { $in: ids } })
    .populate("student", "name admissionNo class section")
    .sort({ createdAt: -1 });
  for (const inv of invoices) await syncInvoiceLateFee(inv); // keep late fees current
  res.json({ invoices });
});

// GET /api/portal/payments
export const getMyPayments = asyncHandler(async (req, res) => {
  const ids = await childStudentIds(req.user!.email);
  const payments = await Payment.find({ student: { $in: ids } })
    .populate("student", "name admissionNo")
    .sort({ createdAt: -1 });
  res.json({ payments });
});

// GET /api/portal/results — published exam results + report-card data for the
// parent's children (nothing shows until an admin publishes the exam).
export const getMyResults = asyncHandler(async (req, res) => {
  const students = await Student.find({ parentEmail: req.user!.email }).sort({ name: 1 });
  const results = await resultsForStudents(students);
  res.json({ results });
});
