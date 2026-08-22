import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";

import { ensureDatabaseReady, type AppDatabase } from "@/lib/database/client";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-box";
import {
    engineDownloads,
    type EngineDownloadCategory,
    type EngineDownloadControlIntent,
    type EngineDownloadFailureKind,
    type EngineDownloadState,
} from "@/lib/database/schema";

export type EngineDownloadRecord = typeof engineDownloads.$inferSelect;
export type CreateEngineDownloadInput = {
    userId: string;
    name: string;
    category: EngineDownloadCategory;
    nzbXml: string;
    password?: string | null;
    totalBytes: number;
    totalSegments: number;
    priority?: number;
};
export type EngineDownloadCapacityReservation =
    | {
          created: true;
          record: EngineDownloadRecord;
          activeRemainingBytes: number;
          activeWorkspaceBytes: number;
          requiredBytes: number;
      }
    | {
          created: false;
          activeRemainingBytes: number;
          activeWorkspaceBytes: number;
          requiredBytes: number;
      };
export type ActiveEngineDownloadCapacityUsage = {
    activeRemainingBytes: number;
    activeWorkspaceBytes: number;
};

function decryptStoredValue(value: string) {
    return /^v\d+:/.test(value) ? decryptSecret(value) : value;
}

/** Decrypts sensitive queue payloads while accepting pre-encryption rows. */
export function resolveEngineDownloadPayload(record: EngineDownloadRecord) {
    return {
        nzbXml: decryptStoredValue(record.nzbXml),
        password: record.password ? decryptStoredValue(record.password) : null,
    };
}

export const activeEngineDownloadStates = [
    "queued",
    "fetching",
    "repairing",
    "extracting",
    "paused",
] as const satisfies readonly EngineDownloadState[];

export const enginePostProcessingStates = [
    "repairing",
    "extracting",
] as const satisfies readonly EngineDownloadState[];

export function isEngineDownloadPostProcessing(state: EngineDownloadState) {
    return (enginePostProcessingStates as readonly EngineDownloadState[]).includes(state);
}

function summarizeActiveEngineDownloadCapacity(
    rows: Array<{ totalBytes: number; downloadedBytes: number }>,
): ActiveEngineDownloadCapacityUsage {
    return rows.reduce<ActiveEngineDownloadCapacityUsage>(
        (usage, row) => {
            const remainingBytes = Math.max(0, row.totalBytes - row.downloadedBytes);

            usage.activeRemainingBytes += remainingBytes;
            // Free-space readings already exclude the bytes downloaded so far.
            // Future headroom must cover the unfinished transfer plus a complete
            // post-processing/output copy for each active download.
            usage.activeWorkspaceBytes += row.totalBytes + remainingBytes;

            return usage;
        },
        { activeRemainingBytes: 0, activeWorkspaceBytes: 0 },
    );
}

export async function createEngineDownload(
    input: CreateEngineDownloadInput,
): Promise<EngineDownloadRecord> {
    const database = ensureDatabaseReady();
    const id = randomUUID();

    database
        .insert(engineDownloads)
        .values({
            id,
            userId: input.userId,
            name: input.name,
            category: input.category,
            nzbXml: encryptSecret(input.nzbXml),
            password: input.password ? encryptSecret(input.password) : null,
            totalBytes: input.totalBytes,
            totalSegments: input.totalSegments,
            priority: input.priority ?? 0,
            state: "queued",
        })
        .run();

    return database.select().from(engineDownloads).where(eq(engineDownloads.id, id)).get()!;
}

/**
 * Reserves disk capacity and inserts the queue row in one SQLite transaction.
 * This closes the admission race where two concurrent requests could both
 * observe the same free space before either one became visible as reserved.
 */
export async function createEngineDownloadWithCapacityReservation(
    input: CreateEngineDownloadInput,
    capacity: {
        availableBytes: number;
        minimumFreeSpaceReserveBytes: number;
        workspaceMultiplier: number;
    },
): Promise<EngineDownloadCapacityReservation> {
    const database = ensureDatabaseReady();

    return database.transaction((transaction) => {
        const activeRows = transaction
            .select({
                totalBytes: engineDownloads.totalBytes,
                downloadedBytes: engineDownloads.downloadedBytes,
            })
            .from(engineDownloads)
            .where(inArray(engineDownloads.state, [...activeEngineDownloadStates]))
            .all();
        const { activeRemainingBytes, activeWorkspaceBytes } =
            summarizeActiveEngineDownloadCapacity(activeRows);
        const requiredBytes =
            capacity.minimumFreeSpaceReserveBytes +
            activeWorkspaceBytes +
            input.totalBytes * capacity.workspaceMultiplier;

        if (
            !Number.isSafeInteger(requiredBytes) ||
            !Number.isSafeInteger(capacity.availableBytes) ||
            capacity.availableBytes < requiredBytes
        ) {
            return {
                created: false,
                activeRemainingBytes,
                activeWorkspaceBytes,
                requiredBytes,
            };
        }

        const id = randomUUID();

        transaction
            .insert(engineDownloads)
            .values({
                id,
                userId: input.userId,
                name: input.name,
                category: input.category,
                nzbXml: encryptSecret(input.nzbXml),
                password: input.password ? encryptSecret(input.password) : null,
                totalBytes: input.totalBytes,
                totalSegments: input.totalSegments,
                priority: input.priority ?? 0,
                state: "queued",
            })
            .run();
        const record = transaction
            .select()
            .from(engineDownloads)
            .where(eq(engineDownloads.id, id))
            .get()!;

        return {
            created: true,
            record,
            activeRemainingBytes,
            activeWorkspaceBytes,
            requiredBytes,
        };
    });
}

export async function findEngineDownloadById(userId: string, id: string) {
    const database = ensureDatabaseReady();

    return (
        database
            .select()
            .from(engineDownloads)
            .where(and(eq(engineDownloads.userId, userId), eq(engineDownloads.id, id)))
            .get() ?? null
    );
}

/**
 * Next queued download (across all users) in run order, without claiming it.
 * The runner checks whether it fits on disk before committing, so a download
 * it cannot run never churns `updatedAt` and stays visible as stalled.
 */
export async function peekNextQueuedEngineDownload(
    excludeIds: readonly string[] = [],
): Promise<EngineDownloadRecord | null> {
    return (
        ensureDatabaseReady()
            .select()
            .from(engineDownloads)
            .where(
                and(
                    eq(engineDownloads.state, "queued"),
                    isNull(engineDownloads.controlIntent),
                    excludeIds.length > 0
                        ? notInArray(engineDownloads.id, [...excludeIds])
                        : undefined,
                ),
            )
            .orderBy(asc(engineDownloads.priority), asc(engineDownloads.createdAt))
            .limit(1)
            .get() ?? null
    );
}

/** Atomically claims one specific queued download for the in-process runner. */
export async function claimQueuedEngineDownload(id: string): Promise<EngineDownloadRecord | null> {
    const database = ensureDatabaseReady();
    const claimed = database
        .update(engineDownloads)
        .set({
            state: "fetching",
            downloadedBytes: 0,
            completedSegments: 0,
            failedSegments: 0,
            bytesPerSecond: null,
            errorMessage: null,
            failureKind: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(engineDownloads.id, id),
                eq(engineDownloads.state, "queued"),
                isNull(engineDownloads.controlIntent),
            ),
        )
        .run();

    if (claimed.changes === 0) {
        return null;
    }

    return database.select().from(engineDownloads).where(eq(engineDownloads.id, id)).get() ?? null;
}

/**
 * Records why a queued download is not starting, without touching
 * `updatedAt` and only when the reason actually changes.
 *
 * Both matter: rewriting the row on every pass reset the diagnostic window so
 * a permanently stuck queue kept reporting healthy.
 */
export async function markEngineDownloadWaitingForCapacity(id: string, message: string) {
    const result = ensureDatabaseReady()
        .update(engineDownloads)
        .set({ errorMessage: message })
        .where(
            and(
                eq(engineDownloads.id, id),
                eq(engineDownloads.state, "queued"),
                or(isNull(engineDownloads.errorMessage), ne(engineDownloads.errorMessage, message)),
            ),
        )
        .run();

    return result.changes > 0;
}

/**
 * Atomically claims the next queued download (across all users) for the
 * in-process runner. Priority ascends, ties broken by submission order.
 */
export async function claimNextQueuedEngineDownload(): Promise<EngineDownloadRecord | null> {
    const candidate = await peekNextQueuedEngineDownload();

    return candidate ? claimQueuedEngineDownload(candidate.id) : null;
}

export async function updateEngineDownloadProgress(
    id: string,
    progress: {
        downloadedBytes: number;
        completedSegments: number;
        failedSegments: number;
        bytesPerSecond?: number | null;
    },
) {
    const database = ensureDatabaseReady();

    database
        .update(engineDownloads)
        .set({ ...progress, updatedAt: new Date() })
        .where(eq(engineDownloads.id, id))
        .run();
}

export async function setEngineDownloadState(
    id: string,
    state: EngineDownloadState,
    extras: {
        failureKind?: EngineDownloadFailureKind | null;
        errorMessage?: string | null;
        outputPath?: string | null;
        completedAt?: Date | null;
    } = {},
    options: {
        expectedStates?: EngineDownloadState[];
        controlIntent?: EngineDownloadControlIntent | null;
        clearControlIntent?: boolean;
    } = {},
) {
    const database = ensureDatabaseReady();
    const controlCondition =
        options.controlIntent === null
            ? isNull(engineDownloads.controlIntent)
            : options.controlIntent
              ? eq(engineDownloads.controlIntent, options.controlIntent)
              : undefined;

    const result = database
        .update(engineDownloads)
        .set({
            state,
            ...(state === "fetching" ? {} : { bytesPerSecond: null }),
            ...(options.clearControlIntent ? { controlIntent: null } : {}),
            updatedAt: new Date(),
            ...extras,
            ...(state === "completed" || state === "failed"
                ? { nzbXml: encryptSecret(""), password: null }
                : {}),
        })
        .where(
            and(
                eq(engineDownloads.id, id),
                options.expectedStates
                    ? inArray(engineDownloads.state, options.expectedStates)
                    : undefined,
                controlCondition,
            ),
        )
        .run();

    return result.changes > 0;
}

/**
 * Reads the durable control fence synchronously so segment workers can poll it
 * between NNTP requests without relying on process-local signals.
 */
export function readEngineDownloadRuntimeState(id: string) {
    return (
        ensureDatabaseReady()
            .select({
                state: engineDownloads.state,
                controlIntent: engineDownloads.controlIntent,
            })
            .from(engineDownloads)
            .where(eq(engineDownloads.id, id))
            .get() ?? null
    );
}

/** Persists a pause/cancel request for the isolated engine process. */
export async function requestEngineDownloadControl(
    userId: string,
    id: string,
    controlIntent: EngineDownloadControlIntent,
) {
    const database = ensureDatabaseReady();
    const result = database
        .update(engineDownloads)
        .set({
            controlIntent,
            ...(controlIntent === "cancel" ? { bytesPerSecond: null } : {}),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(engineDownloads.userId, userId),
                eq(engineDownloads.id, id),
                // Queued rows are parked synchronously by the web-side state CAS. A
                // durable pause intent is valid only while the worker still owns the
                // fetching phase; it must never be written after post-processing wins
                // that race because finalized output cannot be resumed as a download.
                controlIntent === "pause" ? eq(engineDownloads.state, "fetching") : undefined,
                controlIntent === "pause" ? isNull(engineDownloads.controlIntent) : undefined,
            ),
        )
        .run();

    if (result.changes === 0) {
        return null;
    }

    return (
        database
            .select()
            .from(engineDownloads)
            .where(and(eq(engineDownloads.userId, userId), eq(engineDownloads.id, id)))
            .get() ?? null
    );
}

export async function listEngineDownloadsWithControlIntent(
    controlIntent: EngineDownloadControlIntent,
) {
    return ensureDatabaseReady()
        .select()
        .from(engineDownloads)
        .where(eq(engineDownloads.controlIntent, controlIntent))
        .orderBy(asc(engineDownloads.updatedAt))
        .all();
}

/** Deletes only a row still fenced by durable cancellation intent. */
export async function deleteCancelledEngineDownload(userId: string, id: string) {
    const result = ensureDatabaseReady()
        .delete(engineDownloads)
        .where(
            and(
                eq(engineDownloads.userId, userId),
                eq(engineDownloads.id, id),
                eq(engineDownloads.controlIntent, "cancel"),
            ),
        )
        .run();

    return result.changes > 0;
}

/** Atomically resumes a parked download without overriding cancellation. */
export async function resumePausedEngineDownload(userId: string, id: string) {
    const result = ensureDatabaseReady()
        .update(engineDownloads)
        .set({
            state: "queued",
            controlIntent: null,
            downloadedBytes: 0,
            completedSegments: 0,
            failedSegments: 0,
            bytesPerSecond: null,
            errorMessage: null,
            // Clears the marker that distinguishes an engine-parked download from a
            // user-paused one, so health stops reporting it once it is moving again.
            failureKind: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(engineDownloads.userId, userId),
                eq(engineDownloads.id, id),
                eq(engineDownloads.state, "paused"),
                isNull(engineDownloads.controlIntent),
            ),
        )
        .run();

    return result.changes > 0;
}

export async function listActiveEngineDownloads(userId: string) {
    const database = ensureDatabaseReady();

    return database
        .select()
        .from(engineDownloads)
        .where(
            and(
                eq(engineDownloads.userId, userId),
                inArray(engineDownloads.state, [...activeEngineDownloadStates]),
            ),
        )
        .orderBy(asc(engineDownloads.priority), asc(engineDownloads.createdAt))
        .all();
}

/** Estimated bytes still reserved by all active downloads, across users. */
export async function getActiveEngineDownloadRemainingBytes() {
    return (await getActiveEngineDownloadCapacityUsage()).activeRemainingBytes;
}

export async function getActiveEngineDownloadCapacityUsage() {
    const database = ensureDatabaseReady();
    const rows = database
        .select({
            totalBytes: engineDownloads.totalBytes,
            downloadedBytes: engineDownloads.downloadedBytes,
        })
        .from(engineDownloads)
        .where(inArray(engineDownloads.state, [...activeEngineDownloadStates]))
        .all();

    return summarizeActiveEngineDownloadCapacity(rows);
}

/**
 * Space owed to downloads that are actually running.
 *
 * Admission counts every committed download, which is right when deciding
 * whether to accept more work. Deciding whether one download can *start* is a
 * different question: queued and paused rows are not consuming their future
 * allowance yet, and whatever they already occupy is in the statfs reading.
 * Charging for them there made the engine refuse to start anything once the
 * queue's combined reservation exceeded free space — a queue that could not
 * drain itself back to health.
 */
export async function getInFlightEngineDownloadCapacityUsage() {
    const database = ensureDatabaseReady();
    const rows = database
        .select({
            totalBytes: engineDownloads.totalBytes,
            downloadedBytes: engineDownloads.downloadedBytes,
        })
        .from(engineDownloads)
        .where(inArray(engineDownloads.state, ["fetching", ...enginePostProcessingStates]))
        .all();

    return summarizeActiveEngineDownloadCapacity(rows);
}

/** Completed or failed downloads the import pass has not consumed yet. */
export async function listUnimportedFinishedEngineDownloads(userId: string) {
    const database = ensureDatabaseReady();

    return database
        .select()
        .from(engineDownloads)
        .where(
            and(
                eq(engineDownloads.userId, userId),
                inArray(engineDownloads.state, ["completed", "failed"]),
                isNull(engineDownloads.importedAt),
            ),
        )
        .orderBy(asc(engineDownloads.completedAt))
        .all();
}

export async function markEngineDownloadImported(id: string) {
    const database = ensureDatabaseReady();

    database
        .update(engineDownloads)
        .set({
            importedAt: new Date(),
            updatedAt: new Date(),
            nzbXml: encryptSecret(""),
            password: null,
        })
        .where(eq(engineDownloads.id, id))
        .run();
}

export async function deleteEngineDownload(userId: string, id: string) {
    const database = ensureDatabaseReady();

    const result = database
        .delete(engineDownloads)
        .where(
            and(
                eq(engineDownloads.userId, userId),
                eq(engineDownloads.id, id),
                notInArray(engineDownloads.state, [...enginePostProcessingStates]),
            ),
        )
        .run();

    return result.changes > 0;
}

export async function setEngineDownloadPriority(
    userId: string,
    id: string,
    priority: number,
    executor?: AppDatabase,
) {
    const database = executor ?? ensureDatabaseReady();

    database
        .update(engineDownloads)
        .set({ priority, updatedAt: new Date() })
        .where(and(eq(engineDownloads.userId, userId), eq(engineDownloads.id, id)))
        .run();
}

/**
 * Pause/resume transitions. Only queued downloads pause instantly in the DB;
 * an actively fetching download is stopped by the runner's abort control and
 * then flipped to paused by the runner itself.
 */
export async function transitionEngineDownloadState(
    userId: string,
    id: string,
    from: EngineDownloadState[],
    to: EngineDownloadState,
    options: {
        controlIntent?: EngineDownloadControlIntent | null;
        clearControlIntent?: boolean;
        errorMessage?: string | null;
    } = {},
) {
    const database = ensureDatabaseReady();
    const controlCondition =
        options.controlIntent === null
            ? isNull(engineDownloads.controlIntent)
            : options.controlIntent
              ? eq(engineDownloads.controlIntent, options.controlIntent)
              : undefined;

    const result = database
        .update(engineDownloads)
        .set({
            state: to,
            ...(to === "fetching" ? {} : { bytesPerSecond: null }),
            ...(options.clearControlIntent ? { controlIntent: null } : {}),
            ...(options.errorMessage !== undefined ? { errorMessage: options.errorMessage } : {}),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(engineDownloads.userId, userId),
                eq(engineDownloads.id, id),
                inArray(engineDownloads.state, from),
                controlCondition,
            ),
        )
        .run();

    return result.changes > 0;
}

export async function hasQueuedEngineDownloads() {
    const database = ensureDatabaseReady();

    return Boolean(
        database
            .select({ id: engineDownloads.id })
            .from(engineDownloads)
            .where(eq(engineDownloads.state, "queued"))
            .limit(1)
            .get(),
    );
}

/**
 * Minimal per-row state the startup artifact sweep needs to decide which
 * on-disk directories are still owned by a live download. The queue table
 * stays small, so an unfiltered read is fine.
 */
export async function listEngineDownloadArtifactStates() {
    return ensureDatabaseReady()
        .select({
            id: engineDownloads.id,
            state: engineDownloads.state,
            outputPath: engineDownloads.outputPath,
            importedAt: engineDownloads.importedAt,
        })
        .from(engineDownloads)
        .all();
}

/** Parks downloads stranded mid-flight by a process restart for explicit recovery. */
export async function recoverStrandedEngineDownloads() {
    const database = ensureDatabaseReady();

    database
        .update(engineDownloads)
        .set({
            state: "paused",
            controlIntent: null,
            bytesPerSecond: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                inArray(engineDownloads.state, ["fetching", "repairing", "extracting"]),
                eq(engineDownloads.controlIntent, "pause"),
            ),
        )
        .run();

    database
        .update(engineDownloads)
        .set({
            state: "paused",
            controlIntent: null,
            bytesPerSecond: null,
            failureKind: "infrastructure",
            errorMessage:
                "The background worker stopped while this download was active. Resume to restart the transfer from the beginning.",
            updatedAt: new Date(),
        })
        .where(
            and(
                inArray(engineDownloads.state, ["fetching", "repairing", "extracting"]),
                isNull(engineDownloads.controlIntent),
            ),
        )
        .run();
}

export async function listUsersWithUnimportedFinishedEngineDownloads() {
    const database = ensureDatabaseReady();

    const rows = database
        .select({ userId: engineDownloads.userId })
        .from(engineDownloads)
        .where(
            and(
                inArray(engineDownloads.state, ["completed", "failed"]),
                isNull(engineDownloads.importedAt),
            ),
        )
        .all();

    return Array.from(new Set(rows.map((row) => row.userId)));
}
