import { adminPermissions, adminRoles } from "@terqivo/contracts";
import { connectDatabase, disconnectDatabase } from "../../lib/database.js";
import { hashPassword } from "../auth/auth.security.js";
import { env } from "../../config/env.js";
import { AdminUserModel } from "./admin-user.model.js";

async function bootstrap(): Promise<void> {
  const email = env.ADMIN_BOOTSTRAP_EMAIL;
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;
  const displayName = env.ADMIN_BOOTSTRAP_DISPLAY_NAME;

  if (
    email === undefined ||
    password === undefined ||
    displayName === undefined
  ) {
    throw new Error(
      "ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD, and ADMIN_BOOTSTRAP_DISPLAY_NAME are required for admin bootstrap.",
    );
  }
  if (password.length < 12) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.");
  }

  await connectDatabase();
  await AdminUserModel.init();
  const existing = await AdminUserModel.findOne({
    emailNormalized: email.trim().toLowerCase(),
  }).exec();
  if (existing !== null) {
    throw new Error("An administrator with this email already exists.");
  }

  await AdminUserModel.create({
    emailNormalized: email.trim().toLowerCase(),
    displayName: displayName.trim(),
    passwordHash: await hashPassword(password),
    role: adminRoles[0],
    permissions: [...adminPermissions],
    accountStatus: "active",
    lastLoginAt: null,
  });
  console.log("Admin bootstrap completed for the configured email address.");
}

try {
  await bootstrap();
  await disconnectDatabase();
} catch (error: unknown) {
  console.error(
    error instanceof Error ? error.message : "Admin bootstrap failed.",
  );
  await disconnectDatabase();
  process.exitCode = 1;
}
