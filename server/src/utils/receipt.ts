import { Payment } from "../models/Payment";

// Sequential receipt number, e.g. RCP-00001.
//
// Derived from the HIGHEST number already issued, not from how many payments exist.
// A count walks backwards the moment a payment stops being there — a restore that
// skips duplicates, a future cleanup — and then hands out a number that is already
// on a printed receipt. Receipt numbers are unique in the database, so the insert
// fails; and because a count is deterministic, retrying recomputes the same number
// and fails again. The office would find they simply cannot take money.
//
// Reading the maximum has neither problem: a gap is harmless, and a retry after a
// collision (two counters at once) picks up the number the winner just took.
export const nextReceiptNo = async (): Promise<string> => {
  // Compared as a number, not as text: past 99999 the digits grow and "RCP-100000"
  // sorts BEFORE "RCP-99999" as a string.
  const [highest] = await Payment.aggregate<{ n: number }>([
    { $match: { receiptNo: { $regex: /^RCP-\d+$/ } } },
    { $project: { n: { $toInt: { $substrBytes: ["$receiptNo", 4, 32] } } } },
    { $sort: { n: -1 } },
    { $limit: 1 },
  ]);
  const next = (highest?.n || 0) + 1;
  return "RCP-" + String(next).padStart(5, "0");
};
