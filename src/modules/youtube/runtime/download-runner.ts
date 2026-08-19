import "server-only";

import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, realpath, rm } from "node:fs/promises";
import {
    createReadStream,
    createWriteStream,
    linkSync,
    lstatSync,
    unlinkSync,
    type Stats,
} from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { env } from "@/lib/env";
import type { YoutubeQualityProfile } from "@/lib/database/schema";
import { withDownloadAdmissionFence } from "@/lib/download-admission";
import { logger } from "@/lib/observability/logger";
import { resolveApprovedMediaDirectoryIsolated } from "@/lib/security/isolated-filesystem-policy";
import { YtDlpAdapterError, type YtDlpErrorKind } from "@/modules/youtube/errors";
import type { YtDlpAdapter } from "@/modules/youtube/adapters/yt-dlp";
import { createConfiguredYtDlpAdapter } from "@/modules/youtube/configured-adapter";
import {
    claimYouTubeDownload,
    deferYouTubeDownloadForCapacity,
    deferYouTubeQueueForRateLimit,
    getYouTubeDownloadContext,
    publishYouTubeDownloadWithCancellationFence,
    readYouTubeDownloadRuntimeState,
    reconcileYouTubeCancellations,
    recoverStrandedYouTubeDownloads,
    transitionYouTubeDownload,
    updateYouTubeDownloadProgress,
    peekNextYouTubeDownload,
} from "@/modules/youtube/repositories/youtube-repository";
import {
    buildYouTubeProfileCollisionPath,
    buildYouTubeRelativePath,
    isPathWithin,
    prepareContainedDestination,
    revalidatePreparedDestinationSync,
    sameCanonicalPath,
} from "@/modules/youtube/runtime/path-policy";
import { writeYouTubeRunnerHeartbeat } from "@/modules/youtube/runtime/health";
import type { YouTubeRunnerProgress } from "@/modules/youtube/types";
import { inspectYouTubeLiveCapacity } from "@/modules/youtube/runtime/live-capacity";

const retryDelaysMs = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000] as const;

export const YOUTUBE_CAPACITY_RECHECK_DELAY_MS = 15 * 60_000;

const playableExtensions = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v"]);

export type ArtifactIdentity = {
    dev: number;
    ino: number;
    size: number;
    mtimeMs: number;
    ctimeMs: number;
    birthtimeMs: number;
};

export type ArtifactSignature = {
    identity: ArtifactIdentity;
    sha256: string;
};

let activeRun: Promise<boolean> | null = null;
let drainLoop: Promise<void> | null = null;
let recovered = false;

export function retryDelayAfterAttempt(attemptCount: number) {
    return retryDelaysMs[attemptCount - 1] ?? null;
}

export function classifyYouTubeDownloadFailure(error: unknown): {
    retryable: boolean;
    failureKind: "retryable" | "content" | "infrastructure" | "cancelled";
    message: string;
} {
    if (error instanceof YtDlpAdapterError) {
        const terminalContent = new Set<YtDlpErrorKind>([
            "private",
            "removed",
            "live",
            "short",
            "unavailable",
            "invalid_url",
        ]);

        if (error.kind === "cancelled") {
            return { retryable: false, failureKind: "cancelled", message: "Cancelled by user." };
        }

        if (terminalContent.has(error.kind)) {
            return {
                retryable: false,
                failureKind: "content",
                message: error.message.slice(0, 500),
            };
        }

        if (
            new Set<YtDlpErrorKind>([
                "authentication_required",
                "network",
                "rate_limited",
                "timeout",
            ]).has(error.kind)
        ) {
            return {
                retryable: true,
                failureKind: "retryable",
                message: error.message.slice(0, 500),
            };
        }

        return {
            retryable: false,
            failureKind: "infrastructure",
            message: error.message.slice(0, 500),
        };
    }

    const message = error instanceof Error ? error.message : "YouTube download failed.";

    if (/database is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(message)) {
        return {
            retryable: true,
            failureKind: "retryable",
            message: "Nooklet's database is busy; the download will retry automatically.",
        };
    }

    return {
        retryable: false,
        failureKind: "infrastructure",
        message: message.slice(0, 500),
    };
}

function artifactIdentity(info: Stats): ArtifactIdentity {
    return {
        dev: info.dev,
        ino: info.ino,
        size: info.size,
        mtimeMs: info.mtimeMs,
        ctimeMs: info.ctimeMs,
        birthtimeMs: info.birthtimeMs,
    };
}

function sameArtifactIdentity(left: ArtifactIdentity, right: ArtifactIdentity) {
    return (
        left.dev === right.dev &&
        left.ino === right.ino &&
        left.size === right.size &&
        left.mtimeMs === right.mtimeMs &&
        left.ctimeMs === right.ctimeMs &&
        left.birthtimeMs === right.birthtimeMs
    );
}

export function assertArtifactIdentityUnchangedSync(
    artifactPath: string,
    expected: ArtifactIdentity,
) {
    const current = lstatSync(artifactPath, { bigint: false });

    if (
        current.isSymbolicLink() ||
        !current.isFile() ||
        !sameArtifactIdentity(artifactIdentity(current), expected)
    ) {
        throw new Error("YouTube artifact changed before publish.");
    }
}

const unsupportedHardLinkCodes = new Set([
    "EACCES",
    "EIO",
    "ENOSYS",
    "ENOTSUP",
    "EOPNOTSUPP",
    "EPERM",
    "EXDEV",
]);

class UnsupportedHardLinkPublicationError extends Error {
    constructor(cause: unknown) {
        super("The destination filesystem does not support hard-link publication.", { cause });
        this.name = "UnsupportedHardLinkPublicationError";
    }
}

function sameArtifactObject(left: ArtifactIdentity, right: ArtifactIdentity) {
    return (
        left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs
    );
}

async function removeOwnedPublishedFile(filePath: string, createdIdentity: ArtifactIdentity) {
    try {
        const current = await lstat(filePath);

        if (
            current.isFile() &&
            !current.isSymbolicLink() &&
            sameArtifactObject(artifactIdentity(current), createdIdentity)
        ) {
            await rm(filePath, { force: true });
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }
}

function throwIfYouTubeOperationCancelled(signal?: AbortSignal) {
    if (signal?.aborted) {
        throw new YtDlpAdapterError("YouTube download cancelled.", "cancelled");
    }
}

export async function captureArtifactSignature(
    artifactPath: string,
    signal?: AbortSignal,
): Promise<ArtifactSignature> {
    throwIfYouTubeOperationCancelled(signal);
    const before = await lstat(artifactPath);

    if (before.isSymbolicLink() || !before.isFile()) {
        throw new Error("YouTube artifact is not a regular file.");
    }

    const beforeIdentity = artifactIdentity(before);
    const hash = createHash("sha256");

    for await (const chunk of createReadStream(artifactPath)) {
        throwIfYouTubeOperationCancelled(signal);
        hash.update(chunk as Buffer);
    }

    throwIfYouTubeOperationCancelled(signal);
    const after = await lstat(artifactPath);
    const afterIdentity = artifactIdentity(after);

    if (
        after.isSymbolicLink() ||
        !after.isFile() ||
        !sameArtifactIdentity(beforeIdentity, afterIdentity)
    ) {
        throw new Error("YouTube artifact changed while it was being verified.");
    }

    return { identity: afterIdentity, sha256: hash.digest("hex") };
}

function artifactSignaturesMatch(left: ArtifactSignature, right: ArtifactSignature) {
    return left.identity.size === right.identity.size && left.sha256 === right.sha256;
}

export function assertArtifactSignaturesMatch(
    staged: ArtifactSignature,
    existing: ArtifactSignature,
) {
    if (!artifactSignaturesMatch(staged, existing)) {
        throw new Error(
            "The final YouTube target already exists with different content; import was stopped safely.",
        );
    }
}

type SelectedImportDestination = Awaited<ReturnType<typeof prepareContainedDestination>> & {
    existingSignature: ArtifactSignature | null;
};

async function readExistingDestinationSignature(
    destination: Awaited<ReturnType<typeof prepareContainedDestination>>,
    signal?: AbortSignal,
) {
    try {
        const existing = await lstat(destination.finalPath);

        if (!existing.isFile() || existing.isSymbolicLink()) {
            throw new Error("Final YouTube path is not a regular file.");
        }

        return captureArtifactSignature(destination.finalPath, signal);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }

        throw error;
    }
}

export async function selectYouTubeImportDestination(input: {
    rootPath: string;
    approvedCanonicalRoot: string;
    canonicalRelativePath: string;
    qualityProfile: YoutubeQualityProfile;
    stagedSignature: ArtifactSignature;
    signal?: AbortSignal;
}): Promise<SelectedImportDestination> {
    throwIfYouTubeOperationCancelled(input.signal);
    const canonical = await prepareContainedDestination(
        input.rootPath,
        input.canonicalRelativePath,
        input.approvedCanonicalRoot,
    );

    if (!sameCanonicalPath(canonical.canonicalRoot, input.approvedCanonicalRoot)) {
        throw new Error("YouTube destination root changed after approval.");
    }

    const canonicalSignature = await readExistingDestinationSignature(canonical, input.signal);

    if (!canonicalSignature || artifactSignaturesMatch(input.stagedSignature, canonicalSignature)) {
        return { ...canonical, existingSignature: canonicalSignature };
    }

    const profileRelativePath = buildYouTubeProfileCollisionPath(
        input.canonicalRelativePath,
        input.qualityProfile,
    );
    const profileDestination = await prepareContainedDestination(
        input.rootPath,
        profileRelativePath,
        input.approvedCanonicalRoot,
    );

    if (!sameCanonicalPath(profileDestination.canonicalRoot, input.approvedCanonicalRoot)) {
        throw new Error("YouTube destination root changed after approval.");
    }

    const profileSignature = await readExistingDestinationSignature(
        profileDestination,
        input.signal,
    );

    if (profileSignature) {
        assertArtifactSignaturesMatch(input.stagedSignature, profileSignature);
    }

    return { ...profileDestination, existingSignature: profileSignature };
}

export async function findReusableYouTubeArtifact(
    stagingDirectory: string,
    youtubeVideoId: string,
) {
    let entries;

    try {
        entries = await readdir(stagingDirectory, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }

        throw error;
    }

    for (const entry of entries) {
        if (!entry.isFile() || entry.name.endsWith(".part")) {
            continue;
        }

        const extension = path.extname(entry.name).toLowerCase();

        if (
            !playableExtensions.has(extension) ||
            entry.name.slice(0, -path.extname(entry.name).length) !== youtubeVideoId
        ) {
            continue;
        }

        const candidate = path.join(stagingDirectory, entry.name);
        const canonical = await realpath(candidate);

        if (!isPathWithin(await realpath(stagingDirectory), canonical)) {
            throw new Error("Downloaded artifact escaped staging.");
        }

        const info = await lstat(canonical);

        if (info.isSymbolicLink() || !info.isFile()) {
            throw new Error("Downloaded artifact is not a regular file.");
        }

        return canonical;
    }

    return null;
}

export async function importYouTubeArtifact(input: {
    downloadId: string;
    artifactPath: string;
    rootPath: string;
    qualityProfile: YoutubeQualityProfile;
    signal: AbortSignal;
    resolveDestination: typeof resolveApprovedMediaDirectoryIsolated;
    video: {
        youtubeVideoId: string;
        channelTitle: string | null;
        title: string;
        publishedAt: Date | null;
    };
    source?: { sourceKind: "channel_videos" | "playlist"; title: string } | null;
    heartbeat: (force?: boolean) => Promise<void>;
    onProgress?: (progress: YouTubeRunnerProgress) => void;
    captureSignature?: typeof captureArtifactSignature;
    linkFile?: typeof linkSync;
}) {
    const captureSignature = input.captureSignature ?? captureArtifactSignature;
    const stagedSignature = await captureSignature(input.artifactPath, input.signal);

    const relativePath = buildYouTubeRelativePath(
        input.video,
        path.extname(input.artifactPath),
        input.source,
    );
    // The selected library path may be swapped while yt-dlp is running. Re-run
    // the isolated approved-root policy at the transfer/import boundary.
    const approvedRoot = await input.resolveDestination(input.rootPath);

    throwIfYouTubeOperationCancelled(input.signal);
    const destination = await selectYouTubeImportDestination({
        rootPath: approvedRoot,
        approvedCanonicalRoot: approvedRoot,
        canonicalRelativePath: relativePath,
        qualityProfile: input.qualityProfile,
        stagedSignature,
        signal: input.signal,
    });

    if (destination.existingSignature) {
        const existingSignature = destination.existingSignature;

        return publishYouTubeDownloadWithCancellationFence({
            downloadId: input.downloadId,
            finalPath: destination.finalPath,
            publish() {
                throwIfYouTubeOperationCancelled(input.signal);
                revalidatePreparedDestinationSync(destination);
                assertArtifactIdentityUnchangedSync(
                    destination.finalPath,
                    existingSignature.identity,
                );
                assertArtifactIdentityUnchangedSync(input.artifactPath, stagedSignature.identity);
            },
        });
    }

    const temporaryPath = path.join(
        destination.canonicalParent,
        `.${path.basename(destination.finalPath)}.${input.downloadId}.importing`,
    );

    await rm(temporaryPath, { force: true });
    let copiedBytes = 0;

    try {
        throwIfYouTubeOperationCancelled(input.signal);
        await input.heartbeat(true);
        await pipeline(
            createReadStream(input.artifactPath),
            new Transform({
                transform(chunk: Buffer, _encoding, callback) {
                    try {
                        throwIfYouTubeOperationCancelled(input.signal);
                        copiedBytes += chunk.length;
                        input.onProgress?.({
                            phase: "importing",
                            downloadId: input.downloadId,
                            copiedBytes,
                            totalBytes: stagedSignature.identity.size,
                        });
                        void input.heartbeat().catch(() => undefined);
                        callback(null, chunk);
                    } catch (error) {
                        callback(error as Error);
                    }
                },
            }),
            createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }),
        );
        await input.heartbeat(true);
        const tempInfo = await lstat(temporaryPath);

        if (!tempInfo.isFile() || tempInfo.isSymbolicLink()) {
            throw new Error("YouTube import temporary file is unsafe.");
        }

        const temporarySignature = await captureSignature(temporaryPath, input.signal);

        if (
            temporarySignature.identity.size !== stagedSignature.identity.size ||
            temporarySignature.sha256 !== stagedSignature.sha256
        ) {
            throw new Error("YouTube artifact changed while it was being imported.");
        }

        const linkFile = input.linkFile ?? linkSync;

        try {
            return publishYouTubeDownloadWithCancellationFence({
                downloadId: input.downloadId,
                finalPath: destination.finalPath,
                publish() {
                    throwIfYouTubeOperationCancelled(input.signal);
                    revalidatePreparedDestinationSync(destination);
                    assertArtifactIdentityUnchangedSync(temporaryPath, temporarySignature.identity);

                    try {
                        lstatSync(destination.finalPath);

                        throw new Error("Final YouTube path appeared before publish.");
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                            throw error;
                        }
                    }

                    try {
                        linkFile(temporaryPath, destination.finalPath);
                    } catch (error) {
                        const code = (error as NodeJS.ErrnoException).code;

                        if (code && unsupportedHardLinkCodes.has(code)) {
                            throw new UnsupportedHardLinkPublicationError(error);
                        }

                        throw error;
                    }

                    unlinkSync(temporaryPath);
                },
            });
        } catch (error) {
            if (!(error instanceof UnsupportedHardLinkPublicationError)) {
                throw error;
            }
        }

        // Docker Desktop's Windows-backed bind mounts can reject hard links.
        // Reserve the final path exclusively, then perform the slow copy and
        // byte verification outside SQLite's completion transaction.
        throwIfYouTubeOperationCancelled(input.signal);
        revalidatePreparedDestinationSync(destination);
        assertArtifactIdentityUnchangedSync(temporaryPath, temporarySignature.identity);
        const finalHandle = await open(destination.finalPath, "wx", 0o600);
        const createdIdentity = artifactIdentity(await finalHandle.stat());
        let handleClosed = false;

        try {
            await pipeline(
                createReadStream(temporaryPath),
                new Transform({
                    transform(chunk: Buffer, _encoding, callback) {
                        try {
                            throwIfYouTubeOperationCancelled(input.signal);
                            void input.heartbeat().catch(() => undefined);
                            callback(null, chunk);
                        } catch (error) {
                            callback(error as Error);
                        }
                    },
                }),
                createWriteStream(destination.finalPath, {
                    fd: finalHandle.fd,
                    autoClose: false,
                }),
            );
            await finalHandle.sync();
            await finalHandle.close();
            handleClosed = true;
            await input.heartbeat(true);

            const finalSignature = await captureSignature(destination.finalPath, input.signal);

            if (
                finalSignature.identity.size !== temporarySignature.identity.size ||
                finalSignature.sha256 !== temporarySignature.sha256
            ) {
                throw new Error("Published YouTube artifact did not match the verified import.");
            }

            const published = publishYouTubeDownloadWithCancellationFence({
                downloadId: input.downloadId,
                finalPath: destination.finalPath,
                publish() {
                    throwIfYouTubeOperationCancelled(input.signal);
                    revalidatePreparedDestinationSync(destination);
                    assertArtifactIdentityUnchangedSync(
                        destination.finalPath,
                        finalSignature.identity,
                    );
                    assertArtifactIdentityUnchangedSync(temporaryPath, temporarySignature.identity);
                    unlinkSync(temporaryPath);
                },
            });

            if (!published) {
                await removeOwnedPublishedFile(destination.finalPath, createdIdentity);
            }

            return published;
        } catch (error) {
            if (!handleClosed) {
                await finalHandle.close().catch(() => undefined);
            }

            await removeOwnedPublishedFile(destination.finalPath, createdIdentity);

            throw error;
        }
    } finally {
        await rm(temporaryPath, { force: true });
    }
}

async function processClaimedDownload(
    downloadId: string,
    options: {
        adapter: YtDlpAdapter;
        workDirectory: string;
        cancellationPollMs: number;
        heartbeat: (force?: boolean) => Promise<void>;
        onProgress?: (progress: YouTubeRunnerProgress) => void;
        resolveDestination: typeof resolveApprovedMediaDirectoryIsolated;
    },
) {
    const context = await getYouTubeDownloadContext(downloadId);

    if (!context) {
        throw new Error("The YouTube destination is no longer active.");
    }

    const stagingDirectory = path.resolve(options.workDirectory, "incomplete", downloadId);

    if (!isPathWithin(path.resolve(options.workDirectory, "incomplete"), stagingDirectory)) {
        throw new Error("YouTube staging path escaped its work directory.");
    }

    await mkdir(stagingDirectory, { recursive: true });
    await updateYouTubeDownloadProgress(downloadId, { stagingPath: stagingDirectory });
    let artifactPath = await findReusableYouTubeArtifact(
        stagingDirectory,
        context.video.youtubeVideoId,
    );
    const controller = new AbortController();
    const cancellationTimer = setInterval(() => {
        const runtimeState = readYouTubeDownloadRuntimeState(downloadId);

        if (
            !runtimeState ||
            runtimeState.controlIntent === "cancel" ||
            runtimeState.status === "cancelled"
        ) {
            controller.abort();
        }
    }, options.cancellationPollMs);

    try {
        const initialRuntimeState = readYouTubeDownloadRuntimeState(downloadId);

        if (
            !initialRuntimeState ||
            initialRuntimeState.controlIntent === "cancel" ||
            initialRuntimeState.status === "cancelled"
        ) {
            controller.abort();
        }

        throwIfYouTubeOperationCancelled(controller.signal);

        if (!artifactPath) {
            const result = await options.adapter.download({
                videoUrl: context.video.webpageUrl,
                profile: context.download.qualityProfile,
                stagingDirectory,
                signal: controller.signal,
                onProgress(progress) {
                    options.onProgress?.({ phase: "downloading", downloadId, ...progress });
                    void options.heartbeat();
                    void updateYouTubeDownloadProgress(downloadId, {
                        ...(progress.progressPercent !== null
                            ? {
                                  progressPercent: Math.max(
                                      0,
                                      Math.min(100, progress.progressPercent),
                                  ),
                              }
                            : {}),
                        ...(progress.downloadedBytes !== null
                            ? { downloadedBytes: progress.downloadedBytes }
                            : {}),
                        totalBytes: progress.totalBytes,
                        bytesPerSecond: progress.bytesPerSecond,
                        etaSeconds: progress.etaSeconds,
                    });
                },
            });

            if (result.artifactPath) {
                const resolvedArtifact = await realpath(result.artifactPath);
                const resolvedStaging = await realpath(stagingDirectory);

                if (!isPathWithin(resolvedStaging, resolvedArtifact)) {
                    throw new Error("yt-dlp reported an artifact outside staging.");
                }

                artifactPath = resolvedArtifact;
            } else {
                artifactPath = await findReusableYouTubeArtifact(
                    stagingDirectory,
                    context.video.youtubeVideoId,
                );
            }
        }

        if (!artifactPath) {
            throw new Error("yt-dlp completed without a playable artifact.");
        }

        throwIfYouTubeOperationCancelled(controller.signal);
        const importing = await transitionYouTubeDownload({
            downloadId,
            expectedStatuses: ["downloading"],
            status: "importing",
            stagingPath: stagingDirectory,
            requireNoControlIntent: true,
        });

        if (!importing) {
            await reconcileYouTubeCancellations();

            return false;
        }

        const published = await importYouTubeArtifact({
            downloadId,
            artifactPath,
            rootPath: context.path.path,
            qualityProfile: context.download.qualityProfile,
            signal: controller.signal,
            resolveDestination: options.resolveDestination,
            video: context.video,
            source: context.source,
            heartbeat: options.heartbeat,
            onProgress: options.onProgress,
        });

        if (!published) {
            await reconcileYouTubeCancellations();

            return false;
        }

        await rm(stagingDirectory, { recursive: true, force: true });

        return true;
    } finally {
        clearInterval(cancellationTimer);
    }
}

async function runClaimedWithFailureHandling(
    download: NonNullable<Awaited<ReturnType<typeof claimYouTubeDownload>>>,
    options: {
        adapter: YtDlpAdapter;
        workDirectory: string;
        cancellationPollMs: number;
        now: Date;
        heartbeat: (force?: boolean) => Promise<void>;
        onProgress?: (progress: YouTubeRunnerProgress) => void;
        resolveDestination: typeof resolveApprovedMediaDirectoryIsolated;
    },
) {
    try {
        logger.info("youtube_download_started", {
            downloadId: download.id,
            attemptCount: download.attemptCount,
            qualityProfile: download.qualityProfile,
        });
        const completed = await processClaimedDownload(download.id, options);

        if (completed) {
            logger.info("youtube_download_completed", { downloadId: download.id });
        }

        return completed;
    } catch (error) {
        const classification = classifyYouTubeDownloadFailure(error);

        if (classification.failureKind === "cancelled") {
            await transitionYouTubeDownload({
                downloadId: download.id,
                expectedStatuses: ["downloading", "importing"],
                status: "cancelled",
                failureKind: "cancelled",
                errorMessage: classification.message,
                completedAt: new Date(),
                clearControlIntent: true,
            });

            return false;
        }

        const delay = classification.retryable
            ? retryDelayAfterAttempt(download.attemptCount)
            : null;

        logger.warn("youtube_download_attempt_failed", {
            downloadId: download.id,
            attemptCount: download.attemptCount,
            failureKind: classification.failureKind,
            retryable: delay !== null,
            retryDelayMs: delay,
            error: classification.message,
        });

        const nextAttemptAt = delay === null ? null : new Date(options.now.getTime() + delay);

        await transitionYouTubeDownload({
            downloadId: download.id,
            expectedStatuses: ["downloading", "importing"],
            status: delay === null ? "failed" : "retry_wait",
            failureKind: classification.failureKind,
            errorMessage: classification.message,
            nextAttemptAt,
            completedAt: delay === null ? new Date() : null,
            clearControlIntent: true,
        });

        const globallyBlocked =
            error instanceof YtDlpAdapterError &&
            new Set<YtDlpErrorKind>(["authentication_required", "rate_limited"]).has(error.kind) &&
            nextAttemptAt;

        if (globallyBlocked) {
            await deferYouTubeQueueForRateLimit({
                nextAttemptAt: globallyBlocked,
                message: classification.message,
            });
        }

        return !globallyBlocked;
    }
}

export async function runNextYouTubeDownload(
    options: {
        adapter?: YtDlpAdapter;
        workDirectory?: string;
        cancellationPollMs?: number;
        now?: Date;
        onProgress?: (progress: YouTubeRunnerProgress) => void;
        onHeartbeat?: () => void | Promise<void>;
        inspectCapacity?: typeof inspectYouTubeLiveCapacity;
        resolveDestination?: typeof resolveApprovedMediaDirectoryIsolated;
    } = {},
) {
    if (activeRun) {
        return activeRun;
    }

    const run = (async () => {
        const workDirectory = options.workDirectory ?? env.YOUTUBE_WORK_DIR;
        let lastHeartbeatAt = 0;

        const heartbeat = async (force = false) => {
            const now = Date.now();

            if (!force && now - lastHeartbeatAt < 5_000) {
                return;
            }

            lastHeartbeatAt = now;
            await writeYouTubeRunnerHeartbeat(true, workDirectory);
            await options.onHeartbeat?.();
        };

        await heartbeat(true);
        await reconcileYouTubeCancellations();

        if (!recovered) {
            await recoverStrandedYouTubeDownloads();
            recovered = true;
        }

        const now = options.now ?? new Date();
        const candidate = await peekNextYouTubeDownload(now);

        if (!candidate) {
            return false;
        }

        const admission = await withDownloadAdmissionFence(async () => {
            let capacity;

            try {
                const canonicalDestination = await (
                    options.resolveDestination ?? resolveApprovedMediaDirectoryIsolated
                )(candidate.path.path);

                capacity = await (options.inspectCapacity ?? inspectYouTubeLiveCapacity)(
                    workDirectory,
                    canonicalDestination,
                );
            } catch {
                const deferred = await deferYouTubeDownloadForCapacity({
                    downloadId: candidate.download.id,
                    nextAttemptAt: new Date(now.getTime() + YOUTUBE_CAPACITY_RECHECK_DELAY_MS),
                    message:
                        "Waiting for the selected YouTube destination and its free-space check to become available.",
                });

                return { kind: "deferred" as const, deferred };
            }

            if (!capacity.sufficient) {
                const deferred = await deferYouTubeDownloadForCapacity({
                    downloadId: candidate.download.id,
                    nextAttemptAt: new Date(now.getTime() + YOUTUBE_CAPACITY_RECHECK_DELAY_MS),
                    message: "Waiting for enough free space to start this YouTube download.",
                });

                return { kind: "deferred" as const, deferred };
            }

            return {
                kind: "claimed" as const,
                download: await claimYouTubeDownload(candidate.download.id, now),
            };
        });

        if (admission.kind === "deferred") {
            // Treat a durable deferral as handled so the drain loop can inspect
            // the next destination without spending this row's retry budget.
            return admission.deferred;
        }

        const { download } = admission;

        if (!download) {
            return false;
        }

        return runClaimedWithFailureHandling(download, {
            adapter: options.adapter ?? createConfiguredYtDlpAdapter(),
            workDirectory,
            cancellationPollMs: options.cancellationPollMs ?? 500,
            now,
            heartbeat,
            onProgress: options.onProgress,
            resolveDestination: options.resolveDestination ?? resolveApprovedMediaDirectoryIsolated,
        });
    })();

    activeRun = run;

    try {
        return await run;
    } finally {
        await writeYouTubeRunnerHeartbeat(
            false,
            options.workDirectory ?? env.YOUTUBE_WORK_DIR,
        ).catch(() => undefined);

        if (activeRun === run) {
            activeRun = null;
        }
    }
}

/** Starts a detached process-local drain loop and returns after durable recovery. */
export async function ensureYouTubeRunnerStarted(
    options: {
        adapter?: YtDlpAdapter;
        workDirectory?: string;
        cancellationPollMs?: number;
        onProgress?: (progress: YouTubeRunnerProgress) => void;
        onHeartbeat?: () => void | Promise<void>;
        inspectCapacity?: typeof inspectYouTubeLiveCapacity;
        resolveDestination?: typeof resolveApprovedMediaDirectoryIsolated;
    } = {},
) {
    await reconcileYouTubeCancellations();

    if (!recovered) {
        await recoverStrandedYouTubeDownloads();
        recovered = true;
    }

    if (drainLoop || activeRun) {
        return;
    }

    const rawLoop = (async () => {
        while (await runNextYouTubeDownload(options)) {
            // One row at a time; keep draining while claims are available.
        }
    })();
    const loop = rawLoop.catch((error) => {
        logger.error("youtube_download_runner_stopped", { error });
    });

    drainLoop = loop;
    void loop.finally(() => {
        if (drainLoop === loop) {
            drainLoop = null;
        }
    });
}

export async function waitForYouTubeRunnerToDrain() {
    await drainLoop;
}

export function resetYouTubeRunnerForTests() {
    activeRun = null;
    drainLoop = null;
    recovered = false;
}
