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
});
