import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { User } from "./models/User";

// Creates the initial super admin account. Run with: npm run seed
const run = async () => {
  await connectDB();

  const email = "superadmin@school.com";
  const existing = await User.findOne({ email }).select("+password");

  if (existing) {
    // Make sure the account matches the current schema (role/password).
    existing.name = "Super Admin";
    existing.role = "superadmin";
    existing.password = "super123";
    await existing.save();
    console.log("Super admin updated:", email);
  } else {
    await User.create({
      name: "Super Admin",
      email,
      password: "super123",
      role: "superadmin",
    });
    console.log("Super admin created:", email);
  }

  console.log("Login -> Email: superadmin@school.com  Password: super123");

  await mongoose.disconnect();
  process.exit(0);
};

run();
