import { asyncHandler } from "../utils/asyncHandler";
import { Invoice } from "../models/Invoice";
import { Payment } from "../models/Payment";
import { syncInvoiceLateFee } from "../utils/lateFee";
import { childStudentIds, findChildren } from "../utils/children";
import { resultsForStudents } from "./exam.controller";

// GET /api/portal/students
export const getMyStudents = asyncHandler(async (req, res) => {
  const students = await findChildren(req.user!);
  res.json({ students });
});

// GET /api/portal/invoices
export const getMyInvoices = asyncHandler(async (req, res) => {
  const ids = await childStudentIds(req.user!);
  const invoices = await Invoice.find({ student: { $in: ids } })
    .populate("student", "name admissionNo class section")
    .sort({ createdAt: -1 });
  for (const inv of invoices) await syncInvoiceLateFee(inv); // keep late fees current
  res.json({ invoices });
});

// GET /api/portal/payments
export const getMyPayments = asyncHandler(async (req, res) => {
  const ids = await childStudentIds(req.user!);
  const payments = await Payment.find({ student: { $in: ids } })
    .populate("student", "name admissionNo")
    .sort({ createdAt: -1 });
  res.json({ payments });
});

// GET /api/portal/results — published exam results + report-card data for the
// parent's children (nothing shows until an admin publishes the exam).
export const getMyResults = asyncHandler(async (req, res) => {
  const students = await findChildren(req.user!);
  const results = await resultsForStudents(students);
  res.json({ results });
});
