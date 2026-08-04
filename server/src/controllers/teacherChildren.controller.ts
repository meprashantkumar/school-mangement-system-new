import { asyncHandler } from "../utils/asyncHandler";
import { Invoice } from "../models/Invoice";
import { syncInvoiceLateFee } from "../utils/lateFee";
import { childStudentIds, findChildren } from "../utils/children";

// A teacher whose own child studies here (the "staff ward" case) shares one login
// for both roles — the role resolves to teacher, so without this they'd lose sight
// of their child's fees. Same data as the parent portal, reached from the teacher
// dashboard. Returns an empty list for teachers with no children enrolled.

// GET /api/teacher/children
export const getMyChildren = asyncHandler(async (req, res) => {
  const students = await findChildren(req.user!);
  res.json({ students });
});

// GET /api/teacher/children/invoices
export const getMyChildrenInvoices = asyncHandler(async (req, res) => {
  const ids = await childStudentIds(req.user!);
  const invoices = await Invoice.find({ student: { $in: ids } })
    .populate("student", "name admissionNo class section")
    .sort({ createdAt: -1 });
  for (const inv of invoices) await syncInvoiceLateFee(inv);
  res.json({ invoices });
});
