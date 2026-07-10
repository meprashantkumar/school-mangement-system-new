import { Payment } from "../models/Payment";

// Simple sequential receipt number, e.g. RCP-00001.
export const nextReceiptNo = async (): Promise<string> => {
  const count = await Payment.countDocuments();
  return "RCP-" + String(count + 1).padStart(5, "0");
};
