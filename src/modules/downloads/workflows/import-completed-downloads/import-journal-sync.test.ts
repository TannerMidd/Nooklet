import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureDatabaseReady } from "@/lib/database/client";
import {
    downloadImportedFiles,
    downloadImportRuns,
    downloadRequests,
    users,
} from "@/lib/database/schema";

const failure = vi.hoisted(() => ({ phase: "" as "" | "plan" | "receipt" | "commit" }));

vi.mock("node:fs/promises", async (importOriginal) => {
    const real = await importOriginal<typeof import("node:fs/promises")>();

    return {
        ...real,
        open: async (...args: Parameters<typeof real.open>) => {
            const handle = await real.open(...args);
            const sync = handle.sync.bind(handle);

            handle.sync = async () => {
                const name = String(args[0]).replaceAll("\\", "/");

                if (
                    (failure.phase === "plan" && name.endsWith("/plan.json")) ||
                    (failure.phase === "receipt" && name.includes("/receipts/")) ||
                    (failure.phase === "commit" && name.endsWith("/db-committed.json"))
                ) {
                    throw Object.assign(new Error("injected metadata fsync failure"), {
                        code: "EIO",
                    });
                }

                await sync();
            };

            return handle;
        },
    };
});

import {
    canConsumeImportJournalSources,
    completeImportJournalCleanup,
    createImportJournal,
    importDestinationClaimPath,
    loadImportJournal,
    markImportJournalCommitted,
    verifyImportJournalPublishedFile,
} from "./import-journal";
import { resolveImportDestination, transferImportFile } from "./file-transfer";

const roots: string[] = [];

afterEach(async () => {
    failure.phase = "";
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "nooklet-journal-sync-"));

    roots.push(rootPath);
    const sourceRootPath = path.join(rootPath, "source");
    const destinationRootPath = path.join(rootPath, "library");

    await mkdir(sourceRootPath);
    await mkdir(destinationRootPath);
    const sourcePath = path.join(sourceRootPath, "movie.mkv");
    const destinationPath = path.join(destinationRootPath, "movie.mkv");

    await writeFile(sourcePath, "durable media sentinel");
    const source = await lstat(sourcePath);
    const userId = randomUUID();
    const requestId = randomUUID();
    const downloadId = randomUUID();
    const attemptId = randomUUID();
    const database = ensureDatabaseReady();

    database
        .insert(users)
        .values({
            id: userId,
            email: userId + "@test.local",
            displayName: "Sync test",
            passwordHash: "x",
        })
        .run();
    database
        .insert(downloadRequests)
        .values({ id: requestId, userId, mediaType: "movie", requestedTitle: "Movie" })
        .run();

    return {
        database,
        sourcePath,
        destinationPath,
        input: {
            rootPath,
            sourceRootPath,
            destinationRootPath,
            userId,
            requestId,
            downloadId,
            attemptId,
            files: [
                {
                    sourcePath,
                    destinationPath,
                    sourceSizeBytes: source.size,
                    sourceMtimeMs: source.mtimeMs,
                },
            ],
        },
    };
}

describe("required journal synchronization retry", () => {
    it("does not publish from valid plan JSON left after a failed sync until the reloaded plan syncs", async () => {
        const f = await fixture();

        failure.phase = "plan";
        await expect(createImportJournal(f.input)).rejects.toThrow("fsync failure");
        const journal = (await loadImportJournal(
            f.input.downloadId,
            f.input.attemptId,
            f.input.rootPath,
        ))!;

        expect(JSON.parse(await readFile(journal.planPath, "utf8")).attemptId).toBe(
            f.input.attemptId,
        );
        await expect(
            transferImportFile(f.sourcePath, f.destinationPath, { journal, journalFileIndex: 0 }),
        ).rejects.toThrow("fsync failure");
        await expect(lstat(f.destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(lstat(importDestinationClaimPath(f.destinationPath))).rejects.toMatchObject({
            code: "ENOENT",
        });
        failure.phase = "";
        await transferImportFile(f.sourcePath, f.destinationPath, { journal, journalFileIndex: 0 });
        await expect(readFile(f.destinationPath, "utf8")).resolves.toBe("durable media sentinel");
    });

    it("retains published bytes while an existing receipt still fails fsync on reload", async () => {
        const f = await fixture();
        const journal = await createImportJournal(f.input);

        failure.phase = "receipt";
        await expect(
            transferImportFile(f.sourcePath, f.destinationPath, { journal, journalFileIndex: 0 }),
        ).rejects.toThrow("fsync failure");
        const reloaded = (await loadImportJournal(
            f.input.downloadId,
            f.input.attemptId,
            f.input.rootPath,
        ))!;

        expect(await verifyImportJournalPublishedFile(reloaded, 0)).toBe(false);
        await expect(
            resolveImportDestination(f.sourcePath, f.destinationPath, {
                journal: reloaded,
                journalFileIndex: 0,
            }),
        ).resolves.toMatchObject({ kind: "failed" });
        await expect(readFile(f.destinationPath, "utf8")).resolves.toBe("durable media sentinel");
        failure.phase = "";
        await expect(
            resolveImportDestination(f.sourcePath, f.destinationPath, {
                journal: reloaded,
                journalFileIndex: 0,
            }),
        ).resolves.toMatchObject({ kind: "already-present" });
    });

    it("does not consume sources using valid commit JSON left after failed fsync", async () => {
        const f = await fixture();
        const journal = await createImportJournal(f.input);

        await transferImportFile(f.sourcePath, f.destinationPath, { journal, journalFileIndex: 0 });
        f.database.transaction((tx) => {
            tx.insert(downloadImportRuns)
                .values({
                    id: f.input.attemptId,
                    requestId: f.input.requestId,
                    userId: f.input.userId,
                    status: "succeeded",
                    sourceRootPath: f.input.sourceRootPath,
                })
                .run();
            tx.insert(downloadImportedFiles)
                .values({
                    id: randomUUID(),
                    importRunId: f.input.attemptId,
                    userId: f.input.userId,
                    sourcePath: f.sourcePath,
                    destinationPath: f.destinationPath,
                })
                .run();
        });
        failure.phase = "commit";
        await expect(markImportJournalCommitted(journal)).rejects.toThrow("fsync failure");
        expect(await canConsumeImportJournalSources(f.input.downloadId, f.input.rootPath)).toBe(
            false,
        );
        const reloaded = (await loadImportJournal(
            f.input.downloadId,
            f.input.attemptId,
            f.input.rootPath,
        ))!;

        await expect(completeImportJournalCleanup(reloaded)).rejects.toThrow("fsync failure");
        await expect(lstat(importDestinationClaimPath(f.destinationPath))).resolves.toBeDefined();
        failure.phase = "";
        expect(await completeImportJournalCleanup(reloaded)).toBe(true);
        expect(await canConsumeImportJournalSources(f.input.downloadId, f.input.rootPath)).toBe(
            true,
        );
    });
});
