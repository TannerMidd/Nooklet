import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type MigrationJournal = {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

const drizzleFolderPath = join(process.cwd(), "drizzle");
const journalPath = join(drizzleFolderPath, "meta", "_journal.json");
const originalDatabaseUrl = process.env.DATABASE_URL;
const tempDirectories: string[] = [];

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirectories.push(directory);

  return directory;
}

function createLegacyMigrationsFolder(lastMigrationIndex: number) {
  const directory = createTempDirectory("nooklet-legacy-migrations-");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as MigrationJournal;
  const filteredEntries = journal.entries.filter((entry) => entry.idx <= lastMigrationIndex);

  cpSync(join(drizzleFolderPath, "meta"), join(directory, "meta"), { recursive: true });
  writeFileSync(
    join(directory, "meta", "_journal.json"),
    JSON.stringify(
      {
        ...journal,
        entries: filteredEntries,
      } satisfies MigrationJournal,
      null,
      2,
    ),
  );

  for (const entry of filteredEntries) {
    cpSync(join(drizzleFolderPath, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
  }

  return directory;
}

function seedDatabaseThroughMigration(lastMigrationIndex: number, databasePath: string) {
  const legacyMigrationsFolder = createLegacyMigrationsFolder(lastMigrationIndex);
  const sqlite = new Database(databasePath);
  const database = drizzle(sqlite);

  migrate(database, {
    migrationsFolder: legacyMigrationsFolder,
  });

  sqlite.close();
}

function hasTableColumn(databasePath: string, tableName: string, columnName: string) {
  const sqlite = new Database(databasePath, { readonly: true });

  try {
    const columns = sqlite.prepare(`PRAGMA table_info("${tableName.replaceAll('"', '""')}")`).all() as Array<{
      name: string;
    }>;

    return columns.some((column) => column.name === columnName);
  } finally {
    sqlite.close();
  }
}

describe("ensureDatabaseReady", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as typeof globalThis & { __nookletDatabase?: unknown })
      .__nookletDatabase;
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    const databaseState = (globalThis as typeof globalThis & {
      __nookletDatabase?: {
        sqlite?: Database.Database;
      };
    }).__nookletDatabase;

    databaseState?.sqlite?.close();
    delete (globalThis as typeof globalThis & { __nookletDatabase?: unknown })
      .__nookletDatabase;

    vi.resetModules();

    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("repairs the skipped selected_genres_json upgrade on older databases", async () => {
    const databaseDirectory = createTempDirectory("nooklet-upgrade-db-");
    const databasePath = join(databaseDirectory, "upgrade.db");

    seedDatabaseThroughMigration(13, databasePath);

    expect(hasTableColumn(databasePath, "recommendation_runs", "selected_genres_json")).toBe(false);

    process.env.DATABASE_URL = `file:${databasePath}`;

    const { ensureDatabaseReady } = await import("./client");

    ensureDatabaseReady();

    expect(hasTableColumn(databasePath, "recommendation_runs", "selected_genres_json")).toBe(true);
  });
});