import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const fault = vi.hoisted(() => ({
    target: "",
    linked: false,
    statFailure: false,
    unsupportedLinks: false,
    replacement: "",
    finalOpenCount: 0,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
    const real = await importOriginal<typeof import("node:fs/promises")>();

    return {
        ...real,
        link: async (source: string, destination: string) => {
            if (fault.unsupportedLinks) {
                throw Object.assign(new Error("Hardlinks unsupported"), { code: "EOPNOTSUPP" });
            }

            await real.link(source, destination);

            if (destination === fault.target) {
                fault.linked = true;

                if (fault.replacement) {
                    await real.rename(destination, fault.replacement);
                    await real.writeFile(destination, "replacement sentinel");
                }
            }
        },
        lstat: async (...args: Parameters<typeof real.lstat>) => {
            if (args[0] === fault.target && fault.linked && fault.statFailure) {
                throw Object.assign(new Error("Injected post-link stat failure"), { code: "EIO" });
            }

            return real.lstat(...args);
        },
        open: async (...args: Parameters<typeof real.open>) => {
            if (args[0] === fault.target && args[1] === "wx") {
                fault.finalOpenCount += 1;
            }

            return real.open(...args);
        },
    };
});

import {
    createImportJournal,
    importDestinationClaimPath,
    importJournalMarkerPath,
} from "./import-journal";
import { describeImportTransferArtifacts, transferImportFile } from "./file-transfer";

const roots: string[] = [];

afterEach(async () => {
    Object.assign(fault, {
        target: "",
        linked: false,
        statFailure: false,
        unsupportedLinks: false,
        replacement: "",
        finalOpenCount: 0,
    });
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), "nooklet-transfer-fault-"));

    roots.push(root);
    const sourceRootPath = path.join(root, "source");
    const destinationRootPath = path.join(root, "library");

    await mkdir(sourceRootPath);
    await mkdir(destinationRootPath);
    const sourcePath = path.join(sourceRootPath, "source.mkv");
    const destinationPath = path.join(destinationRootPath, "movie.mkv");

    await writeFile(sourcePath, "abcdefghijkl");
    const entry = await lstat(sourcePath);
    const journal = await createImportJournal({
        rootPath: root,
        userId: "test-user",
        requestId: randomUUID(),
        downloadId: randomUUID(),
        sourceRootPath,
        destinationRootPath,
        files: [
            {
                sourcePath,
                destinationPath,
                sourceSizeBytes: entry.size,
                sourceMtimeMs: entry.mtimeMs,
            },
        ],
    });

    fault.target = destinationPath;

    return { root, sourcePath, destinationPath, journal };
}

describe("import publication fault containment", () => {
    it("does not fall through to copy after successful link followed by stat failure", async () => {
        const f = await fixture();

        fault.statFailure = true;
        await expect(
            transferImportFile(f.sourcePath, f.destinationPath, {
                journal: f.journal,
                journalFileIndex: 0,
            }),
        ).rejects.toThrow("post-link stat");
        fault.statFailure = false;
        expect(fault.finalOpenCount).toBe(0);
        await expect(readFile(f.destinationPath, "utf8")).resolves.toBe("abcdefghijkl");
        await expect(lstat(importDestinationClaimPath(f.destinationPath))).resolves.toBeDefined();
        await expect(
            lstat(importJournalMarkerPath(f.journal, "published-unknown", 0)),
        ).resolves.toBeDefined();
    });

    it("preserves a replacement after publication and does not retry another transfer", async () => {
        const f = await fixture();

        fault.replacement = path.join(f.root, "original");
        await expect(
            transferImportFile(f.sourcePath, f.destinationPath, {
                journal: f.journal,
                journalFileIndex: 0,
            }),
        ).rejects.toThrow("could not be verified");
        expect(fault.finalOpenCount).toBe(0);
        await expect(readFile(f.destinationPath, "utf8")).resolves.toBe("replacement sentinel");
    });

    it("streams through an exclusive final handle when hardlinks are unsupported and preserves probe sentinels", async () => {
        const f = await fixture();
        const artifacts = await describeImportTransferArtifacts(
            f.sourcePath,
            f.destinationPath,
            f.journal.plan.attemptId,
        );
        const sentinel = artifacts.temporaryPath + ".link-probe";

        await writeFile(sentinel, "pre-existing probe sentinel");
        fault.unsupportedLinks = true;
        await transferImportFile(f.sourcePath, f.destinationPath, {
            journal: f.journal,
            journalFileIndex: 0,
            chunkSizeBytes: 4,
        });
        expect(fault.finalOpenCount).toBe(1);
        await expect(readFile(f.destinationPath, "utf8")).resolves.toBe("abcdefghijkl");
        await expect(readFile(sentinel, "utf8")).resolves.toBe("pre-existing probe sentinel");
        await expect(lstat(importDestinationClaimPath(f.destinationPath))).resolves.toBeDefined();
    });

    it("retains a claimed partial after streaming is interrupted", async () => {
        const f = await fixture();

        await expect(
            transferImportFile(f.sourcePath, f.destinationPath, {
                journal: f.journal,
                journalFileIndex: 0,
                disableHardLinks: true,
                chunkSizeBytes: 4,
                onProgress: () => {
                    throw new Error("cancelled after publication");
                },
            }),
        ).rejects.toThrow("cancelled");
        await expect(readFile(f.destinationPath, "utf8")).resolves.toBe("abcd");
        await expect(lstat(importDestinationClaimPath(f.destinationPath))).resolves.toBeDefined();
        await expect(
            lstat(importJournalMarkerPath(f.journal, "published-unknown", 0)),
        ).resolves.toBeDefined();
    });

    it("never removes pre-existing deterministic partial files after transfer failure", async () => {
        const f = await fixture();
        const artifacts = await describeImportTransferArtifacts(
            f.sourcePath,
            f.destinationPath,
            f.journal.plan.attemptId,
        );

        await writeFile(artifacts.temporaryPath, "private stage sentinel");
        await rename(f.sourcePath, path.join(f.root, "removed-source"));
        await expect(
            transferImportFile(f.sourcePath, f.destinationPath, {
                journal: f.journal,
                journalFileIndex: 0,
            }),
        ).rejects.toThrow();
        await expect(readFile(artifacts.temporaryPath, "utf8")).resolves.toBe(
            "private stage sentinel",
        );
    });
});
