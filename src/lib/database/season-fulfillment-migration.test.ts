import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

type SqliteSchemaObject = {
    name: string;
    sql: string | null;
};

function listColumns(sqlite: Database.Database, tableName: string) {
    return sqlite.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{ name: string }>;
}

function listIndexes(sqlite: Database.Database, tableName: string) {
    return sqlite.prepare(`PRAGMA index_list('${tableName}')`).all() as Array<{ name: string }>;
}

describe("season fulfillment migration", () => {
    it("applies the complete migration set to a fresh database", () => {
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-season-fulfillment-"));
        const sqlite = new Database(path.join(sandbox, "fresh.db"));

        try {
            sqlite.pragma("foreign_keys = ON");
            migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });

            const tables = sqlite
                .prepare(
                    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)",
                )
                .all(
                    "download_fulfillments",
                    "download_fulfillment_episodes",
                ) as SqliteSchemaObject[];

            expect(tables.map((table) => table.name)).toEqual(
                expect.arrayContaining(["download_fulfillments", "download_fulfillment_episodes"]),
            );

            expect(
                listColumns(sqlite, "download_fulfillments").map((column) => column.name),
            ).toEqual(
                expect.arrayContaining([
                    "id",
                    "user_id",
                    "media_title_id",
                    "season_id",
                    "target_library_path_id",
                    "requested_title",
                    "strategy",
                    "status",
                    "pack_attempt_count",
                    "pack_attempt_limit",
                    "next_attempt_at",
                    "cancellation_requested_at",
                    "status_message",
                    "created_at",
                    "updated_at",
                    "completed_at",
                ]),
            );
            expect(
                listColumns(sqlite, "download_fulfillment_episodes").map((column) => column.name),
            ).toEqual(
                expect.arrayContaining([
                    "fulfillment_id",
                    "episode_id",
                    "status",
                    "attempt_count",
                    "next_attempt_at",
                    "status_message",
                    "created_at",
                    "updated_at",
                ]),
            );
            expect(listColumns(sqlite, "download_requests").map((column) => column.name)).toEqual(
                expect.arrayContaining(["fulfillment_id", "attempt_strategy", "attempt_number"]),
            );

            expect(listIndexes(sqlite, "download_fulfillments").map((index) => index.name)).toEqual(
                expect.arrayContaining([
                    "download_fulfillments_user_status_due_idx",
                    "download_fulfillments_season_idx",
                    "download_fulfillments_open_season_unique",
                ]),
            );
            expect(
                listIndexes(sqlite, "download_fulfillment_episodes").map((index) => index.name),
            ).toContain("download_fulfillment_episodes_status_due_idx");
            expect(listIndexes(sqlite, "download_requests").map((index) => index.name)).toContain(
                "download_requests_fulfillment_created_idx",
            );

            const openFulfillmentIndex = sqlite
                .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = ?")
                .get("download_fulfillments_open_season_unique") as SqliteSchemaObject;

            expect(openFulfillmentIndex.sql).toContain(
                "WHERE status in ('active','retry_wait','partial')",
            );

            expect(sqlite.pragma("foreign_key_check")).toEqual([]);
        } finally {
            sqlite.close();
            fs.rmSync(sandbox, { recursive: true, force: true });
        }
    });
});
