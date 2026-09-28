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
});

function getSeedCredentials(): { email: string; password: string } {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (email === undefined || email.trim() === "") {
    throw new Error("ADMIN_SEED_EMAIL is required.");
  }
  if (password === undefined || password === "") {
    throw new Error("ADMIN_SEED_PASSWORD is required.");
  }

  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  return parsed.data;
}

async function seedAdmin(): Promise<void> {
  const credentials = getSeedCredentials();
  const emailNormalized = normalizeAdminEmail(credentials.email);
  const passwordHash = await argon2.hash(credentials.password, { type: argon2.argon2id });
  const mongodbUri = process.env.MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017/terqivo_connect";

  try {
    await connectDatabase({ MONGODB_URI: mongodbUri });

    await AdminUserModel.findOneAndUpdate(
      { emailNormalized },
      {
        $set: {
          emailNormalized,
          displayName: "Terqivo Administrator",
          passwordHash,
          role: "super_admin",
          permissions: [...adminPermissions],
          accountStatus: "active",
        },
        $setOnInsert: {
          lastLoginAt: null,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).exec();

    console.log("Admin seed completed successfully.");
  } finally {
    await disconnectDatabase();
  }
}

void seedAdmin().catch((error: unknown) => {
  if (error instanceof Error && (error.message.startsWith("ADMIN_SEED_") || error.message.includes("must be a valid email") || error.message.includes("must be at least"))) {
    console.error(`Admin seed failed: ${error.message}`);
  } else {
    console.error("Admin seed failed. Check the admin-server database configuration and connectivity.");
  }
  process.exitCode = 1;
});
