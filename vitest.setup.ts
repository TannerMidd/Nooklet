import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll } from "vitest";

// Provide a deterministic AUTH_SECRET for tests so the env schema validates.
// This value is only used during Vitest runs and never reaches a real environment.
process.env.AUTH_SECRET ??= "test-auth-secret-must-be-at-least-32-chars-long";

if (!process.env.NODE_ENV) {
    (process.env as Record<string, string>).NODE_ENV = "test";
}

// Every suite receives its own database. Module isolation alone is not enough:
// separate test files can otherwise share the same process-level DATABASE_URL
// and make persisted instance configuration leak between unrelated suites.
const originalDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseDirectory = mkdtempSync(join(tmpdir(), "nooklet-test-"));

process.env.DATABASE_URL = `file:${join(testDatabaseDirectory, "test.db")}`;

afterAll(() => {
    const databaseGlobals = globalThis as typeof globalThis & {
        __nookletDatabase?: { sqlite?: { close(): void } };
    };

    try {
        databaseGlobals.__nookletDatabase?.sqlite?.close();
    } catch {
        // A database-specific test may already have closed the shared handle.
    }

    delete databaseGlobals.__nookletDatabase;

    rmSync(testDatabaseDirectory, { recursive: true, force: true });

    if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
    } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
    }
});
