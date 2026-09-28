import "dotenv/config";

import argon2 from "argon2";
import { z } from "zod";

import { connectDatabase, disconnectDatabase } from "../database/mongo.js";
import { AdminUserModel } from "../models/admin-user.js";
import { adminPermissions } from "../modules/admin/contracts.js";
import { normalizeAdminEmail } from "../modules/admin/email.js";

const credentialsSchema = z.object({
  email: z.string().trim().email("ADMIN_SEED_EMAIL must be a valid email address"),
  password: z.string().min(12, "ADMIN_SEED_PASSWORD must be at least 12 characters long"),
  name: z.string().trim().min(1, "ADMIN_SEED_NAME is required").max(100, "ADMIN_SEED_NAME must be 100 characters or fewer"),
});

function getSeedCredentials(): { email: string; password: string; name: string } {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME;

  if (email === undefined || email.trim() === "") {
    throw new Error("ADMIN_SEED_EMAIL is required.");
  }
  if (password === undefined || password === "") {
    throw new Error("ADMIN_SEED_PASSWORD is required.");
  }
  if (name === undefined || name.trim() === "") {
    throw new Error("ADMIN_SEED_NAME is required.");
  }

  const parsed = credentialsSchema.safeParse({ email, password, name });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  return parsed.data;
}

async function seedAdmin(): Promise<void> {
  const credentials = getSeedCredentials();
  const emailNormalized = normalizeAdminEmail(credentials.email);
  const mongodbUri = process.env.MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017/terqivo_connect";

  try {
    await connectDatabase({ MONGODB_URI: mongodbUri });

    const existingAdmin = await AdminUserModel.exists({ emailNormalized });
    if (existingAdmin !== null) {
      console.log("Admin seed skipped: an admin with that email already exists.");
      return;
    }

    const passwordHash = await argon2.hash(credentials.password, { type: argon2.argon2id });
    try {
      await AdminUserModel.create({
        emailNormalized,
        displayName: credentials.name,
        passwordHash,
        role: "super_admin",
        permissions: [...adminPermissions],
        accountStatus: "active",
        lastLoginAt: null,
      });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        console.log("Admin seed skipped: an admin with that email already exists.");
        return;
      }
      throw error;
    }

    console.log("Admin seed created the initial admin account.");
  } finally {
    await disconnectDatabase();
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

void seedAdmin().catch((error: unknown) => {
  if (error instanceof Error && (error.message.startsWith("ADMIN_SEED_") || error.message.includes("must be a valid email") || error.message.includes("must be at least") || error.message.includes("100 characters or fewer"))) {
    console.error(`Admin seed failed: ${error.message}`);
  } else {
    console.error("Admin seed failed. Check the admin-server database configuration and connectivity.");
  }
  process.exitCode = 1;
});
