import { User } from "../models/User";
import { env } from "./env";

// Ensures a super admin account exists on startup, so there's no manual seed step.
export const ensureSuperAdmin = async (): Promise<void> => {
  const existing = await User.findOne({ role: "superadmin" });
  if (existing) return;

  await User.create({
    name: env.superAdmin.name,
    email: env.superAdmin.email,
    password: env.superAdmin.password,
    role: "superadmin",
  });

  console.log(
    `Super admin created -> ${env.superAdmin.email} / ${env.superAdmin.password}`
  );
};
