import { describe, expect, it } from "vitest";

import {
  createServiceAuth,
  createServiceAuthFromEnvironment,
  ServiceAuthError,
} from "../src/index.js";

const baseOptions = {
  serviceName: "gateway",
  issuer: "terqivo-internal",
  audience: "terqivo-services",
  secret: "01234567890123456789012345678901",
};

describe("internal service authentication", () => {
  it("issues and verifies a valid short-lived service token", async () => {
    const auth = createServiceAuth(baseOptions);
    const token = await auth.issueToken();
    const claims = await auth.verifyToken(token, {
      expectedServiceName: "gateway",
    });

    expect(claims.serviceName).toBe("gateway");
    expect(claims.iss).toBe("terqivo-internal");
    expect(claims.aud).toBe("terqivo-services");
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const auth = createServiceAuth(baseOptions);
    const wrongAuth = createServiceAuth({
      ...baseOptions,
      secret: "12345678901234567890123456789012",
    });
    const token = await wrongAuth.issueToken();

    await expect(auth.verifyToken(token)).rejects.toBeInstanceOf(ServiceAuthError);
  });

  it("rejects a token with the wrong audience", async () => {
    const auth = createServiceAuth(baseOptions);
    const token = await auth.issueToken({ audience: "other-service" });

    await expect(auth.verifyToken(token)).rejects.toBeInstanceOf(ServiceAuthError);
  });

  it("rejects an expired token", async () => {
    const auth = createServiceAuth({ ...baseOptions, clockToleranceSeconds: 0 });
    const token = await auth.issueToken({ ttlSeconds: 1 });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await expect(auth.verifyToken(token)).rejects.toBeInstanceOf(ServiceAuthError);
  });

  it("loads the secret only through the environment parser", async () => {
    const auth = createServiceAuthFromEnvironment({
      SERVICE_NAME: "message-server",
      INTERNAL_SERVICE_AUTH_ISSUER: "terqivo-internal",
      INTERNAL_SERVICE_AUTH_AUDIENCE: "terqivo-services",
      INTERNAL_SERVICE_AUTH_SECRET: baseOptions.secret,
    });
    const token = await auth.issueToken();

    await expect(auth.verifyToken(token)).resolves.toMatchObject({
      serviceName: "message-server",
    });
  });
});
