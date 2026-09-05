import { randomUUID } from "node:crypto";
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    rename,
    rm,
    rmdir,
    symlink,
    writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    downloadImportedFiles,
    downloadImportRuns,
    downloadQueueItems,
    downloadRequests,
    mediaLibraries,
    mediaLibraryPaths,
    users,
} from "@/lib/database/schema";
import {
    organizeCompletedDownloadFiles,
    rollbackOrganizedDownloadFiles,
} from "./file-organization";
import { type ReadyInspectedDownload } from "./file-inspection";
import { resolveImportDestination, transferImportFile } from "./file-transfer";
import {
    canConsumeImportJournalSources,
    initializeImportJournalRecovery,
    completeImportJournalCleanup,
    createImportJournal,
    importDestinationClaimPath,
    importJournalMarkerPath,
    importJournalMaxEntries,
    importJournalRootPath,
    isImportJournalDatabaseCommitted,
    listImportJournalDiagnosticsSync,
    loadImportJournal,
    markImportJournal,
    recoverImportJournals,
    verifyImportJournalPublishedFile,
} from "./import-journal";
import { persistCompletedDownloadImports } from "./persistence";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), "nooklet-journal-proof-"));

    roots.push(root);
    const sourceRootPath = path.join(root, "complete", "download");
    const destinationRootPath = path.join(root, "library");

    await mkdir(sourceRootPath, { recursive: true });
    await mkdir(destinationRootPath);
    const sourcePath = path.join(sourceRootPath, "Movie.mkv");
    const destinationPath = path.join(destinationRootPath, "Movie", "Movie.mkv");

    await writeFile(sourcePath, "movie bytes for journal proof");
    const source = await lstat(sourcePath);
    const userId = randomUUID();
    const requestId = randomUUID();
    const downloadId = randomUUID();
    const database = ensureDatabaseReady();

    database
        .insert(users)
        .values({
            id: userId,
            email: userId + "@test.local",
            displayName: "Journal test",
            passwordHash: "x",
        })
        .run();
    database
        .insert(downloadRequests)
        .values({
            id: requestId,
            userId,
            mediaType: "movie",
            requestedTitle: "Movie",
            status: "queued",
        })
        .run();
    const journal = await createImportJournal({
        rootPath: root,
        userId,
        requestId,
        downloadId,
        sourceRootPath,
        destinationRootPath,
        files: [
            {
                sourcePath,
                destinationPath,
                sourceSizeBytes: source.size,
                sourceMtimeMs: source.mtimeMs,
            },
        ],
    });

    return {
        root,
        sourceRootPath,
        sourcePath,
        destinationRootPath,
        destinationPath,
        journal,
        userId,
        requestId,
        downloadId,
        database,
    };
}

function commit(f: Awaited<ReturnType<typeof fixture>>) {
    f.database.transaction((tx) => {
        tx.insert(downloadImportRuns)
            .values({
                id: f.journal.plan.attemptId,
                userId: f.userId,
                requestId: f.requestId,
                status: "succeeded",
                sourceRootPath: f.sourceRootPath,
                destinationRootPath: f.destinationRootPath,
            })
            .run();
        tx.insert(downloadImportedFiles)
            .values({
                id: randomUUID(),
                importRunId: f.journal.plan.attemptId,
                userId: f.userId,
                sourcePath: f.sourcePath,
                destinationPath: f.destinationPath,
            })
            .run();
        tx.update(downloadRequests)
            .set({ status: "succeeded" })
            .where(eq(downloadRequests.id, f.requestId))
            .run();
    });
}

describe("durable retained import journal", () => {
    it("retains a committed claim when an ancestor is redirected", async () => {
        const f = await fixture();

        await transferImportFile(f.sourcePath, f.destinationPath, {
            journal: f.journal,
            journalFileIndex: 0,
        });
        commit(f);
        const originalDirectory = path.join(f.root, "original-output");
        const redirectDirectory = path.join(f.root, "redirect-target");

        await rename(path.dirname(f.destinationPath), originalDirectory);
        await mkdir(redirectDirectory);
        await writeFile(path.join(redirectDirectory, "Movie.mkv"), "redirect sentinel");
        await symlink(
            redirectDirectory,
            path.dirname(f.destinationPath),
            process.platform === "win32" ? "junction" : "dir",
        );
        expect(await completeImportJournalCleanup(f.journal)).toBe(false);
        expect(listImportJournalDiagnosticsSync(f.userId, f.root)[0].state).toBe("cleanup-pending");
        await expect(readFile(path.join(redirectDirectory, "Movie.mkv"), "utf8")).resolves.toBe(
            "redirect sentinel",
        );
        await expect(
            lstat(
                path.join(
                    originalDirectory,
                    path.basename(importDestinationClaimPath(f.destinationPath)),
                ),
            ),
        ).resolves.toBeDefined();
    });

    it("accepts fractional filesystem timestamps and reloads a published attempt from disk", async () => {
        const f = await fixture();

        await transferImportFile(f.sourcePath, f.destinationPath, {
            journal: f.journal,
            journalFileIndex: 0,
            disableHardLinks: true,
        });
        const reloaded = await loadImportJournal(f.downloadId, f.journal.plan.attemptId, f.root);

        expect(reloaded?.plan).toEqual(f.journal.plan);
        expect(await verifyImportJournalPublishedFile(reloaded!, 0)).toBe(true);
        expect(await canConsumeImportJournalSources(f.downloadId, f.root)).toBe(false);
        await recoverImportJournals({ rootPath: f.root });
        expect(listImportJournalDiagnosticsSync(f.userId, f.root)[0]).toMatchObject({
            state: "retained",
            journalPath: f.journal.journalPath,
        });
        await expect(
            resolveImportDestination(f.sourcePath, f.destinationPath, {
                journal: reloaded!,
                journalFileIndex: 0,
            }),
        ).resolves.toMatchObject({ kind: "already-present" });
        await expect(lstat(importDestinationClaimPath(f.destinationPath))).resolves.toBeDefined();
    });

    it("requires the exact committed run and exact imported files before cleanup", async () => {
        const f = await fixture();

        await transferImportFile(f.sourcePath, f.destinationPath, {
            journal: f.journal,
            journalFileIndex: 0,
        });
        f.database
            .update(downloadRequests)
            .set({ status: "succeeded" })
            .where(eq(downloadRequests.id, f.requestId))
            .run();
        expect(isImportJournalDatabaseCommitted(f.journal)).toBe(false);
        await expect(completeImportJournalCleanup(f.journal)).rejects.toThrow("correlated");
        commit(f);
        await recoverImportJournals({ rootPath: f.root });
        expect(listImportJournalDiagnosticsSync(f.userId, f.root)).toEqual([]);
        expect(await canConsumeImportJournalSources(f.downloadId, f.root)).toBe(true);
        await expect(lstat(importDestinationClaimPath(f.destinationPath))).rejects.toMatchObject({
            code: "ENOENT",
        });
        await expect(readFile(f.destinationPath, "utf8")).resolves.toBe(
            "movie bytes for journal proof",
        );
        await recoverImportJournals({ rootPath: f.root });
        expect(
            f.database
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.id, f.journal.plan.attemptId))
                .all(),
        ).toHaveLength(1);
    });

    it("keeps committed cleanup-pending visible until a durable cleanup-complete marker exists", async () => {
        const f = await fixture();

        await transferImportFile(f.sourcePath, f.destinationPath, {
            journal: f.journal,
            journalFileIndex: 0,
        });
        commit(f);
        const claimPath = importDestinationClaimPath(f.destinationPath);
        const claim = await readFile(claimPath, "utf8");

        await writeFile(claimPath, "foreign metadata");
        expect(await completeImportJournalCleanup(f.journal)).toBe(false);
        expect(isImportJournalDatabaseCommitted(f.journal)).toBe(true);
        expect(listImportJournalDiagnosticsSync(f.userId, f.root)[0].state).toBe("cleanup-pending");
        await writeFile(claimPath, claim);
        await recoverImportJournals({ rootPath: f.root });
        expect(listImportJournalDiagnosticsSync(f.userId, f.root)).toEqual([]);
    });

    it("preserves journal and final media after cancellation, source cleanup, and absent request", async () => {
        const f = await fixture();

        await transferImportFile(f.sourcePath, f.destinationPath, {
            journal: f.journal,
            journalFileIndex: 0,
        });
        f.database.delete(downloadRequests).where(eq(downloadRequests.id, f.requestId)).run();
        await rm(f.sourceRootPath, { recursive: true });
        await recoverImportJournals({ rootPath: f.root });
        expect(listImportJournalDiagnosticsSync(f.userId, f.root)[0]).toMatchObject({
            state: "retained",
            message: expect.stringContaining("Orphaned"),
        });
        expect(
            await loadImportJournal(f.downloadId, f.journal.plan.attemptId, f.root),
        ).not.toBeNull();
        await expect(readFile(f.destinationPath, "utf8")).resolves.toBe(
            "movie bytes for journal proof",
        );
        expect(JSON.stringify(listImportJournalDiagnosticsSync(undefined, f.root))).not.toContain(
            f.destinationRootPath,
        );
        expect(JSON.stringify(listImportJournalDiagnosticsSync(undefined, f.root))).not.toContain(
            f.requestId,
        );
        expect(listImportJournalDiagnosticsSync("another-user", f.root)).toEqual([]);
    });

    it("retains replaced final output and rejects it as a retry", async () => {
        const f = await fixture();

        await transferImportFile(f.sourcePath, f.destinationPath, {
            journal: f.journal,
            journalFileIndex: 0,
        });
        await rename(f.destinationPath, path.join(f.root, "old-output"));
        await writeFile(f.destinationPath, "replacement sentinel");
        expect(await verifyImportJournalPublishedFile(f.journal, 0)).toBe(false);
        await recoverImportJournals({ rootPath: f.root });
        await expect(
            resolveImportDestination(f.sourcePath, f.destinationPath, {
                journal: f.journal,
                journalFileIndex: 0,
            }),
        ).resolves.toMatchObject({ kind: "failed" });
        await expect(readFile(f.destinationPath, "utf8")).resolves.toBe("replacement sentinel");
    });

    it("bounds all inspected entries globally and rejects oversized/nonregular plans", async () => {
        const f = await fixture();
        const namespace = importJournalRootPath(f.root);

        await writeFile(f.journal.planPath, "x".repeat(1024 * 1024 + 1));
        expect(listImportJournalDiagnosticsSync(f.userId, f.root)[0].state).toBe("malformed");
        await rm(f.journal.planPath);
        await mkdir(f.journal.planPath);
        expect(listImportJournalDiagnosticsSync(f.userId, f.root)[0].state).toBe("malformed");

        for (let index = 0; index < importJournalMaxEntries + 20; index += 1) {
            await writeFile(path.join(namespace, "foreign-" + index), "sentinel");
        }

        await initializeImportJournalRecovery(f.root, { force: true });
        const diagnostics = listImportJournalDiagnosticsSync(undefined, f.root);

        expect(diagnostics.length).toBeLessThanOrEqual(importJournalMaxEntries + 2);
        expect(diagnostics.some((entry) => entry.message.includes("limit reached"))).toBe(true);
    });

    it("keeps a successful DB transaction authoritative after a marker error", async () => {
        const f = await fixture();

        await transferImportFile(f.sourcePath, f.destinationPath, {
            journal: f.journal,
            journalFileIndex: 0,
        });
        commit(f);
        const markerPath = importJournalMarkerPath(f.journal, "db-committed");

        await mkdir(markerPath);
        await recoverImportJournals({ rootPath: f.root });
        expect(isImportJournalDatabaseCommitted(f.journal)).toBe(true);
        await expect(lstat(importDestinationClaimPath(f.destinationPath))).resolves.toBeDefined();
        await rmdir(markerPath);
        await recoverImportJournals({ rootPath: f.root });
        expect(listImportJournalDiagnosticsSync(f.userId, f.root)).toEqual([]);
    });

    it("rolls back SQLite only and retries the same published attempt through real persistence", async () => {
        const f = await fixture();
        const libraryId = randomUUID();
        const libraryPathId = randomUUID();
        const queueId = randomUUID();

        f.database
            .insert(mediaLibraries)
            .values({ id: libraryId, userId: f.userId, mediaType: "movie", name: "Movies" })
            .run();
        f.database
            .insert(mediaLibraryPaths)
            .values({
                id: libraryPathId,
                libraryId,
                userId: f.userId,
                path: f.destinationRootPath,
                label: "Movies",
            })
            .run();
        f.database
            .update(downloadRequests)
            .set({ targetLibraryId: libraryId, targetLibraryPathId: libraryPathId })
            .where(eq(downloadRequests.id, f.requestId))
            .run();
        f.database
            .insert(downloadQueueItems)
            .values({
                id: queueId,
                requestId: f.requestId,
                userId: f.userId,
                externalQueueId: f.downloadId,
                status: "queued",
            })
            .run();
        const request = f.database
            .select()
            .from(downloadRequests)
            .where(eq(downloadRequests.id, f.requestId))
            .get()!;
        const queueItem = f.database
            .select()
            .from(downloadQueueItems)
            .where(eq(downloadQueueItems.id, queueId))
            .get()!;
        const source = await lstat(f.sourcePath);
        const inspected = {
            kind: "ready",
            source: {
                kind: "importable",
                sourceRootPath: f.sourceRootPath,
                title: null,
                episode: null,
                target: { path: { id: libraryPathId, path: f.destinationRootPath } },
                match: {
                    request,
                    queueItem,
                    historyItem: {
                        id: f.downloadId,
                        statusKind: "completed",
                        completedAt: new Date(),
                    },
                },
            },
            files: [
                {
                    sourcePath: f.sourcePath,
                    relativePath: "Movie.mkv",
                    sizeBytes: source.size,
                    modifiedAt: source.mtime,
                    kind: "video",
                },
            ],
        } as ReadyInspectedDownload;
        const [organized] = await organizeCompletedDownloadFiles([inspected], {
            journalRootPath: f.root,
        });

        expect(organized.kind).toBe("organized");
        f.database
            .update(downloadRequests)
            .set({ cancellationRequestedAt: new Date() })
            .where(eq(downloadRequests.id, f.requestId))
            .run();
        await expect(persistCompletedDownloadImports(f.userId, [organized])).rejects.toThrow();
        expect(
            f.database
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, f.requestId))
                .all(),
        ).toHaveLength(0);
        await rollbackOrganizedDownloadFiles(organized);
        await expect(
            readFile(organized.journal!.plan.files[0].destinationPath, "utf8"),
        ).resolves.toBe("movie bytes for journal proof");
        f.database
            .update(downloadRequests)
            .set({ cancellationRequestedAt: null })
            .where(eq(downloadRequests.id, f.requestId))
            .run();
        const [retry] = await organizeCompletedDownloadFiles([inspected], {
            journalRootPath: f.root,
        });

        expect(retry.journal?.plan.attemptId).toBe(organized.journal?.plan.attemptId);
        expect(await persistCompletedDownloadImports(f.userId, [retry])).toMatchObject({
            importedCount: 1,
        });
        expect(isImportJournalDatabaseCommitted(retry.journal!)).toBe(true);
        await persistCompletedDownloadImports(f.userId, [retry]);
        expect(
            f.database
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, f.requestId))
                .all(),
        ).toHaveLength(1);
        await markImportJournal(retry.journal!, "retained");
        expect(
            listImportJournalDiagnosticsSync(f.userId, f.root).find(
                (entry) => entry.attemptId === retry.journal!.plan.attemptId,
            )?.state,
        ).toBeUndefined();
    });
});
