import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

type MigrationJournal = {
  version: string;
  dialect: string;
  entries: Array<{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
};

describe("engine assembling-state migration", () => {
  it("normalizes historical rows without losing durable control intent", () => {
    const workspaceMigrations = path.join(process.cwd(), "drizzle");
    const journal = JSON.parse(
      fs.readFileSync(path.join(workspaceMigrations, "meta", "_journal.json"), "utf8"),
    ) as MigrationJournal;
    const legacyEntries = journal.entries.filter((entry) => entry.idx < 45);
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-engine-state-"));
    const legacyFolder = path.join(sandbox, "legacy-migrations");
    fs.mkdirSync(path.join(legacyFolder, "meta"), { recursive: true });
    fs.writeFileSync(
      path.join(legacyFolder, "meta", "_journal.json"),
      JSON.stringify({ ...journal, entries: legacyEntries }),
    );

    for (const entry of legacyEntries) {
      fs.copyFileSync(
        path.join(workspaceMigrations, `${entry.tag}.sql`),
        path.join(legacyFolder, `${entry.tag}.sql`),
      );
    }

    const sqlite = new Database(path.join(sandbox, "upgrade.db"));

    try {
      const database = drizzle(sqlite);
      migrate(database, { migrationsFolder: legacyFolder });
      sqlite.prepare(`
        INSERT INTO users (id, email, display_name, password_hash)
        VALUES ('migration-user', 'migration@example.test', 'Migration', 'hash')
      `).run();
      const insert = sqlite.prepare(`
        INSERT INTO engine_downloads
          (id, user_id, name, state, control_intent, nzb_xml, bytes_per_second)
        VALUES
          (?, 'migration-user', ?, 'assembling', ?, '<nzb/>', 1024)
      `);
      insert.run("running", "Running", null);
      insert.run("pausing", "Pausing", "pause");
      insert.run("cancelling", "Cancelling", "cancel");

      migrate(database, { migrationsFolder: workspaceMigrations });

      const rows = sqlite.prepare(`
        SELECT id, state, control_intent AS controlIntent,
          bytes_per_second AS bytesPerSecond
        FROM engine_downloads
        ORDER BY id
      `).all();

      expect(rows).toEqual([
        {
          id: "cancelling",
          state: "queued",
          controlIntent: "cancel",
          bytesPerSecond: null,
        },
        {
          id: "pausing",
          state: "paused",
          controlIntent: null,
          bytesPerSecond: null,
        },
        {
          id: "running",
          state: "queued",
          controlIntent: null,
          bytesPerSecond: null,
        },
      ]);
    } finally {
      sqlite.close();
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
