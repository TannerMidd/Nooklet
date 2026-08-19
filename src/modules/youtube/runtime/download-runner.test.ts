import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { YtDlpAdapterError } from "@/modules/youtube/errors";

import {
    assertArtifactIdentityUnchangedSync,
    assertArtifactSignaturesMatch,
    captureArtifactSignature,
    classifyYouTubeDownloadFailure,
    findReusableYouTubeArtifact,
    retryDelayAfterAttempt,
    selectYouTubeImportDestination,
} from "./download-runner";

describe("YouTube download retry policy", () => {
    it("uses the documented four retry delays before becoming terminal", () => {
        expect([1, 2, 3, 4, 5].map(retryDelayAfterAttempt)).toEqual([
            15 * 60_000,
            60 * 60_000,
            6 * 60 * 60_000,
            24 * 60 * 60_000,
            null,
        ]);
    });

    it("retries transient failures and terminates content failures", () => {
        expect(
            classifyYouTubeDownloadFailure(
                new YtDlpAdapterError(
                    "YouTube requires a signed-in session for this server.",
                    "authentication_required",
                ),
            ),
        ).toMatchObject({ retryable: true, failureKind: "retryable" });
        expect(
            classifyYouTubeDownloadFailure(
                new YtDlpAdapterError(
                    "YouTube temporarily rate-limited this request.",
                    "rate_limited",
                ),
            ),
        ).toMatchObject({ retryable: true, failureKind: "retryable" });
        expect(
            classifyYouTubeDownloadFailure(
                new YtDlpAdapterError("That video is private.", "private"),
            ),
        ).toMatchObject({ retryable: false, failureKind: "content" });
        expect(
            classifyYouTubeDownloadFailure(new YtDlpAdapterError("Cancelled.", "cancelled")),
        ).toMatchObject({ retryable: false, failureKind: "cancelled" });
        expect(classifyYouTubeDownloadFailure(new Error("database is locked"))).toMatchObject({
            retryable: true,
            failureKind: "retryable",
        });
    });

    it("reuses only the exact final video artifact and ignores format fragments", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-artifact-"));

        try {
            await writeFile(path.join(directory, "dQw4w9WgXcQ.f137.mp4"), "video fragment");
            await writeFile(path.join(directory, "dQw4w9WgXcQ.f140.m4a"), "audio fragment");
            await writeFile(path.join(directory, "dQw4w9WgXcQ.mp4.part"), "partial final");

            expect(await findReusableYouTubeArtifact(directory, "dQw4w9WgXcQ")).toBeNull();

            const exactPath = path.join(directory, "dQw4w9WgXcQ.mp4");

            await writeFile(exactPath, "merged final");

            expect(await findReusableYouTubeArtifact(directory, "dQw4w9WgXcQ")).toBe(
                await realpath(exactPath),
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("hashes exact reuse and detects a file swap at the synchronous fence", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-signature-"));

        try {
            const stagedPath = path.join(directory, "staged.mp4");
            const finalPath = path.join(directory, "final.mp4");

            await writeFile(stagedPath, "identical media bytes");
            await writeFile(finalPath, "identical media bytes");

            const staged = await captureArtifactSignature(stagedPath);
            const final = await captureArtifactSignature(finalPath);

            expect(final.sha256).toBe(staged.sha256);
            expect(final.identity.size).toBe(staged.identity.size);
            expect(() =>
                assertArtifactIdentityUnchangedSync(finalPath, final.identity),
            ).not.toThrow();

            await rename(finalPath, path.join(directory, "swapped-out.mp4"));
            await writeFile(finalPath, "identical media bytes");

            expect(() => assertArtifactIdentityUnchangedSync(finalPath, final.identity)).toThrow(
                /changed before publish/i,
            );

            await writeFile(finalPath, "different media bytes");
            const collision = await captureArtifactSignature(finalPath);

            expect(collision.sha256).not.toBe(staged.sha256);
            expect(() => assertArtifactSignaturesMatch(staged, collision)).toThrow(
                /exists with different content/i,
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("uses a deterministic quality fallback only when canonical bytes differ", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-profile-"));

        try {
            const root = path.join(directory, "root");
            const stagedPath = path.join(directory, "staged.mp4");
            const relativePath = path.join("Channel", "2026", "video [dQw4w9WgXcQ].mp4");
            const canonicalPath = path.join(root, relativePath);

            await mkdir(path.dirname(canonicalPath), { recursive: true });
            await writeFile(stagedPath, "1080p media bytes");
            await writeFile(canonicalPath, "720p media bytes");
            const stagedSignature = await captureArtifactSignature(stagedPath);
            const selected = await selectYouTubeImportDestination({
                rootPath: root,
                approvedCanonicalRoot: root,
                canonicalRelativePath: relativePath,
                qualityProfile: "mp4-1080p",
                stagedSignature,
            });

            expect(selected.finalPath).toBe(
                path.join(root, "Channel", "2026", "video [dQw4w9WgXcQ] [mp4-1080p].mp4"),
            );
            expect(selected.existingSignature).toBeNull();
            await writeFile(selected.finalPath, "1080p media bytes");
            const reusable = await selectYouTubeImportDestination({
                rootPath: root,
                approvedCanonicalRoot: root,
                canonicalRelativePath: relativePath,
                qualityProfile: "mp4-1080p",
                stagedSignature,
            });

            expect(reusable.existingSignature?.sha256).toBe(stagedSignature.sha256);
            await writeFile(selected.finalPath, "different 1080p media bytes");
            await expect(
                selectYouTubeImportDestination({
                    rootPath: root,
                    approvedCanonicalRoot: root,
                    canonicalRelativePath: relativePath,
                    qualityProfile: "mp4-1080p",
                    stagedSignature,
                }),
            ).rejects.toThrow(/different content/i);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("honors cancellation before streaming an artifact hash", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-cancel-hash-"));

        try {
            const artifactPath = path.join(directory, "video.mp4");
            const controller = new AbortController();

            await writeFile(artifactPath, "media bytes");
            controller.abort();
            await expect(
                captureArtifactSignature(artifactPath, controller.signal),
            ).rejects.toMatchObject({ kind: "cancelled" });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
