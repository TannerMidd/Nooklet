import { createHash, randomUUID } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, opendir, realpath, unlink } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import {
    initializeImportJournalIndex,
    registerImportJournalIndexEntry,
    readImportJournalRecoveryPage,
    recordImportJournalRecoveryObservation,
    readImportJournalIndexHealth,
    type ImportJournalIndexObservation,
    type ImportJournalIndexRow,
} from "./import-journal-index";
import { and, eq } from "drizzle-orm";
import { ensureDatabaseReady } from "@/lib/database/client";
import { downloadImportRuns, downloadImportedFiles, downloadRequests } from "@/lib/database/schema";

/**
 * The import journal deliberately lives beside `complete`, rather than below
 * it. Engine artifact sweeps can therefore reclaim a source directory without
 * erasing the evidence needed to account for a published library file.
 */
export const importJournalVersion = 2 as const;
export const importJournalRootName = "import-journals";
export const importJournalPlanFileName = "plan.json";
export const importJournalMaxBytes = 1024 * 1024;
export const importJournalMaxFiles = 1024;
export const importJournalMaxEntries = 256;

export type ImportJournalFilePlan = {
    index: number;
    sourcePath: string;
    destinationPath: string;
    sourceSizeBytes: number;
    sourceMtimeMs: number;
};

export type ImportJournalPlan = {
    version: typeof importJournalVersion;
    downloadId: string;
    requestId: string;
    userId: string;
    attemptId: string;
    sourceRootPath: string;
    destinationRootPath: string;
    files: ImportJournalFilePlan[];
};

export type ImportJournalHandle = {
    plan: ImportJournalPlan;
    journalPath: string;
    planPath: string;
};

export type ImportJournalMarker =
    | "planned"
    | "publishing"
    | "published-known"
    | "published-unknown"
    | "db-committed"
    | "retained"
    | "cleanup-pending"
    | "cleanup-complete"
    | "directory-sync-limited";

export type ImportJournalReceipt = {
    version: 1;
    index: number;
    sourcePath: string;
    destinationPath: string;
    device: string;
    inode: string;
    birthtimeMs: number;
    sizeBytes: number;
    mtimeMs: number;
};

export type ImportJournalDiagnostic = {
    id: string;
    userId: string | null;
    state:
        | "planned"
        | "publishing"
        | "published"
        | "retained"
        | "committed"
        | "cleanup-pending"
        | "malformed"
        | "foreign";
    message: string;
    journalPath?: string;
    attemptId?: string;
    downloadId?: string;
    durabilityWarning?: string;
    unresolvedTotal?: number;
    overflowCount?: number;
};

const markerNames = new Set<ImportJournalMarker>([
    "planned",
    "publishing",
    "published-known",
    "published-unknown",
    "db-committed",
    "retained",
    "cleanup-pending",
    "cleanup-complete",
    "directory-sync-limited",
]);

function hasCode(error: unknown, code: string) {
    return (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === code
    );
}

function journalRoot(rootPath = env.DOWNLOAD_ENGINE_DIR) {
    return path.join(path.resolve(/* turbopackIgnore: true */ rootPath), importJournalRootName);
}

function safeJournalSegment(value: string, label: string) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
        throw new Error(`The import ${label} is not safe for a journal directory.`);
    }

    return value;
}

function canonical(value: string) {
    return process.platform === "win32"
        ? path.resolve(/* turbopackIgnore: true */ value).toLowerCase()
        : path.resolve(/* turbopackIgnore: true */ value);
}

function isChild(rootPath: string, candidatePath: string) {
    const relative = path.relative(canonical(rootPath), canonical(candidatePath));

    return relative.length > 0 && !path.isAbsolute(relative) && !relative.startsWith("..");
}

function boundedPath(value: unknown, label: string) {
    if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
        throw new Error(`Import journal ${label} is invalid.`);
    }

    return value;
}

function safeInteger(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) {
        throw new Error(`Import journal ${label} is invalid.`);
    }

    return value;
}

function finiteTimestamp(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 8.64e15) {
        throw new Error("Import journal timestamp is invalid.");
    }

    return value;
}

function journalPathFor(downloadId: string, attemptId: string, rootPath?: string) {
    return path.join(
        journalRoot(rootPath),
        safeJournalSegment(downloadId, "download id"),
        safeJournalSegment(attemptId, "attempt id"),
    );
}

export function importJournalRootPath(rootPath = env.DOWNLOAD_ENGINE_DIR) {
    return journalRoot(rootPath);
}

export function importJournalPath(
    downloadId: string,
    attemptId: string,
    rootPath = env.DOWNLOAD_ENGINE_DIR,
) {
    return journalPathFor(downloadId, attemptId, rootPath);
}

/** Deterministic sibling claim used by both import and library scan. */
export function importDestinationClaimPath(destinationPath: string) {
    return path.join(
        path.dirname(destinationPath),
        `.${path.basename(destinationPath)}.nooklet-import.json`,
    );
}

async function syncDirectory(directoryPath: string) {
    try {
        const handle = await open(directoryPath, "r");

        try {
            await handle.sync();
        } finally {
            await handle.close();
        }

        return true;
    } catch (error) {
        // Node cannot fsync a directory on some Windows filesystems. File
        // contents are still fsynced; the result is exposed in diagnostics by
        // retaining the journal when a later marker cannot be observed.
        if (
            process.platform === "win32" &&
            (hasCode(error, "EINVAL") ||
                hasCode(error, "EPERM") ||
                hasCode(error, "EISDIR") ||
                hasCode(error, "ENOTSUP") ||
                hasCode(error, "EBADF"))
        ) {
            return false;
        }

        throw error;
    }
}

async function writeExclusiveJson(filePath: string, value: unknown) {
    const handle = await open(filePath, "wx", 0o600);

    try {
        await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }

    return syncDirectory(path.dirname(filePath));
}

/** A parseable prior write is not proof that fsync succeeded. Re-sync the same validated file. */
export async function syncExistingImportMetadata(
    filePath: string,
    validate: (value: unknown) => void,
    maxBytes = importJournalMaxBytes,
) {
    checkedDirectory(path.dirname(filePath));
    const before = await lstat(filePath);

    if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) {
        throw new Error("Import metadata is not a bounded regular file.");
    }

    const handle = await open(filePath, "r+");

    try {
        const opened = await handle.stat();
        const same = (entry: typeof opened) =>
            entry.isFile() &&
            !entry.isSymbolicLink() &&
            entry.dev === before.dev &&
            entry.ino === before.ino &&
            entry.birthtimeMs === before.birthtimeMs &&
            entry.size === before.size &&
            entry.mtimeMs === before.mtimeMs;

        if (!same(opened)) {
            throw new Error("Import metadata changed while opening.");
        }

        const buffer = Buffer.alloc(maxBytes + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);

        if (bytesRead > maxBytes || bytesRead !== opened.size) {
            throw new Error("Import metadata changed while reading.");
        }

        validate(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")));

        if (!same(await handle.stat())) {
            throw new Error("Import metadata changed before sync.");
        }

        await handle.sync();
        checkedDirectory(path.dirname(filePath));

        if (!same(await lstat(filePath))) {
            throw new Error("Import metadata pathname changed during sync.");
        }
    } finally {
        await handle.close();
    }

    await syncDirectory(path.dirname(filePath));
}

async function ensureJournalPlanDurable(journal: ImportJournalHandle) {
    await syncExistingImportMetadata(journal.planPath, (value) => {
        if (JSON.stringify(parsePlan(value)) !== JSON.stringify(journal.plan)) {
            throw new Error("Import plan changed before publication.");
        }
    });
    await markImportJournal(journal, "planned");
}

export async function ensureImportJournalPublicationReady(journal: ImportJournalHandle) {
    await ensureJournalPlanDurable(journal);
    await registerJournal(journal);
}

async function writeMarkerFile(filePath: string, value: unknown) {
    await mkdir(path.dirname(filePath), { recursive: true });
    checkedDirectory(path.dirname(filePath));

    try {
        await writeExclusiveJson(filePath, value);
    } catch (error) {
        if (!hasCode(error, "EEXIST")) {
            throw error;
        }

        const expected = value as Record<string, unknown>;

        await syncExistingImportMetadata(filePath, (actual) => {
            const existing = actual as Record<string, unknown>;

            for (const key of Object.keys(expected).filter(
                (key) => key !== "at" && key !== "message" && key !== "error",
            )) {
                if (JSON.stringify(existing[key]) !== JSON.stringify(expected[key])) {
                    throw new Error(
                        "Existing import journal evidence does not match this attempt.",
                    );
                }
            }
        });
    }
}

function markerFileName(marker: ImportJournalMarker, index?: number) {
    return index === undefined
        ? `${marker}.json`
        : `${marker}-${String(index).padStart(6, "0")}.json`;
}

export function importJournalMarkerPath(
    journal: ImportJournalHandle,
    marker: ImportJournalMarker,
    index?: number,
) {
    if (!markerNames.has(marker)) {
        throw new Error("Unknown import journal marker.");
    }

    return path.join(journal.journalPath, markerFileName(marker, index));
}

export function importJournalReceiptPath(journal: ImportJournalHandle, index: number) {
    safeInteger(index, "file index", importJournalMaxFiles);

    return path.join(journal.journalPath, "receipts", `${String(index).padStart(6, "0")}.json`);
}

export async function markImportJournal(
    journal: ImportJournalHandle,
    marker: ImportJournalMarker,
    index?: number,
    details: Record<string, unknown> = {},
) {
    const filePath = importJournalMarkerPath(journal, marker, index);

    await writeMarkerFile(filePath, {
        version: 1,
        marker,
        index: index ?? null,
        at: new Date().toISOString(),
        ...details,
    });

    return filePath;
}

export async function writeImportJournalReceipt(
    journal: ImportJournalHandle,
    receipt: ImportJournalReceipt,
) {
    const filePath = importJournalReceiptPath(journal, receipt.index);

    await writeMarkerFile(filePath, receipt);

    return filePath;
}

export async function createImportJournal(input: {
    downloadId: string;
    requestId: string;
    userId: string;
    sourceRootPath: string;
    destinationRootPath: string;
    files: Array<Omit<ImportJournalFilePlan, "index">>;
    attemptId?: string;
    rootPath?: string;
}) {
    const attemptId = input.attemptId ?? randomUUID();
    const sourceRootPath = path.resolve(
        /* turbopackIgnore: true */ boundedPath(input.sourceRootPath, "source root"),
    );
    const destinationRootPath = path.resolve(
        /* turbopackIgnore: true */ boundedPath(input.destinationRootPath, "destination root"),
    );

    if (!input.files.length || input.files.length > importJournalMaxFiles) {
        throw new Error("Import journal file count is outside the supported bounds.");
    }

    const files = input.files.map((file, index) => {
        const sourcePath = path.resolve(
            /* turbopackIgnore: true */ boundedPath(file.sourcePath, "source path"),
        );
        const destinationPath = path.resolve(
            /* turbopackIgnore: true */ boundedPath(file.destinationPath, "destination path"),
        );

        if (
            (!isChild(sourceRootPath, sourcePath) &&
                canonical(sourceRootPath) !== canonical(sourcePath)) ||
            !isChild(destinationRootPath, destinationPath)
        ) {
            throw new Error("Import journal file path escaped its declared root.");
        }

        return {
            index,
            sourcePath,
            destinationPath,
            sourceSizeBytes: safeInteger(file.sourceSizeBytes, "source size"),
            sourceMtimeMs: finiteTimestamp(file.sourceMtimeMs),
        } satisfies ImportJournalFilePlan;
    });

    const plan = {
        version: importJournalVersion,
        downloadId: safeJournalSegment(input.downloadId, "download id"),
        requestId: boundedPath(input.requestId, "request id"),
        userId: boundedPath(input.userId, "user id"),
        attemptId: safeJournalSegment(attemptId, "attempt id"),
        sourceRootPath,
        destinationRootPath,
        files,
    } satisfies ImportJournalPlan;
    const journalPath = journalPathFor(plan.downloadId, plan.attemptId, input.rootPath);
    const planPath = path.join(journalPath, importJournalPlanFileName);

    const engineRoot = input.rootPath ?? env.DOWNLOAD_ENGINE_DIR;

    await initializeImportJournalRecovery(engineRoot);
    // Register the intended metadata path first. A failed plan fsync must remain discoverable in this process.
    registerImportJournalIndexEntry(engineRoot, {
        relativePath: plan.downloadId + "/" + plan.attemptId,
        state: "planned",
        classification: "malformed",
    });

    await mkdir(journalRoot(input.rootPath), { recursive: true });
    checkedDirectory(journalRoot(input.rootPath));
    await mkdir(path.dirname(journalPath), { recursive: true });
    checkedDirectory(path.dirname(journalPath));
    await mkdir(journalPath, { recursive: true });
    checkedDirectory(journalPath);
    await syncDirectory(journalRoot(input.rootPath));
    await syncDirectory(path.dirname(journalPath));

    try {
        if (Buffer.byteLength(JSON.stringify(plan), "utf8") > importJournalMaxBytes) {
            throw new Error("Import journal plan exceeds its size limit.");
        }

        const directorySynced = await writeExclusiveJson(planPath, plan);

        if (!directorySynced) {
            await markImportJournal({ plan, journalPath, planPath }, "directory-sync-limited");
        }

        await markImportJournal({ plan, journalPath, planPath }, "planned");
    } catch (error) {
        if (!hasCode(error, "EEXIST")) {
            throw error;
        }

        throw new Error(`Import attempt journal already exists: ${plan.attemptId}`);
    }

    const journal = { plan, journalPath, planPath } satisfies ImportJournalHandle;

    await registerJournal(journal);

    return journal;
}

function parsePlan(value: unknown): ImportJournalPlan {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Import journal plan is malformed.");
    }

    const candidate = value as Record<string, unknown>;
    const keys = Object.keys(candidate).sort().join("\0");

    if (
        keys !==
        "attemptId\0destinationRootPath\0downloadId\0files\0requestId\0sourceRootPath\0userId\0version"
    ) {
        throw new Error("Import journal plan has an invalid shape.");
    }

    const plan = candidate as Partial<ImportJournalPlan>;

    if (
        plan.version !== importJournalVersion ||
        typeof plan.downloadId !== "string" ||
        typeof plan.requestId !== "string" ||
        typeof plan.userId !== "string" ||
        typeof plan.attemptId !== "string" ||
        !Array.isArray(plan.files)
    ) {
        throw new Error("Import journal plan has invalid identity fields.");
    }

    safeJournalSegment(plan.downloadId, "download id");
    safeJournalSegment(plan.attemptId, "attempt id");
    boundedPath(plan.requestId, "request id");
    boundedPath(plan.userId, "user id");
    const sourceRootPath = path.resolve(
        /* turbopackIgnore: true */ boundedPath(plan.sourceRootPath, "source root"),
    );
    const destinationRootPath = path.resolve(
        /* turbopackIgnore: true */ boundedPath(plan.destinationRootPath, "destination root"),
    );

    if (plan.files.length === 0 || plan.files.length > importJournalMaxFiles) {
        throw new Error("Import journal plan has an invalid file count.");
    }

    const files = plan.files.map((file, index) => {
        if (!file || typeof file !== "object" || Array.isArray(file)) {
            throw new Error("Import journal file plan is malformed.");
        }

        const candidateFile = file as Record<string, unknown>;

        if (
            Object.keys(candidateFile).sort().join("\0") !==
            "destinationPath\0index\0sourceMtimeMs\0sourcePath\0sourceSizeBytes"
        ) {
            throw new Error("Import journal file plan has an invalid shape.");
        }

        const sourcePath = path.resolve(
            /* turbopackIgnore: true */ boundedPath(candidateFile.sourcePath, "source path"),
        );
        const destinationPath = path.resolve(
            /* turbopackIgnore: true */ boundedPath(
                candidateFile.destinationPath,
                "destination path",
            ),
        );

        if (
            candidateFile.index !== index ||
            (!isChild(sourceRootPath, sourcePath) &&
                canonical(sourceRootPath) !== canonical(sourcePath)) ||
            !isChild(destinationRootPath, destinationPath)
        ) {
            throw new Error("Import journal file path escaped its declared root.");
        }

        return {
            index,
            sourcePath,
            destinationPath,
            sourceSizeBytes: safeInteger(candidateFile.sourceSizeBytes, "source size"),
            sourceMtimeMs: finiteTimestamp(candidateFile.sourceMtimeMs),
        } satisfies ImportJournalFilePlan;
    });

    return {
        version: importJournalVersion,
        downloadId: plan.downloadId,
        requestId: plan.requestId,
        userId: plan.userId,
        attemptId: plan.attemptId,
        sourceRootPath,
        destinationRootPath,
        files,
    };
}

/** Validate a bounded regular file before reading; never follow journal symlinks. */
function readBoundedJsonSync(filePath: string, maxBytes = importJournalMaxBytes): unknown {
    const before = lstatSync(filePath);

    if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) {
        throw new Error("Import journal evidence is not a bounded regular file.");
    }

    const descriptor = openSync(filePath, "r");

    try {
        const opened = fstatSync(descriptor);

        if (
            !opened.isFile() ||
            opened.size > maxBytes ||
            opened.dev !== before.dev ||
            opened.ino !== before.ino
        ) {
            throw new Error("Import journal evidence changed while opening.");
        }

        // A bounded buffer prevents a concurrently growing file from causing an unbounded read.
        const bytes = Buffer.alloc(maxBytes + 1);
        const count = readSync(descriptor, bytes, 0, bytes.length, 0);

        if (count > maxBytes) {
            throw new Error("Import journal evidence is too large.");
        }

        return JSON.parse(bytes.subarray(0, count).toString("utf8"));
    } finally {
        closeSync(descriptor);
    }
}

function checkedDirectory(directoryPath: string) {
    const entry = lstatSync(directoryPath);

    if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        canonical(realpathSync(directoryPath)) !== canonical(directoryPath)
    ) {
        throw new Error("Import journal directory is not trusted.");
    }
}

function loadJournalSync(downloadId: string, attemptId: string, rootPath: string) {
    const journalPath = journalPathFor(downloadId, attemptId, rootPath);

    checkedDirectory(journalRoot(rootPath));
    checkedDirectory(path.dirname(journalPath));
    checkedDirectory(journalPath);
    const planPath = path.join(journalPath, importJournalPlanFileName);
    const plan = parsePlan(readBoundedJsonSync(planPath));

    if (plan.downloadId !== downloadId || plan.attemptId !== attemptId) {
        throw new Error("Import journal identity does not match its directory.");
    }

    return { plan, journalPath, planPath } satisfies ImportJournalHandle;
}

export async function loadImportJournal(
    downloadId: string,
    attemptId: string,
    rootPath = env.DOWNLOAD_ENGINE_DIR,
) {
    try {
        return loadJournalSync(downloadId, attemptId, rootPath);
    } catch (error) {
        if (hasCode(error, "ENOENT")) {
            return null;
        }

        throw error;
    }
}

type JournalEntry = ImportJournalHandle | { journalPath: string; error: string; foreign?: boolean };

function journalEngineRoot(journal: ImportJournalHandle) {
    return path.dirname(path.dirname(path.dirname(journal.journalPath)));
}

/** Exact-download operations intentionally have no global sample limit. */
export async function* iterateDownloadImportJournals(
    downloadId: string,
    rootPath = env.DOWNLOAD_ENGINE_DIR,
): AsyncGenerator<JournalEntry> {
    const downloadPath = path.join(
        journalRoot(rootPath),
        safeJournalSegment(downloadId, "download id"),
    );
    let directory: Awaited<ReturnType<typeof opendir>>;

    try {
        checkedDirectory(journalRoot(rootPath));
        checkedDirectory(downloadPath);
        directory = await opendir(downloadPath);
    } catch (error) {
        if (!hasCode(error, "ENOENT")) {
            yield {
                journalPath: downloadPath,
                error: "Import journal download directory could not be read.",
            };
        }

        return;
    }

    for await (const attempt of directory) {
        const journalPath = path.join(downloadPath, attempt.name);

        if (!attempt.isDirectory()) {
            yield {
                journalPath,
                error: "Unexpected import journal entry retained.",
                foreign: true,
            };
            continue;
        }

        try {
            yield loadJournalSync(downloadId, attempt.name, rootPath);
        } catch {
            yield { journalPath, error: "Malformed import journal retained for inspection." };
        }
    }
}

async function* discoverImportJournals(rootPath: string): AsyncGenerator<JournalEntry> {
    let directory: Awaited<ReturnType<typeof opendir>>;

    try {
        checkedDirectory(journalRoot(rootPath));
        directory = await opendir(journalRoot(rootPath));
    } catch (error) {
        if (hasCode(error, "ENOENT")) {
            return;
        }

        throw error;
    }

    for await (const download of directory) {
        if (!download.isDirectory() || !/^[A-Za-z0-9_-]{1,160}$/.test(download.name)) {
            yield {
                journalPath: path.join(journalRoot(rootPath), download.name),
                error: "Unexpected journal root entry retained.",
                foreign: true,
            };
            continue;
        }

        yield* iterateDownloadImportJournals(download.name, rootPath);
    }
}

function indexObservation(entry: JournalEntry, rootPath: string): ImportJournalIndexObservation {
    const relativePath = path
        .relative(journalRoot(rootPath), entry.journalPath)
        .replaceAll(path.sep, "/");

    if (!("plan" in entry)) {
        return {
            relativePath,
            classification: entry.foreign ? "foreign" : "malformed",
            state: entry.foreign ? "foreign" : "malformed",
        };
    }

    try {
        return {
            relativePath,
            classification: "journal",
            state: journalState(entry),
            userId: entry.plan.userId,
            downloadId: entry.plan.downloadId,
            attemptId: entry.plan.attemptId,
        };
    } catch {
        return { relativePath, classification: "malformed", state: "malformed" };
    }
}

export async function initializeImportJournalRecovery(
    rootPath = env.DOWNLOAD_ENGINE_DIR,
    options: { force?: boolean } = {},
) {
    await initializeImportJournalIndex(
        rootPath,
        async function* () {
            for await (const entry of discoverImportJournals(rootPath)) {
                yield indexObservation(entry, rootPath);
            }
        },
        options.force,
    );
}

function loadIndexedEntry(row: ImportJournalIndexRow, rootPath: string): JournalEntry {
    const root = journalRoot(rootPath);
    const candidate = path.resolve(root, row.relative_path);

    if (!isChild(root, candidate)) {
        return {
            journalPath: path.join(root, "invalid-index-entry"),
            error: "Invalid indexed journal entry retained.",
        };
    }

    const parts = row.relative_path.split("/");

    if (parts.length !== 2) {
        return {
            journalPath: candidate,
            error: "Unexpected journal entry retained.",
            foreign: true,
        };
    }

    try {
        return loadJournalSync(parts[0], parts[1], rootPath);
    } catch {
        return {
            journalPath: candidate,
            error: "Malformed import journal retained for inspection.",
        };
    }
}

export async function listImportJournals(rootPath = env.DOWNLOAD_ENGINE_DIR) {
    await initializeImportJournalRecovery(rootPath);

    return readImportJournalRecoveryPage(rootPath).rows.map((row) =>
        loadIndexedEntry(row, rootPath),
    );
}

async function registerJournal(journal: ImportJournalHandle) {
    const rootPath = journalEngineRoot(journal);

    await initializeImportJournalRecovery(rootPath);

    try {
        registerImportJournalIndexEntry(rootPath, indexObservation(journal, rootPath));
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        if (!["ENOENT", "SQLITE_NOTADB", "SQLITE_CORRUPT"].includes(code ?? "")) {
            throw error;
        }

        await initializeImportJournalRecovery(rootPath, { force: true });
        registerImportJournalIndexEntry(rootPath, indexObservation(journal, rootPath));
    }
}

function refreshJournalIndex(journal: ImportJournalHandle) {
    try {
        registerImportJournalIndexEntry(
            journalEngineRoot(journal),
            indexObservation(journal, journalEngineRoot(journal)),
        );
    } catch {
        // Index failure never overrides authoritative commit or permits cleanup; Health reports unavailable/stale metadata.
    }
}

function markerExists(journalPath: string, marker: ImportJournalMarker, index?: number) {
    try {
        const value = readBoundedJsonSync(
            path.join(journalPath, markerFileName(marker, index)),
            16 * 1024,
        ) as Record<string, unknown>;

        if (value.version !== 1 || value.marker !== marker || value.index !== (index ?? null)) {
            throw new Error("Import journal marker is malformed.");
        }

        return true;
    } catch (error) {
        if (hasCode(error, "ENOENT")) {
            return false;
        }

        throw error;
    }
}

function journalState(journal: ImportJournalHandle) {
    if (markerExists(journal.journalPath, "db-committed")) {
        return markerExists(journal.journalPath, "cleanup-complete")
            ? ("committed" as const)
            : ("cleanup-pending" as const);
    }

    if (
        markerExists(journal.journalPath, "retained") ||
        markerExists(journal.journalPath, "cleanup-pending")
    ) {
        return "retained" as const;
    }

    for (const file of journal.plan.files) {
        if (markerExists(journal.journalPath, "published-unknown", file.index)) {
            return "retained" as const;
        }
    }

    for (const file of journal.plan.files) {
        if (markerExists(journal.journalPath, "published-known", file.index)) {
            return "published" as const;
        }
    }

    if (
        markerExists(journal.journalPath, "publishing") ||
        journal.plan.files.some((file) =>
            markerExists(journal.journalPath, "publishing", file.index),
        )
    ) {
        return "publishing" as const;
    }

    return "planned" as const;
}

/** Exact attempt and exact file rows, never request status alone, prove commit. */
export function isImportJournalDatabaseCommitted(journal: ImportJournalHandle) {
    const database = ensureDatabaseReady();
    const run = database
        .select()
        .from(downloadImportRuns)
        .where(
            and(
                eq(downloadImportRuns.id, journal.plan.attemptId),
                eq(downloadImportRuns.requestId, journal.plan.requestId),
                eq(downloadImportRuns.userId, journal.plan.userId),
                eq(downloadImportRuns.status, "succeeded"),
            ),
        )
        .get();

    if (!run || canonical(run.sourceRootPath) !== canonical(journal.plan.sourceRootPath)) {
        return false;
    }

    const files = database
        .select()
        .from(downloadImportedFiles)
        .where(
            and(
                eq(downloadImportedFiles.importRunId, journal.plan.attemptId),
                eq(downloadImportedFiles.userId, journal.plan.userId),
            ),
        )
        .all();

    return (
        files.length === journal.plan.files.length &&
        journal.plan.files.every((planned) =>
            files.some(
                (file) =>
                    canonical(file.sourcePath) === canonical(planned.sourcePath) &&
                    canonical(file.destinationPath) === canonical(planned.destinationPath),
            ),
        )
    );
}

/** Synchronous, bounded, and only reads engine metadata and SQLite, never media roots. */
export function listImportJournalDiagnosticsSync(
    userId?: string,
    rootPath = env.DOWNLOAD_ENGINE_DIR,
): ImportJournalDiagnostic[] {
    const index = readImportJournalIndexHealth(rootPath, userId);
    const diagnostics = index.rows
        .map((row) => loadIndexedEntry(row, rootPath))
        .flatMap<ImportJournalDiagnostic>((entry) => {
            const id = createHash("sha256").update(entry.journalPath).digest("hex").slice(0, 24);

            if (!("plan" in entry)) {
                return [
                    {
                        id,
                        userId: null,
                        state: entry.foreign ? ("foreign" as const) : ("malformed" as const),
                        message: entry.error,
                    },
                ];
            }

            if (userId && entry.plan.userId !== userId) {
                return [];
            }

            try {
                const state = journalState(entry);
                const request = ensureDatabaseReady()
                    .select({ id: downloadRequests.id })
                    .from(downloadRequests)
                    .where(
                        and(
                            eq(downloadRequests.id, entry.plan.requestId),
                            eq(downloadRequests.userId, entry.plan.userId),
                        ),
                    )
                    .get();

                return [
                    {
                        id,
                        userId: userId ? entry.plan.userId : null,
                        state,
                        message:
                            state === "committed"
                                ? "Import committed and private claim cleanup completed."
                                : !request
                                  ? "Orphaned import output is retained; its request no longer exists."
                                  : state === "cleanup-pending"
                                    ? "Import committed; private claim cleanup is pending."
                                    : "Import output is retained pending durable recovery.",
                        ...(userId
                            ? {
                                  journalPath: entry.journalPath,
                                  attemptId: entry.plan.attemptId,
                                  downloadId: entry.plan.downloadId,
                              }
                            : {}),
                        ...(markerExists(entry.journalPath, "directory-sync-limited")
                            ? {
                                  durabilityWarning:
                                      "This filesystem does not support directory fsync through Node; file contents are synced, but power-loss durability is not guaranteed.",
                              }
                            : {}),
                    },
                ];
            } catch {
                return [
                    {
                        id,
                        userId: null,
                        state: "malformed" as const,
                        message:
                            "Import journal evidence could not be validated; output is retained.",
                    },
                ];
            }
        });

    if (index.overflow > 0) {
        diagnostics.push({
            id: "import-journal-overflow",
            userId: null,
            state: "retained",
            message:
                "Import journal inspection limit reached: " +
                index.total +
                " unresolved entries; " +
                index.overflow +
                " additional entries are retained.",
            unresolvedTotal: index.total,
            overflowCount: index.overflow,
        });
    }

    if (index.error) {
        diagnostics.push({
            id: "import-journal-index",
            userId: null,
            state: "malformed",
            message: index.error,
            unresolvedTotal: index.total,
            overflowCount: index.overflow,
        });
    }

    return diagnostics;
}

export async function markImportJournalRetained(journal: ImportJournalHandle, message: string) {
    await markImportJournal(journal, "retained", undefined, { message: message.slice(0, 2048) });

    return journal.journalPath;
}

export async function markImportJournalCommitted(journal: ImportJournalHandle) {
    if (!isImportJournalDatabaseCommitted(journal)) {
        throw new Error("Import journal lacks correlated database commit evidence.");
    }

    await markImportJournal(journal, "db-committed");

    return journal.journalPath;
}

export async function markImportJournalCleanupPending(
    journal: ImportJournalHandle,
    message: string,
) {
    await markImportJournal(journal, "cleanup-pending", undefined, {
        message: message.slice(0, 2048),
    });

    return journal.journalPath;
}

/** Ancestor checks reject redirection. Trusted stable roots remain required by Node's pathname API. */
export async function assertImportDestinationAncestors(
    journal: ImportJournalHandle,
    destinationPath: string,
) {
    if (!isChild(journal.plan.destinationRootPath, destinationPath)) {
        throw new Error("Import destination escaped its root.");
    }

    const root = journal.plan.destinationRootPath;
    const canonicalRoot = await realpath(root);

    if (canonical(root) !== canonical(canonicalRoot)) {
        throw new Error("Import destination root was redirected.");
    }

    let current = root;

    for (const segment of path
        .relative(root, path.dirname(destinationPath))
        .split(path.sep)
        .filter(Boolean)) {
        current = path.join(current, segment);
        const entry = await lstat(current);

        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            throw new Error("Import destination ancestor was redirected.");
        }
    }
}

export async function verifyImportJournalPublishedFile(
    journal: ImportJournalHandle,
    index: number,
) {
    const planned = journal.plan.files[index];

    if (!planned) {
        return false;
    }

    try {
        await assertImportDestinationAncestors(journal, planned.destinationPath);
        let receipt!: ImportJournalReceipt;

        await syncExistingImportMetadata(
            importJournalReceiptPath(journal, index),
            (value) => {
                receipt = value as ImportJournalReceipt;
            },
            16 * 1024,
        );
        const target = await lstat(planned.destinationPath);

        return (
            receipt.version === 1 &&
            receipt.index === index &&
            receipt.sourcePath === planned.sourcePath &&
            receipt.destinationPath === planned.destinationPath &&
            target.isFile() &&
            !target.isSymbolicLink() &&
            String(target.dev) === receipt.device &&
            String(target.ino) === receipt.inode &&
            target.birthtimeMs === receipt.birthtimeMs &&
            target.size === receipt.sizeBytes &&
            target.mtimeMs === receipt.mtimeMs &&
            target.size === planned.sourceSizeBytes
        );
    } catch {
        return false;
    }
}

export async function assertImportJournalReadyForPersistence(journal: ImportJournalHandle) {
    for (const file of journal.plan.files) {
        if (
            markerExists(journal.journalPath, "publishing", file.index) &&
            !(await verifyImportJournalPublishedFile(journal, file.index))
        ) {
            throw new Error("Published import output changed before database persistence.");
        }
    }
}

export async function completeImportJournalCleanup(journal: ImportJournalHandle) {
    await markImportJournalCommitted(journal);

    for (const file of journal.plan.files) {
        const claimPath = importDestinationClaimPath(file.destinationPath);

        try {
            await assertImportDestinationAncestors(journal, file.destinationPath);
        } catch {
            await markImportJournalCleanupPending(
                journal,
                "Import destination ancestors could not be verified for private claim cleanup.",
            );

            return false;
        }

        try {
            const claimEntry = await lstat(claimPath);
            const claim = readBoundedJsonSync(claimPath, 16 * 1024) as Record<string, unknown>;

            if (!(await verifyImportJournalPublishedFile(journal, file.index))) {
                throw new Error("The committed import destination changed; its claim is retained.");
            }

            if (
                claim.version !== 2 ||
                claim.attemptId !== journal.plan.attemptId ||
                claim.downloadId !== journal.plan.downloadId ||
                claim.requestId !== journal.plan.requestId ||
                claim.fileIndex !== file.index ||
                claim.sourcePath !== file.sourcePath ||
                claim.destinationPath !== file.destinationPath
            ) {
                throw new Error("Import claim ownership is uncertain.");
            }

            const current = await lstat(claimPath);

            if (
                current.dev !== claimEntry.dev ||
                current.ino !== claimEntry.ino ||
                current.mtimeMs !== claimEntry.mtimeMs ||
                current.size !== claimEntry.size
            ) {
                throw new Error("Import claim changed during cleanup.");
            }

            // Only private metadata is removed. No final-library pathname is ever a cleanup target.
            await unlink(claimPath);
            await syncDirectory(path.dirname(claimPath));
        } catch (error) {
            if (!hasCode(error, "ENOENT")) {
                await markImportJournalCleanupPending(
                    journal,
                    "Private import claim cleanup requires inspection.",
                );

                return false;
            }
        }
    }

    await markImportJournal(journal, "cleanup-complete");
    refreshJournalIndex(journal);

    return true;
}

async function recoverJournal(entry: JournalEntry) {
    if (!("plan" in entry)) {
        return;
    }

    try {
        if (isImportJournalDatabaseCommitted(entry)) {
            await completeImportJournalCleanup(entry);
        } else {
            await markImportJournalRetained(
                entry,
                "Interrupted import retained for recovery; no final library path was removed.",
            );
        }
    } catch {
        // The synced immutable plan survives even when recovery metadata cannot advance.
    }
}

export async function recoverImportJournals(
    options: { rootPath?: string; userId?: string; downloadId?: string } = {},
) {
    const rootPath = options.rootPath ?? env.DOWNLOAD_ENGINE_DIR;

    if (options.downloadId) {
        for await (const entry of iterateDownloadImportJournals(options.downloadId, rootPath)) {
            if (!("plan" in entry) || !options.userId || entry.plan.userId === options.userId) {
                await recoverJournal(entry);
            }
        }

        return { inspectedKeys: [] as string[], nextCursor: "", unresolvedCount: 0 };
    }

    await initializeImportJournalRecovery(rootPath);

    if (options.userId) {
        const scoped = readImportJournalIndexHealth(rootPath, options.userId);
        const inspectedKeys: string[] = [];

        for (const row of scoped.rows) {
            const entry = loadIndexedEntry(row, rootPath);

            if (!("plan" in entry) || entry.plan.userId !== options.userId) {
                continue;
            }

            await recoverJournal(entry);
            registerImportJournalIndexEntry(rootPath, indexObservation(entry, rootPath));
            inspectedKeys.push(row.entry_key);
        }

        return {
            inspectedKeys,
            nextCursor: readImportJournalRecoveryPage(rootPath).cursor,
            unresolvedCount: readImportJournalIndexHealth(rootPath).total,
        };
    }

    const page = readImportJournalRecoveryPage(rootPath);
    const inspectedKeys: string[] = [];

    for (const row of page.rows) {
        const entry = loadIndexedEntry(row, rootPath);

        if (!("plan" in entry) || !options.userId || entry.plan.userId === options.userId) {
            await recoverJournal(entry);
        }

        recordImportJournalRecoveryObservation(
            rootPath,
            row.entry_key,
            indexObservation(entry, rootPath),
        );
        inspectedKeys.push(row.entry_key);
    }

    return {
        inspectedKeys,
        nextCursor: inspectedKeys.at(-1) ?? page.cursor,
        unresolvedCount: readImportJournalIndexHealth(rootPath).total,
    };
}

export async function canConsumeImportJournalSources(
    downloadId: string,
    rootPath = env.DOWNLOAD_ENGINE_DIR,
) {
    for await (const entry of iterateDownloadImportJournals(downloadId, rootPath)) {
        if (!("plan" in entry) || !isImportJournalDatabaseCommitted(entry)) {
            return false;
        }

        try {
            await ensureJournalPlanDurable(entry);
            await syncExistingImportMetadata(
                importJournalMarkerPath(entry, "db-committed"),
                (value) => {
                    const marker = value as Record<string, unknown>;

                    if (
                        marker.version !== 1 ||
                        marker.marker !== "db-committed" ||
                        marker.index !== null
                    ) {
                        throw new Error("Import commit marker is invalid.");
                    }
                },
            );
        } catch {
            return false;
        }
    }

    return true;
}

/** Reuse only the exact download's immutable, re-synced attempt. */
export async function findReusableImportJournal(input: Parameters<typeof createImportJournal>[0]) {
    for await (const entry of iterateDownloadImportJournals(input.downloadId, input.rootPath)) {
        if (!("plan" in entry)) {
            throw new Error(entry.error);
        }

        if (entry.plan.requestId !== input.requestId || entry.plan.userId !== input.userId) {
            continue;
        }

        if (
            canonical(entry.plan.sourceRootPath) !== canonical(input.sourceRootPath) ||
            canonical(entry.plan.destinationRootPath) !== canonical(input.destinationRootPath) ||
            entry.plan.files.length !== input.files.length
        ) {
            continue;
        }

        if (
            entry.plan.files.every((file, index) => {
                const expected = input.files[index];

                return (
                    canonical(file.sourcePath) === canonical(expected.sourcePath) &&
                    canonical(file.destinationPath) === canonical(expected.destinationPath) &&
                    file.sourceSizeBytes === expected.sourceSizeBytes &&
                    file.sourceMtimeMs === expected.sourceMtimeMs
                );
            })
        ) {
            await ensureImportJournalPublicationReady(entry);

            return entry;
        }
    }

    return null;
}
