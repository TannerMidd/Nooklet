import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { env } from "@/lib/env";
import * as schema from "@/lib/database/schema";

type AppDatabase = BetterSQLite3Database<typeof schema>;

type DatabaseGlobals = {
  sqlite?: Database.Database;
  db?: AppDatabase;
  migrated?: boolean;
};

const databaseGlobals = globalThis as typeof globalThis & {
  __recommendarrDatabase?: DatabaseGlobals;
};

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

const sharedDatabaseState = databaseGlobals.__recommendarrDatabase ?? {};

const sqlite = sharedDatabaseState.sqlite ?? createSqliteConnection();
const db = sharedDatabaseState.db ?? drizzle(sqlite, { schema });

sharedDatabaseState.sqlite = sqlite;
sharedDatabaseState.db = db;
databaseGlobals.__recommendarrDatabase = sharedDatabaseState;

export function ensureDatabaseReady() {
  if (!sharedDatabaseState.migrated) {
    migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });

    sharedDatabaseState.migrated = true;
  }

  return db;
}

export { db };
