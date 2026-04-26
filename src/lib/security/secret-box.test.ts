import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/security/secret-box";

describe("secret-box", () => {
  it("round-trips a value through encryptSecret/decryptSecret", () => {
    const ciphertext = encryptSecret("super-secret-api-key");
    expect(ciphertext).toMatch(/^v1:/);
    expect(decryptSecret(ciphertext)).toBe("super-secret-api-key");
  });

  it("rejects tampered payloads", () => {
    const ciphertext = encryptSecret("hello world");
    const segments = ciphertext.split(":");
    // Flip a bit in the payload.
    const payload = Buffer.from(segments[3]!, "base64");
    payload[0] ^= 0xff;
    segments[3] = payload.toString("base64");
    expect(() => decryptSecret(segments.join(":"))).toThrow();
  });

  it("decrypts legacy unversioned envelopes encrypted with AUTH_SECRET via SHA-256", () => {
    const legacyKey = createHash("sha256").update(env.AUTH_SECRET).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
    const ciphertext = Buffer.concat([cipher.update("legacy-value", "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const envelope = [
      iv.toString("base64"),
      authTag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(":");

    expect(decryptSecret(envelope)).toBe("legacy-value");
  });

  it("masks short and long secrets", () => {
    expect(maskSecret("ab")).toBe("**");
    expect(maskSecret("abcdefghijkl")).toBe("ab********kl");
  });

  it("rejects an envelope with a tampered IV", () => {
    const ciphertext = encryptSecret("payload");
    const segments = ciphertext.split(":");
    const iv = Buffer.from(segments[1]!, "base64");
    iv[0] ^= 0xff;
    segments[1] = iv.toString("base64");
    expect(() => decryptSecret(segments.join(":"))).toThrow();
  });

  it("rejects an envelope with a tampered auth tag", () => {
    const ciphertext = encryptSecret("payload");
    const segments = ciphertext.split(":");
    const tag = Buffer.from(segments[2]!, "base64");
    tag[0] ^= 0xff;
    segments[2] = tag.toString("base64");
    expect(() => decryptSecret(segments.join(":"))).toThrow();
  });

  it("rejects an envelope with an unknown version", () => {
    const ciphertext = encryptSecret("payload");
    const segments = ciphertext.split(":");
    segments[0] = "v999";
    expect(() => decryptSecret(segments.join(":"))).toThrow(/Unsupported secret envelope version/);
  });

  it("rejects malformed envelopes by segment count", () => {
    expect(() => decryptSecret("only-one-segment")).toThrow(/Invalid encrypted secret payload/);
    expect(() => decryptSecret("a:b")).toThrow(/Invalid encrypted secret payload/);
    expect(() => decryptSecret("v1:a:b:c:d")).toThrow(/Invalid encrypted secret payload/);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encryptSecret("identical");
    const b = encryptSecret("identical");
    expect(a).not.toBe(b);
    // But both must round-trip to the same value.
    expect(decryptSecret(a)).toBe("identical");
    expect(decryptSecret(b)).toBe("identical");
  });

  it("round-trips an empty string", () => {
    const ciphertext = encryptSecret("");
    expect(decryptSecret(ciphertext)).toBe("");
  });

  it("round-trips multi-byte unicode without corruption", () => {
    const value = "🔐 пароль — secrétÆ";
    const ciphertext = encryptSecret(value);
    expect(decryptSecret(ciphertext)).toBe(value);
  });

  it("masks values at every boundary length the implementation special-cases", () => {
    // Empty input still produces a single asterisk so the field never renders blank.
    expect(maskSecret("")).toBe("*");
    expect(maskSecret("a")).toBe("*");
    expect(maskSecret("abcd")).toBe("****");
    // Exactly five chars: takes the long-form branch with a 4-asterisk minimum middle.
    expect(maskSecret("abcde")).toBe("ab****de");
    // Exactly nine chars: middle expands to 5 asterisks.
    expect(maskSecret("abcdefghi")).toBe("ab*****hi");
  });
});

describe("secret-box key isolation", () => {
  // Verifies that ciphertext encrypted under one key material cannot be
  // decrypted with a different key. This is the property that makes
  // SECRET_BOX_KEY rotation safe (rotating to a new key invalidates the old
  // ciphertexts cleanly rather than silently producing garbage plaintext).
  it("fails to decrypt a payload when the underlying key material changes", async () => {
    const { vi } = await import("vitest");

    const ciphertextWithOriginalKey = encryptSecret("rotation-target");

    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: {
        AUTH_SECRET: "rotated-test-auth-secret-must-be-32-chars-long-xx",
        SECRET_BOX_KEY: "rotated-test-secret-box-key-must-be-32-chars-long",
        ALLOW_PRIVATE_SERVICE_HOSTS: false,
        DATABASE_URL: process.env.DATABASE_URL,
      },
    }));

    try {
      const rotated = await import("@/lib/security/secret-box");
      expect(() => rotated.decryptSecret(ciphertextWithOriginalKey)).toThrow();
    } finally {
      vi.doUnmock("@/lib/env");
      vi.resetModules();
    }
  });
});
