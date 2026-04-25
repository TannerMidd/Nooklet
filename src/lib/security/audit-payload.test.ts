import { describe, expect, it } from "vitest";

import { buildAuditPayload } from "@/lib/security/audit-payload";

describe("buildAuditPayload", () => {
  it("returns null for null/undefined", () => {
    expect(buildAuditPayload(null)).toBeNull();
    expect(buildAuditPayload(undefined)).toBeNull();
  });

  it("redacts sensitive top-level keys", () => {
    const payload = buildAuditPayload({
      email: "user@example.com",
      password: "hunter2",
      apiKey: "sk-abc",
      token: "jwt.value",
      authorization: "Bearer xyz",
    });

    const parsed = JSON.parse(payload!);
    expect(parsed.email).toBe("user@example.com");
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.token).toBe("[REDACTED]");
    expect(parsed.authorization).toBe("[REDACTED]");
  });

  it("redacts nested sensitive keys and case-insensitive variants", () => {
    const payload = buildAuditPayload({
      connection: {
        baseUrl: "https://example.test",
        API_Key: "sk-deep",
        sessionToken: "abc",
      },
      list: [{ secret: "shh" }, { ok: true }],
    });

    const parsed = JSON.parse(payload!);
    expect(parsed.connection.baseUrl).toBe("https://example.test");
    expect(parsed.connection.API_Key).toBe("[REDACTED]");
    expect(parsed.connection.sessionToken).toBe("[REDACTED]");
    expect(parsed.list[0].secret).toBe("[REDACTED]");
    expect(parsed.list[1].ok).toBe(true);
  });

  it("handles primitive payloads", () => {
    expect(buildAuditPayload("hello")).toBe(JSON.stringify("hello"));
    expect(buildAuditPayload(42)).toBe("42");
  });
});
