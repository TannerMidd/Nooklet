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

describe("migration repair coverage", () => {
  it("repairs media_request_attempts for installations that skipped migration 0030", () => {
    const workspaceMigrations = path.join(process.cwd(), "drizzle");
    const journal = JSON.parse(
      fs.readFileSync(path.join(workspaceMigrations, "meta", "_journal.json"), "utf8"),
    ) as MigrationJournal;
    const cutoff = journal.entries.find((entry) => entry.idx === 29)!;
    const legacyEntries = journal.entries
      .filter((entry) => entry.idx <= cutoff.idx)
      .map((entry) => ({
        ...entry,
        // Build a representative database whose latest applied timestamp is
        // 0029. Migration 0030's historical timestamp is earlier and will be
        // skipped when the current journal is subsequently applied.
        when: cutoff.when - (cutoff.idx - entry.idx),
      }));

    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-migration-repair-"));
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
      expect(
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get("media_request_attempts"),
      ).toBeUndefined();

      migrate(database, { migrationsFolder: workspaceMigrations });

      expect(
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get("media_request_attempts"),
      ).toBeTruthy();

      const indexes = sqlite.prepare("PRAGMA index_list('media_request_attempts')")
        .all() as Array<{ name: string }>;
      expect(indexes.map((row) => row.name)).toEqual(expect.arrayContaining([
        "media_request_attempts_user_key_unique",
        "media_request_attempts_expires_idx",
      ]));
    } finally {
      sqlite.close();
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
