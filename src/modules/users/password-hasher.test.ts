import { describe, expect, it } from "vitest";

import {
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from "@/modules/users/password-hasher";

describe("password hasher", () => {
  it("creates a versioned, salted hash using the current work factors", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");

    expect(first).toMatch(/^scrypt\$2\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(second).not.toBe(first);
    expect(passwordHashNeedsUpgrade(first)).toBe(false);
    await expect(verifyPassword("correct horse battery staple", first)).resolves.toBe(true);
    await expect(verifyPassword("wrong", first)).resolves.toBe(false);
  });

  it("verifies legacy hashes and marks them for a transparent upgrade", async () => {
    const { scrypt } = await import("node:crypto");
    const salt = "0123456789abcdef0123456789abcdef";
    const derived = await new Promise<Buffer>((resolve, reject) => {
      scrypt("legacy-password", salt, 64, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
    const legacy = `scrypt$${salt}$${derived.toString("hex")}`;

    await expect(verifyPassword("legacy-password", legacy)).resolves.toBe(true);
    expect(passwordHashNeedsUpgrade(legacy)).toBe(true);
  });

  it("rejects malformed or attacker-controlled work-factor encodings", async () => {
    await expect(verifyPassword("password", "scrypt$2$999999999$8$3$salt$key"))
      .resolves.toBe(false);
  });
});
