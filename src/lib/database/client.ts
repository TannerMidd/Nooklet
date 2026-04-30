import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { env } from "@/lib/env";
import * as schema from "@/lib/database/schema";

type AppDatabase = BetterSQLite3Database<typeof schema>;

type SqliteTableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

type DatabaseCompatibilityRule = {
  tableName: string;
  columnName: string;
  repairSql?: string;
};

type DatabaseGlobals = {
  sqlite?: Database.Database;
  db?: AppDatabase;
  migrationSignature?: string | null;
  databasePath?: string;
  compatibilityVerified?: boolean;
};

const databaseGlobals = globalThis as typeof globalThis & {
  __nookletDatabase?: DatabaseGlobals;
};

const databaseCompatibilityRules: DatabaseCompatibilityRule[] = [
  {
    tableName: "recommendation_runs",
    columnName: "selected_genres_json",
    repairSql: "ALTER TABLE `recommendation_runs` ADD `selected_genres_json` text DEFAULT '[]' NOT NULL;",
  },
];

function resolveDatabasePath(databaseUrl: string) {
  const normalized = databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : databaseUrl;

  return path.isAbsolute(normalized) ? normalized : path.join(process.cwd(), normalized);
}

function createSqliteConnection() {
  const databasePath = resolveDatabasePath(env.DATABASE_URL);

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return sqlite;
}

function closeSharedDatabase() {
  sharedDatabaseState.sqlite?.close();
  sharedDatabaseState.sqlite = undefined;
  sharedDatabaseState.db = undefined;
  sharedDatabaseState.migrationSignature = undefined;
  sharedDatabaseState.compatibilityVerified = undefined;
}

function escapeSqliteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function listTableColumns(sqlite: Database.Database, tableName: string) {
  return sqlite
    .prepare(`PRAGMA table_info(${escapeSqliteIdentifier(tableName)})`)
    .all() as SqliteTableInfoRow[];
}

function hasTableColumn(
  sqlite: Database.Database,
  tableName: string,
  columnName: string,
) {
  return listTableColumns(sqlite, tableName).some((column) => column.name === columnName);
}

function applyDatabaseCompatibilityRepairs(sqlite: Database.Database) {
  for (const rule of databaseCompatibilityRules) {
    if (!rule.repairSql || hasTableColumn(sqlite, rule.tableName, rule.columnName)) {
      continue;
    }

    sqlite.exec(rule.repairSql);
  }
}

function assertDatabaseCompatibility(sqlite: Database.Database) {
  const missingColumns = databaseCompatibilityRules.filter(
    (rule) => !hasTableColumn(sqlite, rule.tableName, rule.columnName),
  );

  if (missingColumns.length === 0) {
    return;
  }

  throw new Error(
    `Database schema is incompatible with this release. Missing: ${missingColumns
      .map((rule) => `${rule.tableName}.${rule.columnName}`)
      .join(", ")}.`,
  );
}

function resolveMigrationJournalPath() {
  return path.join(process.cwd(), "drizzle", "meta", "_journal.json");
}

function readMigrationSignature() {
  const journalPath = resolveMigrationJournalPath();

  try {
    return fs.readFileSync(journalPath, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

const sharedDatabaseState = databaseGlobals.__nookletDatabase ?? {};
databaseGlobals.__nookletDatabase = sharedDatabaseState;

function getOrCreateDatabase() {
  const databasePath = resolveDatabasePath(env.DATABASE_URL);

  if (sharedDatabaseState.databasePath && sharedDatabaseState.databasePath !== databasePath) {
    closeSharedDatabase();
  }

  if (!sharedDatabaseState.sqlite || !sharedDatabaseState.db) {
    const sqlite = createSqliteConnection();
    const db = drizzle(sqlite, { schema });

    sharedDatabaseState.sqlite = sqlite;
    sharedDatabaseState.db = db;
    sharedDatabaseState.databasePath = databasePath;
    sharedDatabaseState.compatibilityVerified = false;
  }

  return sharedDatabaseState.db;
}

export function ensureDatabaseReady() {
  const database = getOrCreateDatabase();
  const migrationSignature = readMigrationSignature();

  if (sharedDatabaseState.migrationSignature !== migrationSignature) {
    migrate(database, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });

    sharedDatabaseState.migrationSignature = migrationSignature;
    sharedDatabaseState.compatibilityVerified = false;
  }

  if (!sharedDatabaseState.compatibilityVerified) {
    applyDatabaseCompatibilityRepairs(sharedDatabaseState.sqlite!);
    assertDatabaseCompatibility(sharedDatabaseState.sqlite!);
    sharedDatabaseState.compatibilityVerified = true;
  }

  return database;
}
