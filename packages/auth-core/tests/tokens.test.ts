import { beforeAll, describe, expect, it } from "vitest";

import {
  configureAuthCore,
  createAccessToken,
  hashRefreshToken,
  refreshTokenHashesMatch,
  verifyAccessToken,
  verifyPassword,
  hashPassword,
} from "../src/index.js";

beforeAll(() => {
  configureAuthCore({
    jwtAccessSecret: "test-access-secret-that-is-longer-than-32-characters",
    jwtRefreshSecret: "test-refresh-secret-that-is-longer-than-32-characters",
    jwtIssuer: "terqivo-connect",
    jwtAudience: "terqivo-clients",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 365,
  });
});

describe("auth-core token and password compatibility", () => {
  it("preserves the existing access-token claims", async () => {
    const token = await createAccessToken("507f1f77bcf86cd799439011", "session-1");
    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe("507f1f77bcf86cd799439011");
    expect(claims.sid).toBe("session-1");
    expect(claims.iss).toBe("terqivo-connect");
    expect(claims.aud).toBe("terqivo-clients");
  });

  it("compares refresh hashes without accepting a different token", () => {
    const first = hashRefreshToken("session-1.secret-a");
    const same = hashRefreshToken("session-1.secret-a");
    const different = hashRefreshToken("session-1.secret-b");
    expect(refreshTokenHashesMatch(first, same)).toBe(true);
    expect(refreshTokenHashesMatch(first, different)).toBe(false);
  });

  it("keeps Argon2id password verification behavior", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});
