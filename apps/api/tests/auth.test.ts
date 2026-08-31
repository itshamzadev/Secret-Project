import request from "supertest";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";

import { env } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/database.js";
import { createApp } from "../src/app.js";
import {
  AuthSessionModel,
  type AuthSessionEntity,
} from "../src/modules/auth/auth-session.model.js";
import { verifyPassword } from "../src/modules/auth/auth.security.js";
import {
  hashRefreshToken,
  refreshTokenHashesMatch,
} from "../src/modules/auth/auth.tokens.js";
import { initializeAuthModels } from "../src/modules/auth/auth.service.js";
import { UserModel } from "../src/modules/users/user.model.js";

interface RegisterPayload {
  username: string;
  name: string;
  email?: string;
  phone: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
  platform?:
    "web" | "android" | "ios" | "windows" | "macos" | "linux" | "unknown";
}

const app = createApp();

function registrationPayload(
  overrides: Partial<RegisterPayload> = {},
): RegisterPayload {
  return {
    username: "Alice.Example",
    name: "Alice Example",
    email: "alice@example.com",
    phone: "+14155550101",
    password: "correct horse battery staple",
    deviceId: "browser-001",
    deviceName: "Chrome Web",
    platform: "web",
    ...overrides,
  };
}

async function register(overrides: Partial<RegisterPayload> = {}) {
  return request(app)
    .post("/api/v1/auth/register")
    .send(registrationPayload(overrides));
}

function authHeader(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

function authData(response: { body: { data: unknown } }) {
  return response.body.data as {
    user: {
      id: string;
      username: string;
      email: string;
      accountStatus: string;
    };
    session: { id: string; lastRefreshAt: string; expiresAt: string };
    accessToken: string;
    refreshToken: string;
  };
}

async function findSession(
  sessionId: string,
): Promise<AuthSessionEntity | null> {
  return AuthSessionModel.findOne({ sessionId })
    .select("+refreshTokenHash")
    .lean<AuthSessionEntity>()
    .exec();
}

beforeAll(async () => {
  if (
    env.NODE_ENV !== "test" ||
    !env.MONGODB_URI.includes("terqivo_connect_test")
  ) {
    throw new Error(
      "Auth tests require the dedicated terqivo_connect_test database",
    );
  }

  await connectDatabase();
  await initializeAuthModels();
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    AuthSessionModel.deleteMany({}),
  ]);
});

afterAll(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    AuthSessionModel.deleteMany({}),
  ]);
  await disconnectDatabase();
});

describe("registration", () => {
  it("creates a user and first hashed session", async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    const data = authData(response);
    expect(data.user.username).toBe("Alice.Example");
    expect(data.user.email).toBe("alice@example.com");
    expect(data.user).not.toHaveProperty("passwordHash");
    expect(data.user).not.toHaveProperty("refreshTokenHash");
    expect(data.session).not.toHaveProperty("ipAddress");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");

    const user = await UserModel.findOne({
      usernameNormalized: "alice.example",
    })
      .select("+passwordHash")
      .exec();
    expect(user).not.toBeNull();
    expect(user?.passwordHash).not.toBe(registrationPayload().password);
    expect(
      await verifyPassword(
        registrationPayload().password,
        user?.passwordHash ?? "",
      ),
    ).toBe(true);

    const session = await findSession(data.session.id);
    expect(session).not.toBeNull();
    expect(session?.refreshTokenHash).not.toBe(data.refreshToken);
    expect(
      refreshTokenHashesMatch(
        hashRefreshToken(data.refreshToken),
        session?.refreshTokenHash ?? "",
      ),
    ).toBe(true);
  });

  it("rejects invalid payloads", async () => {
    const response = await register({ password: "short" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns USERNAME_TAKEN for a normalized username conflict", async () => {
    await register();
    const response = await register({
      username: "alice.example",
      email: "different@example.com",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("USERNAME_TAKEN");
  });

  it("returns EMAIL_TAKEN for a normalized email conflict", async () => {
    await register();
    const response = await register({ username: "different_user" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("supports phone-first registration without email and phone login", async () => {
    const phoneRegistration = registrationPayload({
      username: "Phone.User",
      name: "Phone User",
      phone: "+14155550111",
    });
    delete phoneRegistration.email;
    const registration = await request(app)
      .post("/api/v1/auth/register")
      .send(phoneRegistration);
    const data = authData(registration);
    const login = await request(app).post("/api/v1/auth/login").send({
      identifier: "+1 (415) 555-0111",
      password: registrationPayload().password,
    });

    expect(registration.status).toBe(201);
    expect(data.user.email).toBeNull();
    expect(login.status).toBe(200);
  });

  it("rejects a normalized phone conflict", async () => {
    await register();
    const response = await register({
      username: "different_user",
      phone: "+1 (415) 555-0101",
      email: "different@example.com",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PHONE_TAKEN");
  });
});

describe("login and authentication", () => {
  it("logs in with a case-insensitive username or email", async () => {
    await register();
    const usernameLogin = await request(app).post("/api/v1/auth/login").send({
      identifier: "ALICE.EXAMPLE",
      password: registrationPayload().password,
      platform: "windows",
    });
    const emailLogin = await request(app).post("/api/v1/auth/login").send({
      identifier: " ALICE@EXAMPLE.COM ",
      password: registrationPayload().password,
      platform: "android",
    });

    expect(usernameLogin.status).toBe(200);
    expect(emailLogin.status).toBe(200);
    expect(authData(usernameLogin).accessToken).toEqual(expect.any(String));
    expect(authData(emailLogin).session.id).not.toBe(
      authData(usernameLogin).session.id,
    );
  });

  it("uses the same generic error for wrong and unknown credentials", async () => {
    await register();
    const wrongPassword = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "alice.example", password: "wrong-password" });
    const unknownIdentifier = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "nobody@example.com", password: "wrong-password" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownIdentifier.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownIdentifier.body);
  });

  it.each(["suspended", "disabled"] as const)(
    "does not authenticate a %s account",
    async (accountStatus) => {
      await register();
      await UserModel.updateOne(
        { usernameNormalized: "alice.example" },
        { $set: { accountStatus } },
      ).exec();

      const response = await request(app).post("/api/v1/auth/login").send({
        identifier: "alice.example",
        password: registrationPayload().password,
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(
        accountStatus === "suspended"
          ? "ACCOUNT_SUSPENDED"
          : "ACCOUNT_DISABLED",
      );
    },
  );

  it("rejects missing and invalid access tokens", async () => {
    const missing = await request(app).get("/api/v1/auth/me");
    const invalid = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not-a-jwt");

    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("accepts a valid access token and returns only the safe user DTO", async () => {
    const registration = await register();
    const data = authData(registration);
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set(authHeader(data.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      id: data.user.id,
      username: "Alice.Example",
      email: "alice@example.com",
      accountStatus: "active",
    });
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
  });
});

describe("refresh rotation", () => {
  it("rotates refresh tokens and revokes a session after reuse", async () => {
    const registration = await register();
    const original = authData(registration);
    const rotated = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: original.refreshToken });
    const rotatedData = authData(rotated);

    expect(rotated.status).toBe(200);
    expect(rotatedData.refreshToken).not.toBe(original.refreshToken);
    expect(rotatedData.accessToken).not.toBe(original.accessToken);
    expect(rotatedData.session.lastRefreshAt).toEqual(expect.any(String));
    expect(
      new Date(rotatedData.session.expiresAt).getTime(),
    ).toBeGreaterThanOrEqual(new Date(original.session.expiresAt).getTime());

    const oldTokenReuse = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: original.refreshToken });
    const currentTokenAfterReuse = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotatedData.refreshToken });

    expect(oldTokenReuse.status).toBe(401);
    expect(oldTokenReuse.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    expect(currentTokenAfterReuse.status).toBe(401);

    const session = await findSession(original.session.id);
    expect(session?.revokedAt).not.toBeNull();
    expect(session?.revokeReason).toBe("refresh_token_reuse");
  });
});

describe("session management", () => {
  it("lists only the current user's sessions and enforces ownership on revoke", async () => {
    const firstUser = authData(await register());
    const secondUser = authData(
      await request(app).post("/api/v1/auth/login").send({
        identifier: "alice.example",
        password: registrationPayload().password,
        deviceName: "Windows Desktop",
        platform: "windows",
      }),
    );
    const otherUser = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        email: "bob@example.com",
        phone: "+14155550102",
      }),
    );

    const sessions = await request(app)
      .get("/api/v1/auth/sessions")
      .set(authHeader(firstUser.accessToken));
    const crossUserRevoke = await request(app)
      .delete(`/api/v1/auth/sessions/${otherUser.session.id}`)
      .set(authHeader(firstUser.accessToken));

    expect(sessions.status).toBe(200);
    expect(sessions.body.data.sessions).toHaveLength(2);
    expect(sessions.body.data.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstUser.session.id, current: true }),
        expect.objectContaining({ id: secondUser.session.id, current: false }),
      ]),
    );
    expect(sessions.body.data.sessions[0]).not.toHaveProperty("ipAddress");
    expect(crossUserRevoke.status).toBe(404);

    const otherSession = await findSession(otherUser.session.id);
    expect(otherSession?.revokedAt).toBeNull();

    const ownRevoke = await request(app)
      .delete(`/api/v1/auth/sessions/${secondUser.session.id}`)
      .set(authHeader(firstUser.accessToken));
    expect(ownRevoke.status).toBe(200);
  });

  it("logs out the current session only", async () => {
    const registration = authData(await register());
    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set(authHeader(registration.accessToken));
    const meAfterLogout = await request(app)
      .get("/api/v1/auth/me")
      .set(authHeader(registration.accessToken));

    expect(logout.status).toBe(200);
    expect(logout.body.data.loggedOut).toBe(true);
    expect(meAfterLogout.status).toBe(401);
    expect((await findSession(registration.session.id))?.revokeReason).toBe(
      "logout",
    );
  });

  it("logs out all sessions including the current session", async () => {
    const firstSession = authData(await register());
    const secondSession = authData(
      await request(app).post("/api/v1/auth/login").send({
        identifier: "alice.example",
        password: registrationPayload().password,
      }),
    );
    const logoutAll = await request(app)
      .post("/api/v1/auth/logout-all")
      .set(authHeader(firstSession.accessToken));

    expect(logoutAll.status).toBe(200);
    expect(logoutAll.body.data.revokedCount).toBe(2);
    expect((await findSession(firstSession.session.id))?.revokeReason).toBe(
      "logout_all",
    );
    expect((await findSession(secondSession.session.id))?.revokeReason).toBe(
      "logout_all",
    );
  });
});
