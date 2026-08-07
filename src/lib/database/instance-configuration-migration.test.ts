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

type OwnedRow = {
    id: string;
    owner: string;
};

const workspaceMigrations = path.join(process.cwd(), "drizzle");

function createMigrationsThrough(sandbox: string, lastMigrationIndex: number) {
    const journal = JSON.parse(
        fs.readFileSync(path.join(workspaceMigrations, "meta", "_journal.json"), "utf8"),
    ) as MigrationJournal;
    const entries = journal.entries.filter((entry) => entry.idx <= lastMigrationIndex);
    const migrationsFolder = path.join(sandbox, `migrations-through-${lastMigrationIndex}`);

    fs.mkdirSync(path.join(migrationsFolder, "meta"), { recursive: true });
    fs.writeFileSync(
        path.join(migrationsFolder, "meta", "_journal.json"),
        JSON.stringify({ ...journal, entries }),
    );

    for (const entry of entries) {
        fs.copyFileSync(
            path.join(workspaceMigrations, `${entry.tag}.sql`),
            path.join(migrationsFolder, `${entry.tag}.sql`),
        );
    }

    return { journal, migrationsFolder };
}

function insertUser(
    sqlite: Database.Database,
    input: {
        id: string;
        role: "admin" | "user";
        isDisabled: boolean;
        createdAt: number;
    },
) {
    sqlite
        .prepare(
            `
    INSERT INTO users (
      id, email, display_name, password_hash, role, is_disabled, created_at, updated_at
    ) VALUES (?, ?, ?, 'test-hash', ?, ?, ?, ?)
  `,
        )
        .run(
            input.id,
            `${input.id}@example.test`,
            input.id,
            input.role,
            Number(input.isDisabled),
            input.createdAt,
            input.createdAt,
        );
}

function insertServiceConnection(
    sqlite: Database.Database,
    input: {
        id: string;
        serviceType: string;
        scope: "shared" | "user";
        ownerUserId: string;
    },
) {
    sqlite
        .prepare(
            `
    INSERT INTO service_connections (
      id, service_type, ownership_scope, owner_user_id, display_name
    ) VALUES (?, ?, ?, ?, ?)
  `,
        )
        .run(input.id, input.serviceType, input.scope, input.ownerUserId, input.id);
}

function insertIndexer(
    sqlite: Database.Database,
    input: { id: string; userId: string; name: string },
) {
    sqlite
        .prepare(
            `
    INSERT INTO indexers (id, user_id, name, protocol, base_url)
    VALUES (?, ?, ?, 'newznab', ?)
  `,
        )
        .run(input.id, input.userId, input.name, `https://${input.id}.example.test`);
}

function insertLibrary(
    sqlite: Database.Database,
    input: {
        id: string;
        userId: string;
        mediaType: "movie" | "tv";
        name: string;
        libraryPath: string;
    },
) {
    sqlite
        .prepare(
            `
    INSERT INTO media_libraries (id, user_id, media_type, name)
    VALUES (?, ?, ?, ?)
  `,
        )
        .run(input.id, input.userId, input.mediaType, input.name);
    sqlite
        .prepare(
            `
    INSERT INTO media_library_paths (id, library_id, user_id, path, label)
    VALUES (?, ?, ?, ?, ?)
  `,
        )
        .run(`${input.id}-path`, input.id, input.userId, input.libraryPath, `${input.name} path`);
}

function insertJob(
    sqlite: Database.Database,
    input: {
        id: string;
        userId: string;
        jobType: string;
        targetType?: string;
        targetKey?: string;
        scheduleMinutes: number;
        isEnabled?: boolean;
        nextRunAt?: number | null;
        lastStatus?: "idle" | "running" | "succeeded" | "failed";
        runToken?: string | null;
        lockedUntil?: number | null;
        lastHeartbeatAt?: number | null;
    },
) {
    sqlite
        .prepare(
            `
    INSERT INTO jobs (
      id, user_id, job_type, target_type, target_key, schedule_minutes,
      is_enabled, next_run_at, last_status, run_token, locked_until,
      last_heartbeat_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
        )
        .run(
            input.id,
            input.userId,
            input.jobType,
            input.targetType ?? "media-library",
            input.targetKey ?? "all",
            input.scheduleMinutes,
            Number(input.isEnabled ?? true),
            input.nextRunAt ?? null,
            input.lastStatus ?? "idle",
            input.runToken ?? null,
            input.lockedUntil ?? null,
            input.lastHeartbeatAt ?? null,
        );
}

function listOwnedRows(
    sqlite: Database.Database,
    tableName:
        "indexers" | "jobs" | "media_libraries" | "media_library_paths" | "service_connections",
    ownerColumn: "owner_user_id" | "user_id",
) {
    return sqlite
        .prepare(`SELECT id, ${ownerColumn} AS owner FROM ${tableName} ORDER BY id`)
        .all() as OwnedRow[];
}

function migrationSnapshot(sqlite: Database.Database) {
    return {
        instanceConfiguration: sqlite
            .prepare("SELECT id, owner_user_id FROM instance_configuration ORDER BY id")
            .all(),
        serviceConnections: listOwnedRows(sqlite, "service_connections", "owner_user_id"),
        indexers: listOwnedRows(sqlite, "indexers", "user_id"),
        libraries: listOwnedRows(sqlite, "media_libraries", "user_id"),
        paths: listOwnedRows(sqlite, "media_library_paths", "user_id"),
        jobs: listOwnedRows(sqlite, "jobs", "user_id"),
    };
}

describe("instance configuration migration", () => {
    it("consolidates configuration and recurring jobs while preserving every collision", () => {
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-instance-upgrade-"));
        const databasePath = path.join(sandbox, "upgrade.db");
        const { journal, migrationsFolder } = createMigrationsThrough(sandbox, 41);
        const migration0042 = journal.entries.find((entry) => entry.idx === 42);
        const migration0043 = journal.entries.find((entry) => entry.idx === 43);
        const sqlite = new Database(databasePath);

        if (!migration0042 || !migration0043) {
            throw new Error("Expected migrations 0042 and 0043 in the current migration journal.");
        }

        try {
            sqlite.pragma("foreign_keys = ON");
            const database = drizzle(sqlite);

            migrate(database, { migrationsFolder });

            // An older non-admin and a disabled admin must not outrank active admins.
            // Tied active admins are resolved by ID, making the owner deterministic.
            insertUser(sqlite, {
                id: "ordinary-user",
                role: "user",
                isDisabled: false,
                createdAt: 10,
            });
            insertUser(sqlite, {
                id: "disabled-admin",
                role: "admin",
                isDisabled: true,
                createdAt: 20,
            });
            insertUser(sqlite, {
                id: "active-admin-z",
                role: "admin",
                isDisabled: false,
                createdAt: 30,
            });
            insertUser(sqlite, {
                id: "active-admin-a",
                role: "admin",
                isDisabled: false,
                createdAt: 30,
            });

            insertServiceConnection(sqlite, {
                id: "connection-owner-tmdb",
                serviceType: "tmdb",
                scope: "shared",
                ownerUserId: "active-admin-a",
            });
            insertServiceConnection(sqlite, {
                id: "connection-conflicting-tmdb",
                serviceType: "tmdb",
                scope: "shared",
                ownerUserId: "ordinary-user",
            });
            insertServiceConnection(sqlite, {
                id: "connection-movable-plex",
                serviceType: "plex",
                scope: "shared",
                ownerUserId: "ordinary-user",
            });
            insertServiceConnection(sqlite, {
                id: "connection-movable-tvdb",
                serviceType: "tvdb",
                scope: "shared",
                ownerUserId: "disabled-admin",
            });
            insertServiceConnection(sqlite, {
                id: "connection-z-conflicting-plex",
                serviceType: "plex",
                scope: "shared",
                ownerUserId: "disabled-admin",
            });
            insertServiceConnection(sqlite, {
                id: "connection-private-trakt",
                serviceType: "trakt",
                scope: "user",
                ownerUserId: "ordinary-user",
            });
            sqlite
                .prepare(
                    `
        INSERT INTO service_secrets (connection_id, encrypted_value, masked_value)
        VALUES ('connection-movable-plex', 'encrypted-plex', '***plex')
      `,
                )
                .run();
            sqlite
                .prepare(
                    `
        INSERT INTO service_secrets (connection_id, encrypted_value, masked_value)
        VALUES ('connection-z-conflicting-plex', 'encrypted-duplicate', '***duplicate')
      `,
                )
                .run();
            sqlite
                .prepare(
                    `
        INSERT INTO download_clients (
          id, user_id, service_connection_id, client_type, display_name, status
        ) VALUES (
          'ordinary-user-download-client',
          'ordinary-user',
          'connection-movable-plex',
          'nooklet',
          'Nooklet downloader',
          'verified'
        )
      `,
                )
                .run();

            insertIndexer(sqlite, {
                id: "indexer-owner-duplicate",
                userId: "active-admin-a",
                name: "Duplicate",
            });
            insertIndexer(sqlite, {
                id: "indexer-conflicting-duplicate",
                userId: "ordinary-user",
                name: "Duplicate",
            });
            insertIndexer(sqlite, {
                id: "indexer-movable-a",
                userId: "ordinary-user",
                name: "Unique A",
            });
            insertIndexer(sqlite, {
                id: "indexer-movable-z",
                userId: "disabled-admin",
                name: "Unique Z",
            });
            insertIndexer(sqlite, {
                id: "indexer-z-conflicting-unique-a",
                userId: "disabled-admin",
                name: "Unique A",
            });
            sqlite
                .prepare(
                    `
        INSERT INTO indexer_secrets (indexer_id, encrypted_api_key, masked_api_key)
        VALUES ('indexer-movable-a', 'encrypted-key', '***key')
      `,
                )
                .run();
            sqlite
                .prepare(
                    `
        INSERT INTO indexer_secrets (indexer_id, encrypted_api_key, masked_api_key)
        VALUES ('indexer-z-conflicting-unique-a', 'encrypted-duplicate-key', '***duplicate')
      `,
                )
                .run();

            insertLibrary(sqlite, {
                id: "library-owner-movies",
                userId: "active-admin-a",
                mediaType: "movie",
                name: "Movies",
                libraryPath: "/shared/library",
            });
            insertLibrary(sqlite, {
                id: "library-conflicting-name",
                userId: "ordinary-user",
                mediaType: "movie",
                name: "Movies",
                libraryPath: "/ordinary/movies",
            });
            insertLibrary(sqlite, {
                id: "library-conflicting-path",
                userId: "ordinary-user",
                mediaType: "movie",
                name: "Archive",
                libraryPath: "/shared/library",
            });
            insertLibrary(sqlite, {
                id: "library-movable-tv",
                userId: "ordinary-user",
                mediaType: "tv",
                name: "Television",
                libraryPath: "/ordinary/tv",
            });
            insertLibrary(sqlite, {
                id: "library-movable-documentaries",
                userId: "disabled-admin",
                mediaType: "movie",
                name: "Documentaries",
                libraryPath: "/disabled/documentaries",
            });
            insertLibrary(sqlite, {
                id: "library-z-conflicting-tv",
                userId: "disabled-admin",
                mediaType: "tv",
                name: "Television",
                libraryPath: "/disabled/tv-copy",
            });
            insertLibrary(sqlite, {
                id: "library-z-conflicting-path",
                userId: "disabled-admin",
                mediaType: "movie",
                name: "Extras",
                libraryPath: "/ordinary/tv",
            });

            insertJob(sqlite, {
                id: "job-owner-scan",
                userId: "active-admin-a",
                jobType: "media-library-scan",
                scheduleMinutes: 60,
                nextRunAt: 1_000,
            });
            insertJob(sqlite, {
                id: "job-secondary-scan",
                userId: "ordinary-user",
                jobType: "media-library-scan",
                scheduleMinutes: 120,
                nextRunAt: 2_000,
                lastStatus: "running",
                runToken: "secondary-scan-token",
                lockedUntil: 3_000,
                lastHeartbeatAt: 2_500,
            });
            insertJob(sqlite, {
                id: "job-a-missing",
                userId: "ordinary-user",
                jobType: "missing-content-search",
                scheduleMinutes: 180,
                nextRunAt: 4_000,
                lastStatus: "running",
                runToken: "winning-missing-token",
                lockedUntil: 4_500,
                lastHeartbeatAt: 4_250,
            });
            insertJob(sqlite, {
                id: "job-z-missing",
                userId: "disabled-admin",
                jobType: "missing-content-search",
                scheduleMinutes: 240,
                nextRunAt: 5_000,
                lastStatus: "running",
                runToken: "duplicate-missing-token",
                lockedUntil: 6_000,
                lastHeartbeatAt: 5_500,
            });
            insertJob(sqlite, {
                id: "job-metadata-secondary",
                userId: "disabled-admin",
                jobType: "metadata-refresh",
                scheduleMinutes: 360,
                nextRunAt: 7_000,
            });
            insertJob(sqlite, {
                id: "job-manual-scan",
                userId: "ordinary-user",
                jobType: "media-library-scan",
                targetKey: "manual",
                scheduleMinutes: 0,
                nextRunAt: 8_000,
                lastStatus: "running",
                runToken: "manual-token",
                lockedUntil: 9_000,
                lastHeartbeatAt: 8_500,
            });
            insertJob(sqlite, {
                id: "job-watch-history",
                userId: "ordinary-user",
                jobType: "watch-history-sync",
                targetType: "plex",
                targetKey: "plex",
                scheduleMinutes: 45,
                nextRunAt: 10_000,
                lastStatus: "running",
                runToken: "watch-token",
                lockedUntil: 11_000,
                lastHeartbeatAt: 10_500,
            });

            migrate(database, { migrationsFolder: workspaceMigrations });

            expect(
                sqlite
                    .prepare(
                        `
        SELECT id, owner_user_id FROM instance_configuration
      `,
                    )
                    .get(),
            ).toEqual({ id: "default", owner_user_id: "active-admin-a" });

            expect(listOwnedRows(sqlite, "service_connections", "owner_user_id")).toEqual([
                { id: "connection-conflicting-tmdb", owner: "ordinary-user" },
                { id: "connection-movable-plex", owner: "active-admin-a" },
                { id: "connection-movable-tvdb", owner: "active-admin-a" },
                { id: "connection-owner-tmdb", owner: "active-admin-a" },
                { id: "connection-private-trakt", owner: "ordinary-user" },
                { id: "connection-z-conflicting-plex", owner: "disabled-admin" },
            ]);
            expect(listOwnedRows(sqlite, "indexers", "user_id")).toEqual([
                { id: "indexer-conflicting-duplicate", owner: "ordinary-user" },
                { id: "indexer-movable-a", owner: "active-admin-a" },
                { id: "indexer-movable-z", owner: "active-admin-a" },
                { id: "indexer-owner-duplicate", owner: "active-admin-a" },
                { id: "indexer-z-conflicting-unique-a", owner: "disabled-admin" },
            ]);
            expect(listOwnedRows(sqlite, "media_libraries", "user_id")).toEqual([
                { id: "library-conflicting-name", owner: "ordinary-user" },
                { id: "library-conflicting-path", owner: "ordinary-user" },
                { id: "library-movable-documentaries", owner: "active-admin-a" },
                { id: "library-movable-tv", owner: "active-admin-a" },
                { id: "library-owner-movies", owner: "active-admin-a" },
                { id: "library-z-conflicting-path", owner: "disabled-admin" },
                { id: "library-z-conflicting-tv", owner: "disabled-admin" },
            ]);
            expect(listOwnedRows(sqlite, "media_library_paths", "user_id")).toEqual([
                { id: "library-conflicting-name-path", owner: "ordinary-user" },
                { id: "library-conflicting-path-path", owner: "ordinary-user" },
                { id: "library-movable-documentaries-path", owner: "active-admin-a" },
                { id: "library-movable-tv-path", owner: "active-admin-a" },
                { id: "library-owner-movies-path", owner: "active-admin-a" },
                { id: "library-z-conflicting-path-path", owner: "disabled-admin" },
                { id: "library-z-conflicting-tv-path", owner: "disabled-admin" },
            ]);

            expect(
                sqlite
                    .prepare(
                        `
        SELECT connection_id, encrypted_value FROM service_secrets
        ORDER BY connection_id
      `,
                    )
                    .all(),
            ).toEqual([
                {
                    connection_id: "connection-movable-plex",
                    encrypted_value: "encrypted-plex",
                },
                {
                    connection_id: "connection-z-conflicting-plex",
                    encrypted_value: "encrypted-duplicate",
                },
            ]);
            expect(() =>
                sqlite
                    .prepare(
                        `
        INSERT INTO download_clients (
          id, user_id, service_connection_id, client_type, display_name, status
        ) VALUES (
          'owner-download-client',
          'active-admin-a',
          'connection-movable-plex',
          'nooklet',
          'Nooklet downloader',
          'verified'
        )
      `,
                    )
                    .run(),
            ).not.toThrow();
            expect(
                sqlite
                    .prepare(
                        `
        SELECT id, user_id
        FROM download_clients
        WHERE service_connection_id = 'connection-movable-plex'
        ORDER BY id
      `,
                    )
                    .all(),
            ).toEqual([
                { id: "ordinary-user-download-client", user_id: "ordinary-user" },
                { id: "owner-download-client", user_id: "active-admin-a" },
            ]);
            expect(
                sqlite
                    .prepare(
                        `
        SELECT indexer_id, encrypted_api_key FROM indexer_secrets
        ORDER BY indexer_id
      `,
                    )
                    .all(),
            ).toEqual([
                {
                    indexer_id: "indexer-movable-a",
                    encrypted_api_key: "encrypted-key",
                },
                {
                    indexer_id: "indexer-z-conflicting-unique-a",
                    encrypted_api_key: "encrypted-duplicate-key",
                },
            ]);

            expect(
                sqlite
                    .prepare(
                        `
        SELECT
          id,
          user_id AS userId,
          is_enabled AS isEnabled,
          next_run_at AS nextRunAt,
          last_status AS lastStatus,
          run_token AS runToken,
          locked_until AS lockedUntil,
          last_heartbeat_at AS lastHeartbeatAt
        FROM jobs
        ORDER BY id
      `,
                    )
                    .all(),
            ).toEqual([
                {
                    id: "job-a-missing",
                    userId: "active-admin-a",
                    isEnabled: 1,
                    nextRunAt: 4_000,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
                {
                    id: "job-manual-scan",
                    userId: "ordinary-user",
                    isEnabled: 1,
                    nextRunAt: 8_000,
                    lastStatus: "running",
                    runToken: "manual-token",
                    lockedUntil: 9_000,
                    lastHeartbeatAt: 8_500,
                },
                {
                    id: "job-metadata-secondary",
                    userId: "active-admin-a",
                    isEnabled: 1,
                    nextRunAt: 7_000,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
                {
                    id: "job-owner-scan",
                    userId: "active-admin-a",
                    isEnabled: 1,
                    nextRunAt: 1_000,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
                {
                    id: "job-secondary-scan",
                    userId: "ordinary-user",
                    isEnabled: 0,
                    nextRunAt: null,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
                {
                    id: "job-watch-history",
                    userId: "ordinary-user",
                    isEnabled: 1,
                    nextRunAt: 10_000,
                    lastStatus: "running",
                    runToken: "watch-token",
                    lockedUntil: 11_000,
                    lastHeartbeatAt: 10_500,
                },
                {
                    id: "job-z-missing",
                    userId: "disabled-admin",
                    isEnabled: 0,
                    nextRunAt: null,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
            ]);
            expect(
                sqlite
                    .prepare(
                        `
        SELECT
          schedule_minutes AS scheduleMinutes,
          next_run_at AS nextRunAt,
          last_status AS lastStatus,
          run_token AS runToken,
          locked_until AS lockedUntil,
          last_heartbeat_at AS lastHeartbeatAt
        FROM jobs
        WHERE id = 'job-a-missing'
      `,
                    )
                    .get(),
            ).toEqual({
                scheduleMinutes: 180,
                nextRunAt: 4_000,
                lastStatus: "idle",
                runToken: null,
                lockedUntil: null,
                lastHeartbeatAt: null,
            });

            expect(sqlite.pragma("foreign_key_check")).toEqual([]);
            expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
            expect(() =>
                insertServiceConnection(sqlite, {
                    id: "duplicate-owner-plex",
                    serviceType: "plex",
                    scope: "shared",
                    ownerUserId: "active-admin-a",
                }),
            ).toThrow(/UNIQUE constraint failed/);
            expect(() =>
                insertIndexer(sqlite, {
                    id: "duplicate-owner-indexer",
                    userId: "active-admin-a",
                    name: "Unique A",
                }),
            ).toThrow(/UNIQUE constraint failed/);
            expect(() =>
                insertLibrary(sqlite, {
                    id: "duplicate-owner-library",
                    userId: "active-admin-a",
                    mediaType: "tv",
                    name: "Television",
                    libraryPath: "/unused",
                }),
            ).toThrow(/UNIQUE constraint failed/);
            expect(() =>
                sqlite
                    .prepare(
                        `
        INSERT INTO media_library_paths (id, library_id, user_id, path, label)
        VALUES (
          'duplicate-owner-path',
          'library-owner-movies',
          'active-admin-a',
          '/ordinary/tv',
          'Duplicate owner path'
        )
      `,
                    )
                    .run(),
            ).toThrow(/UNIQUE constraint failed/);

            const beforeSecondMigration = migrationSnapshot(sqlite);
            const applied0042Before = sqlite
                .prepare(
                    `
        SELECT COUNT(*) AS count
        FROM __drizzle_migrations
        WHERE created_at = ?
      `,
                )
                .get(migration0042.when) as { count: number };
            const applied0043Before = sqlite
                .prepare(
                    `
        SELECT COUNT(*) AS count
        FROM __drizzle_migrations
        WHERE created_at = ?
      `,
                )
                .get(migration0043.when) as { count: number };

            migrate(database, { migrationsFolder: workspaceMigrations });

            const applied0042After = sqlite
                .prepare(
                    `
        SELECT COUNT(*) AS count
        FROM __drizzle_migrations
        WHERE created_at = ?
      `,
                )
                .get(migration0042.when) as { count: number };
            const applied0043After = sqlite
                .prepare(
                    `
        SELECT COUNT(*) AS count
        FROM __drizzle_migrations
        WHERE created_at = ?
      `,
                )
                .get(migration0043.when) as { count: number };

            expect(applied0042Before.count).toBe(1);
            expect(applied0042After.count).toBe(1);
            expect(applied0043Before.count).toBe(1);
            expect(applied0043After.count).toBe(1);
            expect(migrationSnapshot(sqlite)).toEqual(beforeSecondMigration);
            expect(sqlite.pragma("foreign_key_check")).toEqual([]);
        } finally {
            sqlite.close();
            fs.rmSync(sandbox, { recursive: true, force: true });
        }
    });

    it("applies recurring-job cleanup after migration 0042 was already recorded", () => {
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-alpha-job-upgrade-"));
        const databasePath = path.join(sandbox, "upgrade.db");
        const { migrationsFolder: migrationsThrough0041 } = createMigrationsThrough(sandbox, 41);
        const { journal, migrationsFolder: migrationsThrough0042 } = createMigrationsThrough(
            sandbox,
            42,
        );
        const migration0042 = journal.entries.find((entry) => entry.idx === 42);
        const migration0043 = journal.entries.find((entry) => entry.idx === 43);
        const sqlite = new Database(databasePath);

        if (!migration0042 || !migration0043) {
            throw new Error("Expected migrations 0042 and 0043 in the current migration journal.");
        }

        try {
            sqlite.pragma("foreign_keys = ON");
            const database = drizzle(sqlite);

            migrate(database, { migrationsFolder: migrationsThrough0041 });

            insertUser(sqlite, {
                id: "owner-admin",
                role: "admin",
                isDisabled: false,
                createdAt: 10,
            });
            insertUser(sqlite, {
                id: "secondary-user",
                role: "user",
                isDisabled: false,
                createdAt: 1,
            });
            insertUser(sqlite, {
                id: "disabled-admin",
                role: "admin",
                isDisabled: true,
                createdAt: 2,
            });

            migrate(database, { migrationsFolder: migrationsThrough0042 });

            expect(
                sqlite
                    .prepare(
                        `
        SELECT id, owner_user_id FROM instance_configuration
      `,
                    )
                    .get(),
            ).toEqual({ id: "default", owner_user_id: "owner-admin" });
            expect(
                sqlite
                    .prepare(
                        `
        SELECT COUNT(*) AS count
        FROM __drizzle_migrations
        WHERE created_at = ?
      `,
                    )
                    .get(migration0042.when),
            ).toEqual({ count: 1 });
            expect(
                sqlite
                    .prepare(
                        `
        SELECT COUNT(*) AS count
        FROM __drizzle_migrations
        WHERE created_at = ?
      `,
                    )
                    .get(migration0043.when),
            ).toEqual({ count: 0 });

            insertJob(sqlite, {
                id: "job-owner-scan",
                userId: "owner-admin",
                jobType: "media-library-scan",
                scheduleMinutes: 60,
                nextRunAt: 1_000,
            });
            insertJob(sqlite, {
                id: "job-secondary-scan",
                userId: "secondary-user",
                jobType: "media-library-scan",
                scheduleMinutes: 120,
                nextRunAt: 2_000,
                lastStatus: "running",
                runToken: "secondary-scan-token",
                lockedUntil: 3_000,
                lastHeartbeatAt: 2_500,
            });
            insertJob(sqlite, {
                id: "job-a-missing",
                userId: "secondary-user",
                jobType: "missing-content-search",
                scheduleMinutes: 180,
                nextRunAt: 4_000,
                lastStatus: "running",
                runToken: "winning-missing-token",
                lockedUntil: 4_500,
                lastHeartbeatAt: 4_250,
            });
            insertJob(sqlite, {
                id: "job-z-missing",
                userId: "disabled-admin",
                jobType: "missing-content-search",
                scheduleMinutes: 240,
                nextRunAt: 5_000,
                lastStatus: "running",
                runToken: "duplicate-missing-token",
                lockedUntil: 6_000,
                lastHeartbeatAt: 5_500,
            });
            insertJob(sqlite, {
                id: "job-metadata-secondary",
                userId: "disabled-admin",
                jobType: "metadata-refresh",
                scheduleMinutes: 360,
                nextRunAt: 7_000,
            });
            insertJob(sqlite, {
                id: "job-manual-scan",
                userId: "secondary-user",
                jobType: "media-library-scan",
                targetKey: "manual",
                scheduleMinutes: 0,
                nextRunAt: 8_000,
                lastStatus: "running",
                runToken: "manual-token",
                lockedUntil: 9_000,
                lastHeartbeatAt: 8_500,
            });
            insertJob(sqlite, {
                id: "job-watch-history",
                userId: "secondary-user",
                jobType: "watch-history-sync",
                targetType: "plex",
                targetKey: "plex",
                scheduleMinutes: 45,
                nextRunAt: 10_000,
                lastStatus: "running",
                runToken: "watch-token",
                lockedUntil: 11_000,
                lastHeartbeatAt: 10_500,
            });

            migrate(database, { migrationsFolder: workspaceMigrations });

            expect(
                sqlite
                    .prepare(
                        `
        SELECT
          id,
          user_id AS userId,
          job_type AS jobType,
          target_type AS targetType,
          target_key AS targetKey,
          schedule_minutes AS scheduleMinutes,
          is_enabled AS isEnabled,
          next_run_at AS nextRunAt,
          last_status AS lastStatus,
          run_token AS runToken,
          locked_until AS lockedUntil,
          last_heartbeat_at AS lastHeartbeatAt
        FROM jobs
        ORDER BY id
      `,
                    )
                    .all(),
            ).toEqual([
                {
                    id: "job-a-missing",
                    userId: "owner-admin",
                    jobType: "missing-content-search",
                    targetType: "media-library",
                    targetKey: "all",
                    scheduleMinutes: 180,
                    isEnabled: 1,
                    nextRunAt: 4_000,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
                {
                    id: "job-manual-scan",
                    userId: "secondary-user",
                    jobType: "media-library-scan",
                    targetType: "media-library",
                    targetKey: "manual",
                    scheduleMinutes: 0,
                    isEnabled: 1,
                    nextRunAt: 8_000,
                    lastStatus: "running",
                    runToken: "manual-token",
                    lockedUntil: 9_000,
                    lastHeartbeatAt: 8_500,
                },
                {
                    id: "job-metadata-secondary",
                    userId: "owner-admin",
                    jobType: "metadata-refresh",
                    targetType: "media-library",
                    targetKey: "all",
                    scheduleMinutes: 360,
                    isEnabled: 1,
                    nextRunAt: 7_000,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
                {
                    id: "job-owner-scan",
                    userId: "owner-admin",
                    jobType: "media-library-scan",
                    targetType: "media-library",
                    targetKey: "all",
                    scheduleMinutes: 60,
                    isEnabled: 1,
                    nextRunAt: 1_000,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
                {
                    id: "job-secondary-scan",
                    userId: "secondary-user",
                    jobType: "media-library-scan",
                    targetType: "media-library",
                    targetKey: "all",
                    scheduleMinutes: 120,
                    isEnabled: 0,
                    nextRunAt: null,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
                {
                    id: "job-watch-history",
                    userId: "secondary-user",
                    jobType: "watch-history-sync",
                    targetType: "plex",
                    targetKey: "plex",
                    scheduleMinutes: 45,
                    isEnabled: 1,
                    nextRunAt: 10_000,
                    lastStatus: "running",
                    runToken: "watch-token",
                    lockedUntil: 11_000,
                    lastHeartbeatAt: 10_500,
                },
                {
                    id: "job-z-missing",
                    userId: "disabled-admin",
                    jobType: "missing-content-search",
                    targetType: "media-library",
                    targetKey: "all",
                    scheduleMinutes: 240,
                    isEnabled: 0,
                    nextRunAt: null,
                    lastStatus: "idle",
                    runToken: null,
                    lockedUntil: null,
                    lastHeartbeatAt: null,
                },
            ]);
            expect(
                sqlite
                    .prepare(
                        `
        SELECT COUNT(*) AS count
        FROM __drizzle_migrations
        WHERE created_at = ?
      `,
                    )
                    .get(migration0042.when),
            ).toEqual({ count: 1 });
            expect(
                sqlite
                    .prepare(
                        `
        SELECT COUNT(*) AS count
        FROM __drizzle_migrations
        WHERE created_at = ?
      `,
                    )
                    .get(migration0043.when),
            ).toEqual({ count: 1 });
            expect(sqlite.pragma("foreign_key_check")).toEqual([]);
            expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
        } finally {
            sqlite.close();
            fs.rmSync(sandbox, { recursive: true, force: true });
        }
    });
});
