import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rename,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/youtube/repositories/youtube-repository", () => ({
    claimYouTubeDownload: vi.fn(async () => ({ id: "download-1", attemptCount: 1 })),
    deferYouTubeDownloadForCapacity: vi.fn(async () => true),
    deferYouTubeQueueForRateLimit: vi.fn(async () => 1),
    getYouTubeDownloadContext: vi.fn(async () => ({
        download: { qualityProfile: "mp4-1080p" },
        path: { path: "untrusted-library-path" },
        video: {
            youtubeVideoId: "dQw4w9WgXcQ",
            webpageUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            channelTitle: "Channel",
            title: "Video",
            publishedAt: new Date("2026-08-18T00:00:00.000Z"),
        },
    })),
    peekNextYouTubeDownload: vi.fn(async () => ({
        download: { id: "download-1" },
        path: { path: "untrusted-library-path" },
    })),
    publishYouTubeDownloadWithCancellationFence: vi.fn(),
    readYouTubeDownloadRuntimeState: vi.fn(() => ({
        status: "downloading",
        controlIntent: null,
    })),
    reconcileYouTubeCancellations: vi.fn(async () => 0),
    recoverStrandedYouTubeDownloads: vi.fn(async () => 0),
    transitionYouTubeDownload: vi.fn(async () => true),
    updateYouTubeDownloadProgress: vi.fn(async () => undefined),
}));
vi.mock("@/modules/youtube/runtime/health", () => ({
    writeYouTubeRunnerHeartbeat: vi.fn(async () => undefined),
}));

import {
    claimYouTubeDownload,
    deferYouTubeDownloadForCapacity,
    deferYouTubeQueueForRateLimit,
    peekNextYouTubeDownload,
    publishYouTubeDownloadWithCancellationFence,
} from "@/modules/youtube/repositories/youtube-repository";
import type { YtDlpAdapter } from "@/modules/youtube/adapters/yt-dlp";
import { YtDlpAdapterError } from "@/modules/youtube/errors";

import { buildYouTubeRelativePath } from "./path-policy";
import {
    captureArtifactSignature,
    importYouTubeArtifact,
    resetYouTubeRunnerForTests,
    runNextYouTubeDownload,
} from "./download-runner";

const directories: string[] = [];

describe("YouTube import publication", () => {
    it("uses an exclusive verified copy when a Windows-backed mount rejects hard links", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-publish-fallback-"));
        const root = path.join(directory, "library");
        const artifactPath = path.join(directory, "dQw4w9WgXcQ.mp4");
        const contents = Buffer.alloc(64 * 1024, 23);
        const video = {
            youtubeVideoId: "dQw4w9WgXcQ",
            channelTitle: "Channel",
            title: "Video",
            publishedAt: new Date("2026-08-18T00:00:00.000Z"),
        };
        const source = { sourceKind: "playlist" as const, title: "Biology and Genetics" };

        directories.push(directory);
        await mkdir(root);
        await writeFile(artifactPath, contents);
        const canonicalRoot = await realpath(root);
        const finalPath = path.join(canonicalRoot, buildYouTubeRelativePath(video, ".mp4", source));

        vi.mocked(publishYouTubeDownloadWithCancellationFence).mockImplementation((input) => {
            input.publish();

            return true;
        });

        await expect(
            importYouTubeArtifact({
                downloadId: "download-copy-fallback",
                artifactPath,
                rootPath: root,
                qualityProfile: "mp4-1080p",
                signal: new AbortController().signal,
                resolveDestination: async () => canonicalRoot,
                video,
                source,
                heartbeat: vi.fn(async () => undefined),
                linkFile() {
                    throw Object.assign(new Error("bind mount rejected hard link"), {
                        code: "EIO",
                    });
                },
            }),
        ).resolves.toBe(true);

        await expect(readFile(finalPath)).resolves.toEqual(contents);
        expect(publishYouTubeDownloadWithCancellationFence).toHaveBeenCalledTimes(2);
    });

    it("never falls back when the final path races into existence", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-publish-race-"));
        const root = path.join(directory, "library");
        const artifactPath = path.join(directory, "dQw4w9WgXcQ.mp4");
        const video = {
            youtubeVideoId: "dQw4w9WgXcQ",
            channelTitle: "Channel",
            title: "Video",
            publishedAt: new Date("2026-08-18T00:00:00.000Z"),
        };

        directories.push(directory);
        await mkdir(root);
        await writeFile(artifactPath, "new media");
        const canonicalRoot = await realpath(root);
        const finalPath = path.join(canonicalRoot, buildYouTubeRelativePath(video, ".mp4"));

        vi.mocked(publishYouTubeDownloadWithCancellationFence).mockImplementation((input) => {
            input.publish();

            return true;
        });

        await expect(
            importYouTubeArtifact({
                downloadId: "download-publish-race",
                artifactPath,
                rootPath: root,
                qualityProfile: "mp4-1080p",
                signal: new AbortController().signal,
                resolveDestination: async () => canonicalRoot,
                video,
                heartbeat: vi.fn(async () => undefined),
                linkFile() {
                    throw Object.assign(new Error("destination exists"), { code: "EEXIST" });
                },
            }),
        ).rejects.toThrow("destination exists");

        await expect(lstat(finalPath)).rejects.toMatchObject({ code: "ENOENT" });
    });
});

beforeEach(() => {
    vi.mocked(peekNextYouTubeDownload)
        .mockReset()
        .mockResolvedValue({
            download: { id: "download-1" },
            path: { path: "untrusted-library-path" },
        } as never);
    vi.mocked(claimYouTubeDownload)
        .mockReset()
        .mockResolvedValue({ id: "download-1", attemptCount: 1 } as never);
    vi.mocked(deferYouTubeDownloadForCapacity).mockReset().mockResolvedValue(true);
    vi.mocked(deferYouTubeQueueForRateLimit).mockReset().mockResolvedValue(1);
    vi.mocked(publishYouTubeDownloadWithCancellationFence).mockReset();
});

afterEach(async () => {
    resetYouTubeRunnerForTests();
    vi.clearAllMocks();
    await Promise.all(
        directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe("YouTube runner destination fencing", () => {
    it("stops draining and durably cools the queue when YouTube requires authentication", async () => {
        const base = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-rate-limit-"));
        const now = new Date("2026-08-19T00:00:00.000Z");
        const adapter = {
            download: vi
                .fn()
                .mockRejectedValue(
                    new YtDlpAdapterError(
                        "YouTube requires a signed-in session for this server. An administrator must verify YouTube access in Settings → Connections.",
                        "authentication_required",
                    ),
                ),
        } as unknown as YtDlpAdapter;

        directories.push(base);
        await expect(
            runNextYouTubeDownload({
                adapter,
                workDirectory: path.join(base, "work"),
                now,
                resolveDestination: async () => base,
                inspectCapacity: async () => ({
                    sufficient: true,
                    workRequired: 10,
                    destinationRequired: 10,
                    combinedRequired: null,
                }),
            }),
        ).resolves.toBe(false);
        expect(deferYouTubeQueueForRateLimit).toHaveBeenCalledWith({
            nextAttemptAt: new Date(now.getTime() + 15 * 60_000),
            message:
                "YouTube requires a signed-in session for this server. An administrator must verify YouTube access in Settings → Connections.",
        });
    });

    it("defers an insufficient oldest row and admits the next destination without claiming the first", async () => {
        const peek = vi.mocked(peekNextYouTubeDownload);
        const claim = vi.mocked(claimYouTubeDownload);
        const defer = vi.mocked(deferYouTubeDownloadForCapacity);
        const inspectCapacity = vi
            .fn()
            .mockResolvedValueOnce({
                sufficient: false,
                workRequired: 10,
                destinationRequired: 10,
                combinedRequired: null,
            })
            .mockResolvedValueOnce({
                sufficient: true,
                workRequired: 10,
                destinationRequired: 10,
                combinedRequired: null,
            });

        peek.mockReset();
        peek.mockResolvedValueOnce({
            download: { id: "oldest-insufficient" },
            path: { path: "F:/full-destination" },
        } as never).mockResolvedValueOnce({
            download: { id: "next-healthy" },
            path: { path: "F:/healthy-destination" },
        } as never);
        claim.mockReset();
        claim.mockResolvedValueOnce(null);

        await expect(
            runNextYouTubeDownload({
                now: new Date("2026-08-19T00:00:00.000Z"),
                resolveDestination: async (candidate) => candidate,
                inspectCapacity,
            }),
        ).resolves.toBe(true);
        expect(defer).toHaveBeenCalledWith(
            expect.objectContaining({ downloadId: "oldest-insufficient" }),
        );
        expect(claim).not.toHaveBeenCalled();

        await expect(
            runNextYouTubeDownload({
                now: new Date("2026-08-19T00:00:01.000Z"),
                resolveDestination: async (candidate) => candidate,
                inspectCapacity,
            }),
        ).resolves.toBe(false);
        expect(claim).toHaveBeenCalledWith("next-healthy", new Date("2026-08-19T00:00:01.000Z"));
    });

    it("re-runs approved-root isolation after transfer and refuses a swapped destination", async () => {
        const base = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-runner-root-"));
        const root = path.join(base, "library");
        const workDirectory = path.join(base, "work");
        const sequence: string[] = [];

        directories.push(base);
        const adapter = {
            download: async (options: { stagingDirectory: string }) => {
                sequence.push("transfer");
                const artifactPath = path.join(options.stagingDirectory, "dQw4w9WgXcQ.mp4");

                await writeFile(artifactPath, "media bytes");

                return { artifactPath };
            },
        } as unknown as YtDlpAdapter;
        const resolveDestination = vi
            .fn(async () => root)
            .mockImplementationOnce(async () => {
                sequence.push("pre-claim-validation");

                return root;
            })
            .mockImplementationOnce(async () => {
                sequence.push("post-transfer-validation");

                throw new Error("destination escaped approved roots");
            });

        await expect(
            runNextYouTubeDownload({
                adapter,
                workDirectory,
                resolveDestination,
                inspectCapacity: async () => ({
                    sufficient: true,
                    workRequired: 10 * 1024 ** 3,
                    destinationRequired: 10 * 1024 ** 3,
                    combinedRequired: null,
                }),
            }),
        ).resolves.toBe(true);

        expect(sequence).toEqual(["pre-claim-validation", "transfer", "post-transfer-validation"]);
        expect(resolveDestination).toHaveBeenCalledTimes(2);
        expect(publishYouTubeDownloadWithCancellationFence).not.toHaveBeenCalled();
    });

    it("rejects an ancestor junction swapped after isolated approval but before preparation", async () => {
        const base = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-approved-swap-"));
        const mount = path.join(base, "mount");
        const root = path.join(mount, "library");
        const outside = path.join(base, "outside");
        const workDirectory = path.join(base, "work");

        directories.push(base);
        await mkdir(root, { recursive: true });
        await mkdir(path.join(outside, "library"), { recursive: true });
        const approvedCanonicalRoot = await realpath(root);
        const adapter = {
            download: async (options: { stagingDirectory: string }) => {
                const artifactPath = path.join(options.stagingDirectory, "dQw4w9WgXcQ.mp4");

                await writeFile(artifactPath, "media bytes");

                return { artifactPath };
            },
        } as unknown as YtDlpAdapter;
        const resolveDestination = vi
            .fn(async () => approvedCanonicalRoot)
            .mockResolvedValueOnce(approvedCanonicalRoot)
            .mockImplementationOnce(async () => {
                await rename(mount, path.join(base, "mount-original"));
                await symlink(outside, mount, process.platform === "win32" ? "junction" : "dir");

                return approvedCanonicalRoot;
            });

        await expect(
            runNextYouTubeDownload({
                adapter,
                workDirectory,
                resolveDestination,
                inspectCapacity: async () => ({
                    sufficient: true,
                    workRequired: 10,
                    destinationRequired: 10,
                    combinedRequired: null,
                }),
            }),
        ).resolves.toBe(true);

        expect(resolveDestination).toHaveBeenCalledTimes(2);
        expect(publishYouTubeDownloadWithCancellationFence).not.toHaveBeenCalled();
        await expect(lstat(path.join(outside, "library", "Channel"))).rejects.toMatchObject({
            code: "ENOENT",
        });
    });
});

describe("YouTube import cleanup", () => {
    async function importFixture() {
        const base = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-import-cleanup-"));
        const root = path.join(base, "library");
        const artifactPath = path.join(base, "dQw4w9WgXcQ.mp4");
        const video = {
            youtubeVideoId: "dQw4w9WgXcQ",
            channelTitle: "Channel",
            title: "Video",
            publishedAt: new Date("2026-08-18T00:00:00.000Z"),
        };

        directories.push(base);
        await mkdir(root);
        await writeFile(artifactPath, Buffer.alloc(512 * 1024, 7));
        const canonicalRoot = await realpath(root);
        const relativePath = buildYouTubeRelativePath(video, ".mp4");
        const temporaryPath = path.join(
            canonicalRoot,
            path.dirname(relativePath),
            `.${path.basename(relativePath)}.download-cleanup.importing`,
        );

        return {
            temporaryPath,
            input: {
                downloadId: "download-cleanup",
                artifactPath,
                rootPath: root,
                qualityProfile: "mp4-1080p" as const,
                signal: new AbortController().signal,
                resolveDestination: async () => canonicalRoot,
                video,
                heartbeat: async () => undefined,
            },
        };
    }

    async function expectTemporaryRemoved(temporaryPath: string) {
        await expect(lstat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
    }

    it("removes the exact importing file after a pipeline failure", async () => {
        const fixture = await importFixture();

        await expect(
            importYouTubeArtifact({
                ...fixture.input,
                onProgress() {
                    throw new Error("pipeline observer failed");
                },
            }),
        ).rejects.toThrow("pipeline observer failed");
        await expectTemporaryRemoved(fixture.temporaryPath);
    });

    it("removes the exact importing file after cancellation during copy", async () => {
        const fixture = await importFixture();
        const controller = new AbortController();

        await expect(
            importYouTubeArtifact({
                ...fixture.input,
                signal: controller.signal,
                onProgress() {
                    controller.abort();
                },
            }),
        ).rejects.toMatchObject({ kind: "cancelled" });
        await expectTemporaryRemoved(fixture.temporaryPath);
    });

    it("removes the exact importing file after temporary-artifact hashing fails", async () => {
        const fixture = await importFixture();
        let signatureCalls = 0;

        await expect(
            importYouTubeArtifact({
                ...fixture.input,
                captureSignature: async (artifactPath, signal) => {
                    signatureCalls += 1;

                    if (signatureCalls === 2) {
                        throw new Error("temporary hash failed");
                    }

                    return captureArtifactSignature(artifactPath, signal);
                },
            }),
        ).rejects.toThrow("temporary hash failed");
        await expectTemporaryRemoved(fixture.temporaryPath);
    });
});
