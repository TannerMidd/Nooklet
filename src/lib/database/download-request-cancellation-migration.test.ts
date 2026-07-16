import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

describe("download request cancellation migration", () => {
  it("adds the durable request checkpoint and pending-work index", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-request-cancel-"));
    const sqlite = new Database(path.join(sandbox, "fresh.db"));

    try {
      sqlite.pragma("foreign_keys = ON");
      migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });

      const columns = sqlite
        .prepare("PRAGMA table_info('download_requests')")
        .all() as Array<{ name: string }>;
      const indexes = sqlite
        .prepare("PRAGMA index_list('download_requests')")
        .all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toContain("cancellation_requested_at");
      expect(indexes.map((index) => index.name)).toContain(
        "download_requests_cancellation_pending_idx",
      );
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      sqlite.close();
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
