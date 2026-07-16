import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

describe("engine download failure-kind migration", () => {
  it("adds the structured failure column to a fresh database", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-engine-failure-kind-"));
    const sqlite = new Database(path.join(sandbox, "fresh.db"));

    try {
      migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });

      const columns = sqlite
        .prepare("PRAGMA table_info('engine_downloads')")
        .all() as Array<{ name: string; type: string }>;

      expect(columns).toContainEqual(expect.objectContaining({
        name: "failure_kind",
        type: "TEXT",
      }));
    } finally {
      sqlite.close();
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
