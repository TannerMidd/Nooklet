import os from "node:os";
import path from "node:path";
import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
    describeImportTransferArtifacts,
    resolveImportDestination,
    transferImportFile,
} from "./file-transfer";

const roots: string[] = [];

async function tempRoot(label: string) {
    const root = await mkdtemp(path.join(os.tmpdir(), `nooklet-transfer-${label}-`));

    roots.push(root);

    return root;
}

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("crash-safe import file transfer", () => {
    it("reports bytes actually copied while retaining the durable source", async () => {
        const root = await tempRoot("progress");
        const sourcePath = path.join(root, "source.mkv");
        const destinationPath = path.join(root, "library", "movie.mkv");
        const progress: number[] = [];

        await writeFile(sourcePath, "abcdefghijkl");

        await transferImportFile(sourcePath, destinationPath, {
            disableHardLinks: true,
            chunkSizeBytes: 4,
            onProgress: (event) => {
                if (event.phase === "copy") {
                    progress.push(event.bytesProcessed);
                }
            },
        });

        expect(progress).toEqual([4, 8, 12]);
        await expect(readFile(sourcePath, "utf8")).resolves.toBe("abcdefghijkl");
        await expect(readFile(destinationPath, "utf8")).resolves.toBe("abcdefghijkl");
    });

    it("retains an interrupted partial, claim, and stage without deleting any final output", async () => {
        const root = await tempRoot("recovery");
        const sourcePath = path.join(root, "source.mkv");
        const destinationPath = path.join(root, "library", "movie.mkv");

        await writeFile(sourcePath, "complete movie bytes");
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await writeFile(destinationPath, "partial");

        const artifacts = await describeImportTransferArtifacts(sourcePath, destinationPath);
        const partial = await lstat(destinationPath);

        artifacts.claim.destinationIdentity = {
            device: String(partial.dev),
            inode: String(partial.ino),
            birthtimeMs: partial.birthtimeMs,
        };
        await writeFile(artifacts.claimPath, `${JSON.stringify(artifacts.claim)}\n`);
        await writeFile(artifacts.temporaryPath, "stale temporary bytes");

        await expect(resolveImportDestination(sourcePath, destinationPath)).resolves.toMatchObject({
            kind: "failed",
        });
        await expect(readFile(destinationPath, "utf8")).resolves.toBe("partial");
        await expect(access(artifacts.claimPath)).resolves.toBeUndefined();
        await expect(readFile(artifacts.temporaryPath, "utf8")).resolves.toBe(
            "stale temporary bytes",
        );
    });

    it("never deletes a final path replaced after an interrupted copy", async () => {
        const root = await tempRoot("replacement");
        const sourcePath = path.join(root, "source.mkv");
        const destinationPath = path.join(root, "library", "movie.mkv");
        const replacementPath = path.join(root, "replacement.mkv");

        await writeFile(sourcePath, "complete movie bytes");
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await writeFile(destinationPath, "owned partial");
        await writeFile(replacementPath, "unrelated replacement");

        const artifacts = await describeImportTransferArtifacts(sourcePath, destinationPath);
        const partial = await lstat(destinationPath);

        artifacts.claim.destinationIdentity = {
            device: String(partial.dev),
            inode: String(partial.ino),
            birthtimeMs: partial.birthtimeMs,
        };
        await writeFile(artifacts.claimPath, `${JSON.stringify(artifacts.claim)}\n`);
        await rm(destinationPath);
        await rename(replacementPath, destinationPath);

        await expect(resolveImportDestination(sourcePath, destinationPath)).resolves.toEqual({
            kind: "failed",
            message: `Import recovery is awaiting its durable journal: ${artifacts.claimPath}`,
        });
        await expect(readFile(destinationPath, "utf8")).resolves.toBe("unrelated replacement");
        await expect(access(artifacts.claimPath)).resolves.toBeUndefined();
    });

    it("does not overwrite a destination created after preflight", async () => {
        const root = await tempRoot("race");
        const sourcePath = path.join(root, "source.mkv");
        const destinationPath = path.join(root, "library", "movie.mkv");

        await writeFile(sourcePath, "new movie bytes");

        await expect(resolveImportDestination(sourcePath, destinationPath)).resolves.toEqual({
            kind: "ready",
            destinationPath,
        });
        await writeFile(destinationPath, "existing movie bytes");

        await expect(
            transferImportFile(sourcePath, destinationPath, {
                disableHardLinks: true,
            }),
        ).rejects.toThrow(`Destination file already exists: ${destinationPath}`);
        await expect(readFile(destinationPath, "utf8")).resolves.toBe("existing movie bytes");
    });

    it("does not delete a replacement installed while an owned copy is failing", async () => {
        const root = await tempRoot("cleanup-race");
        const sourcePath = path.join(root, "source.mkv");
        const destinationPath = path.join(root, "library", "movie.mkv");
        const replacementPath = path.join(root, "replacement.mkv");

        await writeFile(sourcePath, "abcdefgh");
        await writeFile(replacementPath, "replacement bytes");
        let replaced = false;

        await expect(
            transferImportFile(sourcePath, destinationPath, {
                disableHardLinks: true,
                chunkSizeBytes: 4,
                onProgress: async (event) => {
                    if (event.phase !== "copy" || replaced) {
                        return;
                    }

                    replaced = true;
                    await rm(destinationPath);
                    await rename(replacementPath, destinationPath);

                    throw new Error("simulated copy failure");
                },
            }),
        ).rejects.toThrow("simulated copy failure");

        await expect(readFile(destinationPath, "utf8")).resolves.toBe("replacement bytes");
    });
});
