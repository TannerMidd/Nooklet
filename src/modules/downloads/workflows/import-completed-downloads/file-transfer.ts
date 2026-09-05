import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { lstat, link, mkdir, open, rmdir, unlink } from "node:fs/promises";

import {
    importDestinationClaimPath,
    ensureImportJournalPublicationReady,
    assertImportDestinationAncestors,
    verifyImportJournalPublishedFile,
    markImportJournal,
    type ImportJournalHandle,
    writeImportJournalReceipt,
} from "./import-journal";

export type ImportFilesystemProgress = {
    phase: "copy" | "verify";
    sourcePath: string;
    destinationPath: string;
    bytesProcessed: number;
    totalBytes: number;
};

export type ImportFilesystemProgressReporter = (
    progress: ImportFilesystemProgress,
) => void | Promise<void>;

export type ImportFileTransferOptions = {
    onProgress?: ImportFilesystemProgressReporter;
    /** Exercise the portable streaming path on filesystems where hard links work. */
    disableHardLinks?: boolean;
    /** Keep focused tests small without changing the production chunk size. */
    chunkSizeBytes?: number;
    /** Durable attempt journal. Claims remain until its DB commit marker exists. */
    journal?: ImportJournalHandle;
    /** Index in the immutable journal plan for this file. */
    journalFileIndex?: number;
};

type ImportTransferClaim = {
    version: 1 | 2;
    sourcePath: string;
    destinationPath: string;
    sourceSize: number;
    sourceMtimeMs: number;
    temporaryPath: string;
    destinationIdentity: ImportDestinationIdentity | null;
    attemptId?: string;
    downloadId?: string;
    requestId?: string;
    fileIndex?: number;
};

export type ImportDestinationIdentity = {
    device: string;
    inode: string;
    birthtimeMs: number;
};

export type ImportFileTransferReceipt = {
    sourcePath: string;
    destinationPath: string;
    identity: ImportDestinationIdentity;
    sizeBytes: number;
    mtimeMs: number;
};

type ImportTransferArtifacts = {
    claimPath: string;
    temporaryPath: string;
    claim: ImportTransferClaim;
};

const defaultChunkSizeBytes = 4 * 1024 * 1024;

function hasErrorCode(error: unknown, code: string) {
    return (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === code
    );
}

function resolvedPath(filePath: string) {
    const resolved = path.resolve(/* turbopackIgnore: true */ filePath);

    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function transferDigest(sourcePath: string, destinationPath: string) {
    return createHash("sha256")
        .update(`${resolvedPath(sourcePath)}\0${resolvedPath(destinationPath)}`)
        .digest("hex")
        .slice(0, 16);
}

/** Stable sibling name shared with the scanner's fresh claim check. */
export function importTransferClaimPath(destinationPath: string) {
    return importDestinationClaimPath(destinationPath);
}

async function pathEntry(filePath: string) {
    try {
        return await lstat(filePath);
    } catch (error) {
        if (hasErrorCode(error, "ENOENT")) {
            return null;
        }

        throw error;
    }
}

function destinationIdentity(entry: Awaited<ReturnType<typeof lstat>>): ImportDestinationIdentity {
    return {
        device: String(entry.dev),
        inode: String(entry.ino),
        birthtimeMs: Number(entry.birthtimeMs),
    };
}

function sameDestinationIdentity(
    left: ImportDestinationIdentity,
    right: ImportDestinationIdentity,
) {
    return (
        left.device === right.device &&
        left.inode === right.inode &&
        left.birthtimeMs === right.birthtimeMs
    );
}

function isDestinationIdentity(value: unknown): value is ImportDestinationIdentity {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const identity = value as Partial<ImportDestinationIdentity>;

    return (
        typeof identity.device === "string" &&
        typeof identity.inode === "string" &&
        typeof identity.birthtimeMs === "number" &&
        Number.isFinite(identity.birthtimeMs)
    );
}

export async function describeImportTransferArtifacts(
    sourcePath: string,
    destinationPath: string,
    attemptId?: string,
): Promise<ImportTransferArtifacts> {
    const source = await lstat(sourcePath);

    if (!source.isFile() || source.isSymbolicLink()) {
        throw new Error(`Import source is not a regular file: ${sourcePath}`);
    }

    const absoluteSourcePath = path.resolve(/* turbopackIgnore: true */ sourcePath);
    const absoluteDestinationPath = path.resolve(/* turbopackIgnore: true */ destinationPath);
    const suffix = attemptId ?? transferDigest(absoluteSourcePath, absoluteDestinationPath);
    const temporaryPath = path.join(
        path.dirname(absoluteDestinationPath),
        `.${path.basename(absoluteDestinationPath)}.${suffix}.nooklet-partial`,
    );

    return {
        claimPath: importTransferClaimPath(absoluteDestinationPath),
        temporaryPath,
        claim: {
            version: 2,
            sourcePath: absoluteSourcePath,
            destinationPath: absoluteDestinationPath,
            sourceSize: source.size,
            sourceMtimeMs: source.mtimeMs,
            temporaryPath,
            destinationIdentity: null,
            ...(attemptId ? { attemptId } : {}),
        },
    };
}

function isExpectedClaim(
    value: unknown,
    expected: ImportTransferClaim,
): value is ImportTransferClaim {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const claim = value as Partial<ImportTransferClaim>;

    return (
        (claim.version === 1 || claim.version === 2) &&
        resolvedPath(claim.sourcePath ?? "") === resolvedPath(expected.sourcePath) &&
        resolvedPath(claim.destinationPath ?? "") === resolvedPath(expected.destinationPath) &&
        claim.sourceSize === expected.sourceSize &&
        claim.sourceMtimeMs === expected.sourceMtimeMs &&
        resolvedPath(claim.temporaryPath ?? "") === resolvedPath(expected.temporaryPath) &&
        (claim.destinationIdentity === null || isDestinationIdentity(claim.destinationIdentity)) &&
        (expected.attemptId === undefined || claim.attemptId === expected.attemptId) &&
        (expected.downloadId === undefined || claim.downloadId === expected.downloadId) &&
        (expected.requestId === undefined || claim.requestId === expected.requestId) &&
        (expected.fileIndex === undefined || claim.fileIndex === expected.fileIndex)
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
    } catch (error) {
        if (
            process.platform === "win32" &&
            (hasErrorCode(error, "EINVAL") ||
                hasErrorCode(error, "EPERM") ||
                hasErrorCode(error, "EISDIR") ||
                hasErrorCode(error, "ENOTSUP") ||
                hasErrorCode(error, "EBADF"))
        ) {
            return;
        }

        throw error;
    }
}

async function writeJsonExclusive(filePath: string, value: unknown) {
    const handle = await open(filePath, "wx", 0o600);

    try {
        await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }

    await syncDirectory(path.dirname(filePath));
}

async function writeTransferClaim(
    artifacts: ImportTransferArtifacts,
    options: ImportFileTransferOptions,
) {
    const claim = {
        ...artifacts.claim,
        ...(options.journal
            ? {
                  attemptId: options.journal.plan.attemptId,
                  downloadId: options.journal.plan.downloadId,
                  requestId: options.journal.plan.requestId,
                  fileIndex: options.journalFileIndex,
              }
            : {}),
    } satisfies ImportTransferClaim;

    artifacts.claim = claim;

    await writeJsonExclusive(artifacts.claimPath, claim);
}

async function readClaim(claimPath: string) {
    try {
        const entry = await lstat(claimPath);

        if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 16 * 1024) {
            throw new Error("Import claim is not bounded regular metadata.");
        }

        const handle = await open(claimPath, "r");

        try {
            const opened = await handle.stat();

            if (
                !opened.isFile() ||
                opened.ino !== entry.ino ||
                opened.dev !== entry.dev ||
                opened.size > 16 * 1024
            ) {
                throw new Error("Import claim changed while opening.");
            }

            const bytes = Buffer.alloc(16 * 1024 + 1);
            const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);

            if (bytesRead > 16 * 1024) {
                throw new Error("Import claim is too large.");
            }

            return JSON.parse(bytes.subarray(0, bytesRead).toString("utf8")) as unknown;
        } finally {
            await handle.close();
        }
    } catch (error) {
        if (hasErrorCode(error, "ENOENT")) {
            return null;
        }

        throw error;
    }
}

async function removeOwnedClaim(artifacts: ImportTransferArtifacts) {
    const current = await readClaim(artifacts.claimPath);

    if (current !== null && !isExpectedClaim(current, artifacts.claim)) {
        return false;
    }

    try {
        await unlink(artifacts.claimPath);
        await syncDirectory(path.dirname(artifacts.claimPath));

        return true;
    } catch (error) {
        return hasErrorCode(error, "ENOENT");
    }
}

async function removePrivateTemporary(
    temporaryPath: string,
    receipt: { identity: ImportDestinationIdentity; sizeBytes: number; mtimeMs: number },
) {
    try {
        const entry = await lstat(temporaryPath);

        if (
            !entry.isFile() ||
            entry.isSymbolicLink() ||
            !sameDestinationIdentity(receipt.identity, destinationIdentity(entry)) ||
            entry.size !== receipt.sizeBytes ||
            entry.mtimeMs !== receipt.mtimeMs
        ) {
            return;
        }

        await unlink(temporaryPath);
        await syncDirectory(path.dirname(temporaryPath));
    } catch (error) {
        if (!hasErrorCode(error, "ENOENT")) {
            throw error;
        }
    }
}

async function describeCreatedDestination(
    artifacts: ImportTransferArtifacts,
): Promise<ImportFileTransferReceipt> {
    const entry = await pathEntry(artifacts.claim.destinationPath);

    if (!entry || !entry.isFile() || entry.isSymbolicLink()) {
        throw new Error(
            `Created import destination is not a regular file: ${artifacts.claim.destinationPath}`,
        );
    }

    return {
        sourcePath: artifacts.claim.sourcePath,
        destinationPath: artifacts.claim.destinationPath,
        identity: destinationIdentity(entry),
        sizeBytes: entry.size,
        mtimeMs: entry.mtimeMs,
    };
}

async function recordJournalReceipt(
    journal: ImportJournalHandle | undefined,
    index: number | undefined,
    receipt: ImportFileTransferReceipt,
) {
    if (!journal || index === undefined) {
        return;
    }

    await writeImportJournalReceipt(journal, {
        version: 1,
        index,
        sourcePath: receipt.sourcePath,
        destinationPath: receipt.destinationPath,
        device: receipt.identity.device,
        inode: receipt.identity.inode,
        birthtimeMs: receipt.identity.birthtimeMs,
        sizeBytes: receipt.sizeBytes,
        mtimeMs: receipt.mtimeMs,
    });
    await markImportJournal(journal, "published-known", index);
}

async function markJournalUnknown(
    journal: ImportJournalHandle | undefined,
    index: number | undefined,
    error: unknown,
) {
    if (!journal || index === undefined) {
        return;
    }

    await markImportJournal(journal, "published-unknown", index, {
        error: error instanceof Error ? error.message.slice(0, 2048) : "Unknown transfer error.",
    }).catch(() => undefined);
}

async function hashFile(
    filePath: string,
    sourcePath: string,
    destinationPath: string,
    totalBytes: number,
    options: ImportFileTransferOptions,
) {
    const handle = await open(filePath, "r");
    const hash = createHash("sha256");
    const chunk = Buffer.allocUnsafe(options.chunkSizeBytes ?? defaultChunkSizeBytes);
    let bytesProcessed = 0;

    try {
        for (;;) {
            const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);

            if (bytesRead === 0) {
                break;
            }

            hash.update(chunk.subarray(0, bytesRead));
            bytesProcessed += bytesRead;
            await options.onProgress?.({
                phase: "verify",
                sourcePath,
                destinationPath,
                bytesProcessed,
                totalBytes,
            });
        }
    } finally {
        await handle.close();
    }

    return hash.digest("hex");
}

async function hasSameContent(
    sourcePath: string,
    destinationPath: string,
    options: ImportFileTransferOptions,
) {
    const [sourceEntry, destinationEntry] = await Promise.all([
        pathEntry(sourcePath),
        pathEntry(destinationPath),
    ]);

    if (
        !sourceEntry ||
        !destinationEntry ||
        !sourceEntry.isFile() ||
        !destinationEntry.isFile() ||
        sourceEntry.isSymbolicLink() ||
        destinationEntry.isSymbolicLink() ||
        sourceEntry.size !== destinationEntry.size
    ) {
        return false;
    }

    const [sourceHash, destinationHash] = await Promise.all([
        hashFile(sourcePath, sourcePath, destinationPath, sourceEntry.size, options),
        hashFile(destinationPath, sourcePath, destinationPath, destinationEntry.size, options),
    ]);

    return sourceHash === destinationHash;
}

async function recoverInterruptedTransfer(
    sourcePath: string,
    destinationPath: string,
    artifacts: ImportTransferArtifacts,
) {
    const [claimEntry, temporaryEntry] = await Promise.all([
        pathEntry(artifacts.claimPath),
        pathEntry(artifacts.temporaryPath),
    ]);

    if (claimEntry || temporaryEntry) {
        return {
            kind: "blocked" as const,
            message: claimEntry
                ? `Import recovery is awaiting its durable journal: ${artifacts.claimPath}`
                : `An interrupted import stage was retained for recovery: ${artifacts.temporaryPath}`,
        };
    }

    return { kind: "none" as const, sourcePath, destinationPath };
}

export type ImportDestinationResolution =
    | { kind: "ready"; destinationPath: string }
    | { kind: "already-present"; destinationPath: string }
    | { kind: "failed"; message: string };

export async function resolveImportDestination(
    sourcePath: string,
    destinationPath: string,
    options: ImportFileTransferOptions = {},
): Promise<ImportDestinationResolution> {
    if (options.journal) {
        await ensureImportJournalPublicationReady(options.journal);
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    const artifacts = await describeImportTransferArtifacts(
        sourcePath,
        destinationPath,
        options.journal?.plan.attemptId,
    );
    const recovery = await recoverInterruptedTransfer(sourcePath, destinationPath, artifacts);

    if (recovery.kind === "blocked") {
        if (options.journal && options.journalFileIndex !== undefined) {
            const expected = {
                ...artifacts.claim,
                downloadId: options.journal.plan.downloadId,
                requestId: options.journal.plan.requestId,
                fileIndex: options.journalFileIndex,
            };
            const claim = await readClaim(artifacts.claimPath).catch(() => null);

            if (
                isExpectedClaim(claim, expected) &&
                (await verifyImportJournalPublishedFile(options.journal, options.journalFileIndex))
            ) {
                return { kind: "already-present", destinationPath };
            }
        }

        return { kind: "failed", message: recovery.message };
    }

    const destination = await pathEntry(destinationPath);

    if (!destination) {
        return { kind: "ready", destinationPath };
    }

    if (destination.isFile() && !destination.isSymbolicLink()) {
        if (await hasSameContent(sourcePath, destinationPath, options)) {
            return { kind: "already-present", destinationPath };
        }
    }

    return {
        kind: "failed",
        message: `Destination file already exists: ${destinationPath}`,
    };
}

async function streamCopy(
    sourcePath: string,
    destinationPath: string,
    options: ImportFileTransferOptions,
    onDestinationOpened?: () => void | Promise<void>,
) {
    const sourceHandle = await open(sourcePath, "r");
    const source = await sourceHandle.stat();
    const chunk = Buffer.allocUnsafe(options.chunkSizeBytes ?? defaultChunkSizeBytes);
    let bytesProcessed = 0;
    let destinationHandle: Awaited<ReturnType<typeof open>> | null = null;

    try {
        if (!source.isFile()) {
            throw new Error(`Import source is not a regular file: ${sourcePath}`);
        }

        destinationHandle = await open(destinationPath, "wx", source.mode);
        await onDestinationOpened?.();
        const openedIdentity = destinationIdentity(await destinationHandle.stat());

        for (;;) {
            const { bytesRead } = await sourceHandle.read(chunk, 0, chunk.length, null);

            if (bytesRead === 0) {
                break;
            }

            let written = 0;

            while (written < bytesRead) {
                const result = await destinationHandle.write(
                    chunk,
                    written,
                    bytesRead - written,
                    null,
                );

                if (result.bytesWritten === 0) {
                    throw new Error(`Import copy stopped making progress: ${destinationPath}`);
                }

                written += result.bytesWritten;
            }

            bytesProcessed += bytesRead;
            await options.onProgress?.({
                phase: "copy",
                sourcePath,
                destinationPath,
                bytesProcessed,
                totalBytes: source.size,
            });
        }

        await destinationHandle.utimes(source.atime, source.mtime);
        await destinationHandle.sync();
        const destination = await destinationHandle.stat();
        const sourceAfter = await sourceHandle.stat();

        if (
            sourceAfter.size !== source.size ||
            sourceAfter.mtimeMs !== source.mtimeMs ||
            destination.size !== source.size
        ) {
            throw new Error(`Import source changed while it was being copied: ${sourcePath}`);
        }

        return {
            identity: openedIdentity,
            sizeBytes: destination.size,
            mtimeMs: destination.mtimeMs,
        };
    } finally {
        await Promise.allSettled([
            sourceHandle.close(),
            ...(destinationHandle ? [destinationHandle.close()] : []),
        ]);
    }
}

function hardLinkFallbackAllowed(error: unknown) {
    return (
        hasErrorCode(error, "EXDEV") ||
        hasErrorCode(error, "EPERM") ||
        hasErrorCode(error, "EOPNOTSUPP") ||
        hasErrorCode(error, "ENOTSUP") ||
        hasErrorCode(error, "EINVAL")
    );
}

async function destinationSupportsHardLinks(seedPath: string) {
    const probeDirectory = path.join(path.dirname(seedPath), `.${randomUUID()}.nooklet-link-probe`);
    const probeSource = path.join(probeDirectory, "source");
    const probeDestination = path.join(probeDirectory, "linked");
    let directoryCreated = false;
    let sourceCreated = false;
    let destinationCreated = false;

    try {
        await mkdir(probeDirectory, { recursive: false });
        directoryCreated = true;
        const handle = await open(probeSource, "wx", 0o600);

        sourceCreated = true;
        await handle.close();
        await link(probeSource, probeDestination);
        destinationCreated = true;

        return true;
    } catch {
        return false;
    } finally {
        if (destinationCreated) {
            await unlink(probeDestination).catch(() => undefined);
        }

        if (sourceCreated) {
            await unlink(probeSource).catch(() => undefined);
        }

        if (directoryCreated) {
            await rmdir(probeDirectory).catch(() => undefined);
        }
    }
}

/**
 * Publish an import without deleting its engine-owned source. Once a final
 * pathname exists, every error preserves it and leaves the claim/journal for
 * durable reconciliation. The caller removes only the source after the DB
 * commit marker is written.
 */
export async function transferImportFile(
    sourcePath: string,
    destinationPath: string,
    options: ImportFileTransferOptions = {},
): Promise<ImportFileTransferReceipt | null> {
    if (resolvedPath(sourcePath) === resolvedPath(destinationPath)) {
        return null;
    }

    if (options.journal) {
        await ensureImportJournalPublicationReady(options.journal);
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    const artifacts = await describeImportTransferArtifacts(
        sourcePath,
        destinationPath,
        options.journal?.plan.attemptId,
    );
    const journalIndex = options.journalFileIndex;

    if (options.journal) {
        const planned =
            journalIndex === undefined ? null : options.journal.plan.files[journalIndex];

        if (
            !planned ||
            resolvedPath(planned.sourcePath) !== resolvedPath(sourcePath) ||
            resolvedPath(planned.destinationPath) !== resolvedPath(destinationPath) ||
            planned.sourceSizeBytes !== artifacts.claim.sourceSize ||
            planned.sourceMtimeMs !== artifacts.claim.sourceMtimeMs
        ) {
            throw new Error("Import transfer does not match its immutable plan.");
        }
    }

    let destinationPublished = false;
    let destinationCreated = false;
    let uncertain = false;
    let claimCreated = false;
    let temporaryReceipt:
        { identity: ImportDestinationIdentity; sizeBytes: number; mtimeMs: number } | undefined;

    try {
        if (options.journal) {
            await markImportJournal(options.journal, "publishing", journalIndex);
        }

        if (options.journal) {
            await assertImportDestinationAncestors(options.journal, destinationPath);
        }

        await writeTransferClaim(artifacts, options).catch((error) => {
            if (hasErrorCode(error, "EEXIST")) {
                throw new Error(`Another import owns the destination: ${destinationPath}`);
            }

            throw error;
        });

        claimCreated = true;

        if (!options.disableHardLinks) {
            const sourceEntry = await pathEntry(sourcePath);

            if (!sourceEntry || !sourceEntry.isFile() || sourceEntry.isSymbolicLink()) {
                throw new Error(`Import source is not a regular file: ${sourcePath}`);
            }

            try {
                await link(sourcePath, destinationPath);
                destinationPublished = true;
            } catch (error) {
                if (hasErrorCode(error, "EEXIST")) {
                    throw new Error(`Destination file already exists: ${destinationPath}`);
                }

                if (!hardLinkFallbackAllowed(error)) {
                    throw error;
                }
            }

            if (destinationPublished) {
                try {
                    const destinationEntry = await pathEntry(destinationPath);

                    if (
                        !destinationEntry ||
                        !destinationEntry.isFile() ||
                        destinationEntry.isSymbolicLink() ||
                        destinationEntry.size !== sourceEntry.size ||
                        destinationEntry.mtimeMs !== sourceEntry.mtimeMs ||
                        !sameDestinationIdentity(
                            destinationIdentity(sourceEntry),
                            destinationIdentity(destinationEntry),
                        )
                    ) {
                        throw new Error(
                            `The published import destination could not be verified: ${destinationPath}`,
                        );
                    }

                    const receipt: ImportFileTransferReceipt = {
                        sourcePath: artifacts.claim.sourcePath,
                        destinationPath: artifacts.claim.destinationPath,
                        identity: destinationIdentity(destinationEntry),
                        sizeBytes: destinationEntry.size,
                        mtimeMs: destinationEntry.mtimeMs,
                    };

                    await recordJournalReceipt(options.journal, journalIndex, receipt);

                    return receipt;
                } catch (error) {
                    uncertain = true;
                    await markJournalUnknown(options.journal, journalIndex, error);

                    throw error;
                }
            }
        }

        const hardLinksSupported =
            !options.disableHardLinks &&
            (await destinationSupportsHardLinks(artifacts.temporaryPath));

        if (hardLinksSupported) {
            const copied = await streamCopy(sourcePath, artifacts.temporaryPath, options);

            temporaryReceipt = copied;

            try {
                await link(artifacts.temporaryPath, destinationPath);
                destinationPublished = true;
                const destinationEntry = await pathEntry(destinationPath);

                if (
                    !destinationEntry ||
                    !destinationEntry.isFile() ||
                    destinationEntry.isSymbolicLink() ||
                    !sameDestinationIdentity(copied.identity, destinationIdentity(destinationEntry))
                ) {
                    throw new Error(
                        `The published import destination could not be verified: ${destinationPath}`,
                    );
                }

                const receipt: ImportFileTransferReceipt = {
                    sourcePath: artifacts.claim.sourcePath,
                    destinationPath: artifacts.claim.destinationPath,
                    identity: destinationIdentity(destinationEntry),
                    sizeBytes: destinationEntry.size,
                    mtimeMs: destinationEntry.mtimeMs,
                };

                await recordJournalReceipt(options.journal, journalIndex, receipt);

                return receipt;
            } catch (error) {
                if (hasErrorCode(error, "EEXIST")) {
                    throw new Error(`Destination file already exists: ${destinationPath}`);
                }

                uncertain = destinationPublished;

                if (uncertain) {
                    await markJournalUnknown(options.journal, journalIndex, error);
                }

                throw error;
            }
        }

        const copied = await streamCopy(sourcePath, destinationPath, options, () => {
            destinationCreated = true;
        });

        destinationPublished = true;

        try {
            const receipt = await describeCreatedDestination(artifacts);

            if (
                !sameDestinationIdentity(copied.identity, receipt.identity) ||
                receipt.sizeBytes !== copied.sizeBytes
            ) {
                throw new Error(
                    `The streamed import destination changed before verification: ${destinationPath}`,
                );
            }

            await recordJournalReceipt(options.journal, journalIndex, receipt);

            return receipt;
        } catch (error) {
            uncertain = true;
            await markJournalUnknown(options.journal, journalIndex, error);

            throw error;
        }
    } catch (error) {
        if (destinationPublished || destinationCreated || uncertain) {
            await markJournalUnknown(options.journal, journalIndex, error);
        } else if (claimCreated) {
            // A collision or pre-publication failure owns no final media file.
            // Remove only the claim this call created after re-reading it; a
            // changed/invalid claim remains visible for recovery diagnostics.
            await removeOwnedClaim(artifacts).catch(() => undefined);
        }

        if (hasErrorCode(error, "EEXIST")) {
            throw new Error(`Destination file already exists: ${destinationPath}`);
        }

        throw error;
    } finally {
        if (temporaryReceipt) {
            await removePrivateTemporary(artifacts.temporaryPath, temporaryReceipt).catch(
                () => undefined,
            );
        }
    }
}
