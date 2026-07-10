import type { Role } from "@/types";

/** Where each role lands after login / when clicking "Go to app". */
export const landingPath = (role: Role): string => {
  if (role === "superadmin" || role === "admin") return "/admin/dashboard";
  if (role === "teacher") return "/teacher";
  return "/portal"; // parent / student
};
