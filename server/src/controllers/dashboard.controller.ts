import { asyncHandler } from "../utils/asyncHandler";
import { User } from "../models/User";
import { Student } from "../models/Student";
import { Invoice } from "../models/Invoice";
import { Payment } from "../models/Payment";
import { Teacher } from "../models/Teacher";

// GET /api/admin/stats
export const getStats = asyncHandler(async (_req, res) => {
  const [totalUsers, totalStudents, totalTeachers, dueAgg, paidAgg] = await Promise.all([
    User.countDocuments(),
    Student.countDocuments(),
    Teacher.countDocuments({ isActive: true }),
    Invoice.aggregate([{ $group: { _id: null, total: { $sum: "$dueAmount" } } }]),
    Payment.aggregate([
      { $match: { voided: { $ne: true } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  res.json({
    stats: {
      totalStudents,
      totalTeachers,
      totalUsers,
      totalOutstanding: dueAgg[0]?.total || 0,
      totalCollected: paidAgg[0]?.total || 0,
    },
  });
});
