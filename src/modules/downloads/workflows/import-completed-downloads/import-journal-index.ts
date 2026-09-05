import { createHash, randomUUID } from "node:crypto";
import {
    closeSync,
    fstatSync,
    lstatSync,
    opendirSync,
    openSync,
    readSync,
    realpathSync,
} from "node:fs";
import { lstat, mkdir, open, rename } from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

/** Rebuildable scheduling metadata. It NEVER authorizes media or claim cleanup. */
export type ImportJournalIndexObservation = {
    relativePath: string;
    downloadId?: string;
    attemptId?: string;
    userId?: string;
    state: string;
    classification: "journal" | "malformed" | "foreign";
};

export type ImportJournalIndexRow = {
    entry_key: string;
    relative_path: string;
    download_id: string | null;
    attempt_id: string | null;
    user_id: string | null;
    state: string;
    classification: string;
    observed_at: number;
    inspected_at: number | null;
};

const indexName = "import-journal-index";
const initializations = new Map<string, { promise: Promise<void>; ready: boolean }>();
const failures = new Map<string, string>();
const version = "1";
const pageLimit = 256;

function canonical(value: string) {
    const resolved = path.resolve(/* turbopackIgnore: true */ value);

    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function importJournalIndexPath(rootPath: string) {
    return path.join(rootPath, indexName, "catalog.sqlite");
}

function checkedDirectory(directory: string) {
    const entry = lstatSync(directory);

    if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        canonical(realpathSync(directory)) !== canonical(directory)
    ) {
        throw new Error("Import journal index directory is redirected or invalid.");
    }
}

function checkedCatalog(rootPath: string) {
    checkedDirectory(rootPath);
    checkedDirectory(path.join(rootPath, indexName));
    const catalog = importJournalIndexPath(rootPath);
    const entry = lstatSync(catalog);

    if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error("Import journal index is not regular metadata.");
    }

    for (const suffix of ["-journal", "-wal", "-shm"]) {
        try {
            lstatSync(catalog + suffix);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                continue;
            }

            throw error;
        }

        // Never let opening SQLite recover, modify, or remove unknown/interrupted sidecar evidence.
        throw new Error("Import journal index has interrupted sidecar evidence; rebuild required.");
    }

    return catalog;
}

function openCatalog(rootPath: string, readonly = false) {
    if (!readonly) {
        const validation = openCatalog(rootPath, true);

        validation.close();
    }

    const database = new Database(checkedCatalog(rootPath), { readonly, fileMustExist: true });

    try {
        if (!readonly) {
            database.pragma("journal_mode = DELETE");
            database.pragma("synchronous = FULL");
        }

        const format = database
            .prepare("SELECT value FROM metadata WHERE key='format_version'")
            .get() as { value: string } | undefined;

        if (format?.value !== version) {
            throw new Error("Unknown import journal index format.");
        }

        // Compile the consumer queries without scanning entries or changing rejected evidence.
        database.prepare(
            "SELECT entry_key,relative_path,download_id,attempt_id,user_id,state,classification,observed_at,inspected_at FROM entries LIMIT 0",
        );
        const cursor = database
            .prepare("SELECT value FROM metadata WHERE key='recovery_cursor'")
            .get() as { value: string } | undefined;
        const discovery = database
            .prepare("SELECT value FROM metadata WHERE key='discovery_status'")
            .get() as { value: string } | undefined;

        if (
            !cursor ||
            !/^(?:[a-f0-9]{64})?$/.test(cursor.value) ||
            !discovery ||
            !["building", "complete"].includes(discovery.value)
        ) {
            throw new Error("Invalid import journal index metadata.");
        }

        return database;
    } catch (error) {
        database.close();

        throw error;
    }
}

function assertIndexReady(rootPath: string) {
    const database = openCatalog(rootPath, true);

    try {
        database.prepare("SELECT seen_generation FROM entries LIMIT 0");
        const discovery = database
            .prepare("SELECT value FROM metadata WHERE key='discovery_status'")
            .get() as { value: string };
        const status = readDiscoveryStatus(rootPath);

        if (discovery.value !== "complete" || status.status !== "complete") {
            throw new Error("Import journal catalogue discovery is incomplete.");
        }
    } finally {
        database.close();
    }
}

function safeRelative(value: string) {
    if (
        value.length === 0 ||
        value.length > 4096 ||
        path.isAbsolute(value) ||
        value.split(/[\\/]/).some((part) => !part || part === "." || part === "..")
    ) {
        throw new Error("Invalid import journal index entry path.");
    }

    return value.replaceAll("\\", "/");
}

export function importJournalIndexEntryKey(relativePath: string) {
    return createHash("sha256").update(safeRelative(relativePath)).digest("hex");
}

function upsert(
    database: Database.Database,
    observation: ImportJournalIndexObservation,
    inspectedAt: number | null = null,
    generation: string | null = null,
) {
    const relative = safeRelative(observation.relativePath);

    database
        .prepare(
            `INSERT INTO entries(entry_key,relative_path,download_id,attempt_id,user_id,state,classification,observed_at,inspected_at,seen_generation)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(entry_key) DO UPDATE SET relative_path=excluded.relative_path,
        download_id=excluded.download_id,attempt_id=excluded.attempt_id,user_id=excluded.user_id,state=excluded.state,
        classification=excluded.classification,observed_at=excluded.observed_at,
        inspected_at=COALESCE(excluded.inspected_at,entries.inspected_at),seen_generation=COALESCE(excluded.seen_generation,entries.seen_generation)`,
        )
        .run(
            importJournalIndexEntryKey(relative),
            relative,
            observation.downloadId ?? null,
            observation.attemptId ?? null,
            observation.userId ?? null,
            observation.state,
            observation.classification,
            Date.now(),
            inspectedAt,
            generation,
        );
}

async function syncDirectory(directory: string) {
    try {
        const handle = await open(directory, "r");

        try {
            await handle.sync();
        } finally {
            await handle.close();
        }
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        if (
            process.platform !== "win32" ||
            !["EINVAL", "EPERM", "EISDIR", "ENOTSUP", "EBADF"].includes(code ?? "")
        ) {
            throw error;
        }
        // Node directory fsync is unavailable on these Windows filesystems; no power-loss guarantee.
    }
}

async function writeDiscoveryStatus(rootPath: string, status: "building" | "complete" | "failed") {
    const destination = path.join(rootPath, "import-journal-index-status.json");
    const temporary = path.join(rootPath, ".import-journal-index-status-" + randomUUID());
    const handle = await open(temporary, "wx", 0o600);

    try {
        await handle.writeFile(JSON.stringify({ version: 1, status, at: Date.now() }));
        await handle.sync();
    } finally {
        await handle.close();
    }

    const existing = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }

        throw error;
    });

    if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
        throw new Error("Import journal discovery status is not regular metadata.");
    }

    await rename(temporary, destination);
    await syncDirectory(rootPath);
}

/** Startup reconciliation is streaming and O(namespace size), NOT a fixed-time operation. */
export async function initializeImportJournalIndex(
    rootPath: string,
    discover: () => AsyncIterable<ImportJournalIndexObservation>,
    force = false,
) {
    const key = canonical(rootPath);

    const existing = initializations.get(key);

    if (existing) {
        if (!existing.ready) {
            // Even explicit reconciliation joins a discovery already in progress.
            return existing.promise;
        }

        if (!force) {
            try {
                assertIndexReady(rootPath);

                return;
            } catch {
                // A resolved promise is not evidence that the on-disk catalogue is still usable.
            }
        }

        initializations.delete(key);
    }

    const initialization = { promise: Promise.resolve(), ready: false };

    initialization.promise = (async () => {
        await mkdir(rootPath, { recursive: true });
        checkedDirectory(rootPath);
        const destination = path.join(rootPath, indexName);
        const before = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }

            throw error;
        });

        if (before) {
            checkedDirectory(destination);
        }

        await writeDiscoveryStatus(rootPath, "building");
        let database: Database.Database | undefined;
        let stage: string | undefined;

        if (before) {
            try {
                database = openCatalog(rootPath);
                const columns = database.pragma("table_info(entries)") as Array<{ name: string }>;

                if (!columns.some((column) => column.name === "seen_generation")) {
                    database.exec("ALTER TABLE entries ADD COLUMN seen_generation TEXT");
                }
            } catch {
                database?.close();
                database = undefined;
            }
        }

        if (!database) {
            stage = path.join(rootPath, ".import-journal-index-rebuild-" + randomUUID());
            await mkdir(stage);
            const exclusive = await open(path.join(stage, "catalog.sqlite"), "wx", 0o600);

            await exclusive.close();
            database = new Database(path.join(stage, "catalog.sqlite"));
            database.pragma("journal_mode = DELETE");
            database.pragma("synchronous = FULL");
            database.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                CREATE TABLE entries(entry_key TEXT PRIMARY KEY,relative_path TEXT NOT NULL,download_id TEXT,attempt_id TEXT,user_id TEXT,
                    state TEXT NOT NULL,classification TEXT NOT NULL,observed_at INTEGER NOT NULL,inspected_at INTEGER,seen_generation TEXT);
                CREATE INDEX entries_active_key ON entries(state,entry_key);
                CREATE INDEX entries_user_active_key ON entries(user_id,state,entry_key);`);
            database
                .prepare(
                    "INSERT INTO metadata(key,value) VALUES('format_version',?),('recovery_cursor',''),('discovery_status','building')",
                )
                .run(version);
        }

        try {
            const generation = randomUUID();

            database.exec("BEGIN IMMEDIATE");

            try {
                database
                    .prepare("UPDATE metadata SET value='building' WHERE key='discovery_status'")
                    .run();

                for await (const observation of discover()) {
                    upsert(database, observation, null, generation);
                }

                // This deletes only stale index references; every journal and its evidence stays untouched.
                database
                    .prepare(
                        "DELETE FROM entries WHERE seen_generation IS NULL OR seen_generation!=?",
                    )
                    .run(generation);
                database
                    .prepare("UPDATE metadata SET value='complete' WHERE key='discovery_status'")
                    .run();
                database.exec("COMMIT");
            } catch (error) {
                database.exec("ROLLBACK");

                throw error;
            }
        } finally {
            database.close();
        }

        if (stage) {
            const synced = await open(path.join(stage, "catalog.sqlite"), "r+");

            try {
                await synced.sync();
            } finally {
                await synced.close();
            }

            await syncDirectory(stage);

            if (before) {
                // Preserve corrupt/incompatible index evidence and ALL SQLite sidecars. Healthy startup never archives history.
                await rename(
                    destination,
                    path.join(rootPath, "import-journal-index-retained-" + randomUUID()),
                );
            }

            await rename(stage, destination);
            await syncDirectory(rootPath);
        }

        await writeDiscoveryStatus(rootPath, "complete");
        failures.delete(key);
        initialization.ready = true;
    })().catch(async (error: unknown) => {
        failures.set(
            key,
            "Import journal catalogue discovery failed; retained metadata requires recovery.",
        );
        await writeDiscoveryStatus(rootPath, "failed").catch(() => undefined);

        if (initializations.get(key) === initialization) {
            initializations.delete(key);
        }

        throw error;
    });
    initializations.set(key, initialization);

    return initialization.promise;
}

export function registerImportJournalIndexEntry(
    rootPath: string,
    observation: ImportJournalIndexObservation,
) {
    const database = openCatalog(rootPath);

    try {
        const discovery = database
            .prepare("SELECT value FROM metadata WHERE key='discovery_status'")
            .get() as { value: string };

        if (discovery.value !== "complete") {
            throw new Error("Import journal catalogue discovery is incomplete.");
        }

        database.transaction(() => upsert(database, observation))();
    } finally {
        database.close();
    }
}

export function readImportJournalRecoveryPage(rootPath: string) {
    const database = openCatalog(rootPath, true);

    try {
        const cursor = (
            database.prepare("SELECT value FROM metadata WHERE key='recovery_cursor'").get() as {
                value: string;
            }
        ).value;
        const rows = database
            .prepare(
                "SELECT * FROM entries WHERE state!='committed' AND entry_key>? ORDER BY entry_key LIMIT ?",
            )
            .all(cursor, pageLimit) as ImportJournalIndexRow[];

        if (rows.length < pageLimit && cursor) {
            rows.push(
                ...(database
                    .prepare(
                        "SELECT * FROM entries WHERE state!='committed' AND entry_key<=? ORDER BY entry_key LIMIT ?",
                    )
                    .all(cursor, pageLimit - rows.length) as ImportJournalIndexRow[]),
            );
        }

        return { rows, cursor };
    } finally {
        database.close();
    }
}

export function recordImportJournalRecoveryObservation(
    rootPath: string,
    previousKey: string,
    observation: ImportJournalIndexObservation,
) {
    const database = openCatalog(rootPath);

    try {
        database.transaction(() => {
            upsert(database, observation, Date.now());
            database
                .prepare("UPDATE metadata SET value=? WHERE key='recovery_cursor'")
                .run(previousKey);
        })();
    } finally {
        database.close();
    }
}

function readDiscoveryStatus(rootPath: string) {
    const statusPath = path.join(rootPath, "import-journal-index-status.json");
    const before = lstatSync(statusPath);

    if (!before.isFile() || before.isSymbolicLink() || before.size > 4096) {
        throw new Error("Invalid discovery status.");
    }

    const descriptor = openSync(statusPath, "r");

    try {
        const opened = fstatSync(descriptor);

        if (
            !opened.isFile() ||
            opened.dev !== before.dev ||
            opened.ino !== before.ino ||
            opened.size !== before.size
        ) {
            throw new Error("Discovery status changed while opening.");
        }

        const buffer = Buffer.alloc(4097);
        const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);

        if (bytesRead > 4096 || bytesRead !== opened.size) {
            throw new Error("Discovery status exceeds its bound.");
        }

        const after = lstatSync(statusPath);

        if (
            after.isSymbolicLink() ||
            after.dev !== opened.dev ||
            after.ino !== opened.ino ||
            after.size !== opened.size ||
            after.mtimeMs !== opened.mtimeMs
        ) {
            throw new Error("Discovery status changed during reading.");
        }

        const status = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")) as {
            version: number;
            status: string;
            at: number;
        };

        if (
            status?.version !== 1 ||
            !["building", "complete", "failed"].includes(status.status) ||
            !Number.isSafeInteger(status.at) ||
            status.at < 0
        ) {
            throw new Error("Invalid discovery status.");
        }

        return status;
    } finally {
        closeSync(descriptor);
    }
}

function namespaceHasEntries(rootPath: string) {
    const namespace = path.join(rootPath, "import-journals");

    try {
        checkedDirectory(namespace);
        const directory = opendirSync(namespace);

        try {
            return directory.readSync() !== null;
        } finally {
            directory.closeSync();
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
        }

        return true;
    }
}

export function readImportJournalIndexHealth(rootPath: string, userId?: string) {
    try {
        checkedDirectory(rootPath);
        const status = readDiscoveryStatus(rootPath);
        const database = openCatalog(rootPath, true);

        try {
            const filter =
                "state!='committed'" + (userId ? " AND (user_id=? OR user_id IS NULL)" : "");
            const args = userId ? [userId] : [];
            const total = (
                database
                    .prepare("SELECT COUNT(*) AS count FROM entries WHERE " + filter)
                    .get(...args) as { count: number }
            ).count;
            const rows = database
                .prepare("SELECT * FROM entries WHERE " + filter + " ORDER BY entry_key LIMIT ?")
                .all(...args, pageLimit) as ImportJournalIndexRow[];
            const error =
                failures.get(canonical(rootPath)) ??
                (status.status !== "complete"
                    ? "Import journal catalogue discovery is incomplete; diagnostics may be stale."
                    : undefined);

            return {
                rows,
                total,
                overflow: Math.max(0, total - rows.length),
                error,
                discoveredAt: status.at,
            };
        } finally {
            database.close();
        }
    } catch {
        return {
            rows: [] as ImportJournalIndexRow[],
            total: 0,
            overflow: 0,
            error: namespaceHasEntries(rootPath)
                ? "Import journal catalogue is unavailable or discovery is incomplete; retained output requires recovery."
                : undefined,
            discoveredAt: null,
        };
    }
}
