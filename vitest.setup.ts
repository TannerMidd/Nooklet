import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Provide a deterministic AUTH_SECRET for tests so the env schema validates.
// This value is only used during Vitest runs and never reaches a real environment.
process.env.AUTH_SECRET ??= "test-auth-secret-must-be-at-least-32-chars-long";
if (!process.env.NODE_ENV) {
  (process.env as Record<string, string>).NODE_ENV = "test";
}

// Isolate the test database from the developer's local SQLite file. Each test
// run gets a fresh temp directory so migrations apply cleanly.
if (!process.env.DATABASE_URL) {
  const dir = mkdtempSync(join(tmpdir(), "nooklet-test-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
}
