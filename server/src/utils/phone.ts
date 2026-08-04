// Phone numbers are the primary login ID for parents and teachers, so the same
// number must always normalise to the same string no matter how it was typed:
// "+91 98765-43210", "098765 43210" and "9876543210" are one number.
//
// We keep the last 10 digits (Indian mobile numbers), which drops a +91/91/0
// prefix and any spaces, dashes or brackets.
export const normalizePhone = (raw: unknown): string => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// A usable Indian mobile number: exactly 10 digits starting 6-9.
export const isValidPhone = (raw: unknown): boolean => /^[6-9]\d{9}$/.test(normalizePhone(raw));

// Does this look like someone typing a phone number rather than an email?
export const looksLikePhone = (raw: unknown): boolean => {
  const s = String(raw ?? "").trim();
  if (s.includes("@")) return false;
  return /^[\d\s\-()+]+$/.test(s) && normalizePhone(s).length >= 10;
};
