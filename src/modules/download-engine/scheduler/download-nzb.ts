import path from "node:path";
import { mkdir, open, type FileHandle } from "node:fs/promises";

import { sanitizeDownloadFileName } from "@/modules/download-engine/assembly/sanitize-file-name";
import {
    NntpClient,
    NntpError,
    type NntpErrorKind,
    type NntpServerOptions,
} from "@/modules/download-engine/nntp/nntp-client";
import { type ParsedNzb } from "@/modules/download-engine/nzb/parse-nzb";
import {
    isPar2Subject,
    sampleWithoutReplacement,
} from "@/modules/download-engine/scheduler/release-availability";
import {
    createDownloadStageControl,
    DownloadStageStopError,
} from "@/modules/download-engine/scheduler/stage-control";
import { decodeYencArticle, YencDecodeError } from "@/modules/download-engine/yenc/decode-yenc";

/**
 * Segment scheduler + assembly (ADR-0002 slice 2). Fetches every segment of a
 * parsed NZB over a pool of NNTP connections and writes decoded payloads
 * directly at their yEnc part offsets, so files assemble in place without
 * intermediate segment files.
 */

export type EngineServerConfig = NntpServerOptions & {
    /** Parallel NNTP connections to open against this server. */
    connections: number;
};

export type DownloadNzbProgress = {
    downloadedBytes: number;
    completedSegments: number;
    failedSegments: number;
    totalSegments: number;
};

export type DownloadedNzbFile = {
    fileIndex: number;
    subject: string;
    /** Resolved on the first successfully decoded segment; null if none landed. */
    fileName: string | null;
    filePath: string | null;
    totalSegments: number;
    completedSegments: number;
    failedSegments: number;
    bytesWritten: number;
    ok: boolean;
};

export type DownloadNzbResult = {
    files: DownloadedNzbFile[];
    downloadedBytes: number;
    completedSegments: number;
    failedSegments: number;
    totalSegments: number;
    aborted: boolean;
    /**
     * True when the run stopped early because more data is missing or lost than
     * any PAR2 recovery set in this NZB could repair — whether detected by the
     * pre-transfer availability probe or by mid-transfer loss accounting. The
     * release is a write-off and the caller should move on.
     */
    unrecoverable: boolean;
    /**
     * True when the run stopped because the news server kept failing on
     * segments this release does have. It says nothing about the release, so
     * the caller must not blocklist it and move to another candidate.
     */
    transportExhausted: boolean;
    /**
     * True when the run stopped because the caller-supplied wall-clock deadline
     * elapsed. It says nothing about the release or the server state beyond
     * slowness, so the caller must park rather than fail the download.
     */
    deadlineExceeded: boolean;
    failureKinds: NntpErrorKind[];
    /** True when every file completed with zero failed segments. */
    ok: boolean;
};

export type NntpClientLike = Pick<NntpClient, "connect" | "body" | "stat" | "quit" | "destroy">;

export type DownloadNzbInput = {
    nzb: ParsedNzb;
    server: EngineServerConfig;
    /** Directory files assemble into; created if missing. */
    workDir: string;
    onProgress?: (progress: DownloadNzbProgress) => void;
    /** Checked between segments; return true to stop the run. */
    shouldAbort?: () => boolean;
    /**
     * Epoch ms after which the run stops itself and reports
     * `deadlineExceeded`. The engine is serial, so without a wall-clock bound
     * one trickle-slow server could hold the whole queue indefinitely even
     * though every individual socket operation keeps resetting its own
     * per-read timeout.
     */
    deadlineAt?: number;
    /** Transient-failure retries per segment (permanent failures never retry). */
    maxRetriesPerSegment?: number;
    /** Test seam — swap the socket client for a scripted fake. */
    clientFactory?: (options: NntpServerOptions) => NntpClientLike;
};

type SegmentTask = {
    fileIndex: number;
    segmentNumber: number;
    declaredBytes: number;
    messageId: string;
};

type FileAssemblyState = {
    fileIndex: number;
    subject: string;
    fileName: string | null;
    filePath: string | null;
    handle: FileHandle | null;
    opening: Promise<void> | null;
    expectedFileSize: number | null;
    ranges: Array<{ begin: number; end: number }>;
    totalSegments: number;
    completedSegments: number;
    failedSegments: number;
    bytesWritten: number;
};

function defaultClientFactory(options: NntpServerOptions): NntpClientLike {
    return new NntpClient(options);
}

/** Derives a stable fallback name from the NZB subject when yEnc omits one. */
function fallbackFileName(subject: string, fileIndex: number) {
    const quoted = subject.match(/"([^"]+)"/)?.[1];

    return sanitizeDownloadFileName(quoted ?? subject, `file-${fileIndex + 1}.bin`);
}

/** Releases below this many data segments skip the availability probe. */
const probeMinDataSegments = 40;
const probeSampleSize = 120;
/**
 * A negative probe verdict is only believable when the sample also proved the
 * server can serve this release at all. An all-missing sample means STAT is
 * not answering usefully here (spool disagreement, throttling, a server that
 * reports nothing by message-id), and abandoning on it discards every
 * candidate for an episode without transferring a byte.
 */
const probeMinPresentArticles = 3;
/**
 * BODY requests used to confirm an all-missing STAT sample before the release
 * is abandoned. Cheap enough to be free next to the thousands of doomed
 * fetches the confirmation replaces.
 */
const probeConfirmationArticles = 3;
/** Transport-failed segments tolerated before the run stops blaming the release. */
const maxTransportFailures = 50;

export async function downloadNzb(input: DownloadNzbInput): Promise<DownloadNzbResult> {
    const clientFactory = input.clientFactory ?? defaultClientFactory;
    const maxRetries = input.maxRetriesPerSegment ?? 2;

    await mkdir(input.workDir, { recursive: true });

    const fileStates: FileAssemblyState[] = input.nzb.files.map((file, fileIndex) => ({
        fileIndex,
        subject: file.subject,
        fileName: null,
        filePath: null,
        handle: null,
        opening: null,
        expectedFileSize: null,
        ranges: [],
        totalSegments: file.segments.length,
        completedSegments: 0,
        failedSegments: 0,
        bytesWritten: 0,
    }));

    const tasks: SegmentTask[] = input.nzb.files.flatMap((file, fileIndex) =>
        file.segments.map((segment) => ({
            fileIndex,
            segmentNumber: segment.number,
            declaredBytes: segment.bytes,
            messageId: segment.messageId,
        })),
    );

    const totals = {
        downloadedBytes: 0,
        completedSegments: 0,
        failedSegments: 0,
    };

    // Unrecoverable-release detection. NZB segment sizes are yEnc-encoded for
    // payload and PAR2 volumes alike, so once the encoded bytes lost from data
    // files exceed the encoded bytes of the still-fetchable recovery set, no
    // PAR2 repair can succeed and fetching the remainder is pure waste. PAR2
    // block granularity only ever lowers real capacity below this byte-level
    // estimate, so the abandon decision cannot fire on a repairable release.
    // When no PAR2 set is visible (fully obfuscated posts can hide one), a 10%
    // allowance stands in for the largest plausible hidden recovery set.
    const par2FileIndexes = new Set(
        input.nzb.files.flatMap((file, index) => (isPar2Subject(file.subject) ? [index] : [])),
    );
    const par2DeclaredBytes = input.nzb.files.reduce(
        (total, file, index) => (par2FileIndexes.has(index) ? total + file.declaredBytes : total),
        0,
    );
    const hiddenRecoveryAllowance =
        par2DeclaredBytes > 0 ? 0 : Math.floor(input.nzb.declaredBytes * 0.1);
    let failedDataBytes = 0;
    let lostPar2Bytes = 0;
    let unrecoverable = false;
    // Segments given up on for transport reasons rather than a missing article.
    // Each already burned its full retry budget on a fresh connection, so this
    // many means the server side is broken, not the release.
    let transportFailures = 0;
    let transportExhausted = false;

    let nextTaskIndex = 0;
    let fatalError: Error | null = null;
    const failureKinds = new Set<NntpErrorKind>();
    const reservedOutputNames = new Set<string>();

    function rememberFatalError(error: unknown) {
        fatalError ??=
            error instanceof Error
                ? error
                : new Error("The download stage encountered an unexpected failure.");
    }

    const workerCount = Math.max(1, Math.min(input.server.connections, tasks.length));
    const stageControl = createDownloadStageControl({
        deadlineAt: input.deadlineAt,
        shouldAbort: input.shouldAbort,
        onCallerError: rememberFatalError,
        expectedWorkers: workerCount,
    });

    const reportProgress = () => {
        input.onProgress?.({
            downloadedBytes: totals.downloadedBytes,
            completedSegments: totals.completedSegments,
            failedSegments: totals.failedSegments,
            totalSegments: tasks.length,
        });
    };

    function reserveOutputName(decodedName: string, state: FileAssemblyState) {
        const sanitized = sanitizeDownloadFileName(
            decodedName,
            fallbackFileName(state.subject, state.fileIndex),
        );
        const extension = path.extname(sanitized);
        const baseName = extension ? sanitized.slice(0, -extension.length) : sanitized;
        let candidate = sanitized;
        let suffix = 1;

        while (reservedOutputNames.has(candidate.toLocaleLowerCase())) {
            candidate = `${baseName}.${state.fileIndex + 1}-${suffix}${extension}`;
            suffix += 1;
        }

        reservedOutputNames.add(candidate.toLocaleLowerCase());

        return candidate;
    }

    /** Opens (once) the target file for a state, pre-sized to the yEnc file size. */
    async function ensureFileOpen(state: FileAssemblyState, decodedName: string, fileSize: number) {
        if (state.handle) {
            return;
        }

        if (!state.opening) {
            state.opening = (async () => {
                const name = reserveOutputName(decodedName, state);
                const filePath = path.join(input.workDir, name);
                const handle = await open(filePath, "wx");

                await handle.truncate(fileSize);
                state.expectedFileSize = fileSize;
                state.fileName = name;
                state.filePath = filePath;
                state.handle = handle;
            })();
        }

        await state.opening;
    }

    async function fetchSegment(client: NntpClientLike, task: SegmentTask) {
        const body = await stageControl.race(() => client.body(task.messageId));
        const declaredFileBytes = input.nzb.files[task.fileIndex].declaredBytes;
        let decoded: ReturnType<typeof decodeYencArticle>;

        try {
            decoded = decodeYencArticle(body, { maxFileBytes: declaredFileBytes });
        } catch (error) {
            if (error instanceof YencDecodeError) {
                throw new NntpError("article-unusable", error.message, true);
            }

            throw error;
        }

        const state = fileStates[task.fileIndex];

        if (decoded.data.length > task.declaredBytes) {
            throw new NntpError(
                "article-unusable",
                `Segment <${task.messageId}> exceeds its NZB-declared byte size.`,
                true,
            );
        }

        // The yEnc name is advisory, not identity: obfuscated posts randomize it
        // per article, so parts of one file routinely disagree. The NZB's <file>
        // grouping is the identity, and size/part/range/CRC below still prove a
        // segment belongs here. PAR2 deobfuscation restores the real name after
        // assembly. Rejecting on the name condemned every such release.
        if (state.expectedFileSize !== null && state.expectedFileSize !== decoded.fileSize) {
            throw new NntpError(
                "article-unusable",
                `Segment <${task.messageId}> changed the yEnc file size.`,
                true,
            );
        }

        if (state.totalSegments > 1 && !decoded.part) {
            throw new NntpError(
                "article-unusable",
                `Segment <${task.messageId}> omitted its multipart byte range.`,
                true,
            );
        }

        if (
            decoded.part &&
            decoded.part.number !== null &&
            decoded.part.number !== task.segmentNumber
        ) {
            throw new NntpError(
                "article-unusable",
                `Segment <${task.messageId}> declared the wrong part number.`,
                true,
            );
        }

        if (
            decoded.part &&
            decoded.part.total !== null &&
            decoded.part.total !== state.totalSegments
        ) {
            throw new NntpError(
                "article-unusable",
                `Segment <${task.messageId}> declared an inconsistent part count.`,
                true,
            );
        }

        await ensureFileOpen(state, decoded.name, decoded.fileSize);

        // Another connection may have opened this file while this segment was
        // decoding; re-check the canonical metadata after the shared open.
        if (state.expectedFileSize !== decoded.fileSize) {
            throw new NntpError(
                "article-unusable",
                `Segment <${task.messageId}> conflicts with another segment's yEnc metadata.`,
                true,
            );
        }

        const range = decoded.part
            ? { begin: decoded.part.begin, end: decoded.part.end }
            : { begin: 1, end: decoded.fileSize };

        if (
            state.ranges.some(
                (existing) => range.begin <= existing.end && range.end >= existing.begin,
            )
        ) {
            throw new NntpError(
                "article-unusable",
                `Segment <${task.messageId}> overlaps another yEnc byte range.`,
                true,
            );
        }

        if (decoded.crcOk === false || !decoded.sizeOk) {
            throw new NntpError(
                "article-unusable",
                `Segment <${task.messageId}> failed integrity checks.`,
                true,
            );
        }

        state.ranges.push(range);
        const offset = range.begin - 1;
        let bytesWritten = 0;

        try {
            while (bytesWritten < decoded.data.length) {
                const write = await state.handle!.write(
                    decoded.data,
                    bytesWritten,
                    decoded.data.length - bytesWritten,
                    offset + bytesWritten,
                );

                if (write.bytesWritten <= 0) {
                    throw new Error("The assembled file stopped accepting bytes.");
                }

                bytesWritten += write.bytesWritten;
            }
        } catch (error) {
            state.ranges = state.ranges.filter((candidate) => candidate !== range);

            throw error;
        }

        state.bytesWritten += decoded.data.length;
        totals.downloadedBytes += decoded.data.length;
    }

    async function runWorker() {
        let client: NntpClientLike | null = null;

        const getClient = async () => {
            if (!client) {
                client = stageControl.registerClient(clientFactory(input.server));

                try {
                    await stageControl.race(() => client!.connect());
                } catch (error) {
                    stageControl.destroyClient(client);
                    client = null;

                    throw error;
                }
            }

            return client;
        };

        const dropClient = () => {
            if (client) {
                stageControl.destroyClient(client);
            }

            client = null;
        };

        try {
            for (;;) {
                // Work exhaustion is checked before the deadline so a transfer
                // whose final segment lands as the budget expires completes
                // normally instead of being reported as an overrun and restarted
                // from scratch.
                const taskIndex = nextTaskIndex;

                if (taskIndex >= tasks.length) {
                    break;
                }

                if (stageControl.poll() || unrecoverable || transportExhausted) {
                    break;
                }

                nextTaskIndex += 1;
                const task = tasks[taskIndex];
                const state = fileStates[task.fileIndex];
                let failed = true;
                let abandonTask = false;
                let terminalFailureKind: NntpErrorKind | null = null;

                for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
                    // A retry is another segment attempt: poll every stop fence
                    // before reconnecting so a cancellation between a transient
                    // response and the next attempt cannot issue another connect
                    // or BODY command.
                    if (stageControl.poll()) {
                        abandonTask = true;
                        break;
                    }

                    try {
                        const connectedClient = await getClient();

                        // A connection may finish just as the caller callback or
                        // absolute deadline asks the stage to stop. Do not issue a
                        // BODY after that boundary.
                        if (stageControl.poll()) {
                            abandonTask = true;
                            break;
                        }

                        await fetchSegment(connectedClient, task);
                        failed = false;
                        break;
                    } catch (error) {
                        // The deadline watchdog destroys live clients when the
                        // budget expires, which surfaces here as a connection
                        // error mid-article. Abandon the whole task without
                        // spending failure accounting on a segment the run is
                        // leaving behind anyway.
                        // Sample the caller fence before the deadline fence: a
                        // cancellation can become true as a transient operation
                        // rejects at the exact deadline, and must not be relabeled
                        // as a timeout before the next retry-loop poll.
                        if (stageControl.poll()) {
                            abandonTask = true;
                            break;
                        }

                        if (error instanceof DownloadStageStopError) {
                            abandonTask = true;
                            break;
                        }

                        if (!(error instanceof NntpError)) {
                            rememberFatalError(error);
                            stageControl.requestStop("caller");
                            abandonTask = true;
                            break;
                        }

                        terminalFailureKind = error.kind;
                        const permanent = error.permanent;

                        // Only a "not on this server" reply leaves the stream in a known
                        // state: its status line was consumed and no article body follows.
                        // Anything else can desync the connection, and a desynced
                        // connection fails every later segment this worker touches, so it
                        // must be thrown away rather than reused.
                        if (error.kind !== "article-not-found") {
                            dropClient();
                        }

                        if (permanent && error.kind === "auth-failed") {
                            // Credentials are wrong for every segment — stop the whole run.
                            stageControl.requestStop("caller");
                            fatalError = error;
                            abandonTask = true;
                            break;
                        }

                        if (permanent || attempt === maxRetries) {
                            break;
                        }

                        // Another worker may have proven the release unrepairable while
                        // this attempt was in flight; further retries cannot change that.
                        if (unrecoverable) {
                            break;
                        }
                    }
                }

                if (abandonTask) {
                    break;
                }

                if (failed) {
                    if (terminalFailureKind) {
                        failureKinds.add(terminalFailureKind);
                    }

                    state.failedSegments += 1;
                    totals.failedSegments += 1;

                    // Only the article itself is evidence about the release: one the
                    // server does not have, or one it delivered that will not decode into
                    // this file. Both leave the same hole for PAR2 to repair. A transport
                    // failure says our connection broke, so spending the recovery budget
                    // on it condemns posts that are perfectly downloadable — and the
                    // caller then blocklists them and moves on.
                    if (
                        terminalFailureKind === "article-not-found" ||
                        terminalFailureKind === "article-unusable"
                    ) {
                        if (par2FileIndexes.has(task.fileIndex)) {
                            lostPar2Bytes += task.declaredBytes;
                        } else {
                            failedDataBytes += task.declaredBytes;
                        }

                        if (
                            failedDataBytes >
                            Math.max(0, par2DeclaredBytes - lostPar2Bytes) + hiddenRecoveryAllowance
                        ) {
                            unrecoverable = true;
                        }
                    } else {
                        transportFailures += 1;

                        // A server that keeps refusing mid-run will not improve by grinding
                        // through the remaining segments. Stop, but report it as the
                        // transport problem it is instead of a damaged release.
                        if (transportFailures >= maxTransportFailures) {
                            transportExhausted = true;
                        }
                    }
                } else {
                    state.completedSegments += 1;
                    totals.completedSegments += 1;
                }

                reportProgress();
            }
        } catch (error) {
            // Unexpected worker exceptions must still release the live client;
            // remember them so the stage can rethrow after all workers settle.
            rememberFatalError(error);
            stageControl.requestStop("caller");
        } finally {
            const finalWorker = stageControl.workerConcluded();
            const workerClient = client;

            client = null;

            if (workerClient) {
                try {
                    await stageControl.disposeClient(workerClient, finalWorker);
                } catch (error) {
                    rememberFatalError(error);
                    stageControl.requestStop("caller");
                } finally {
                    stageControl.unregisterClient(workerClient);
                }
            }
        }
    }

    /**
     * Availability probe: STAT a random sample of data segments before fetching
     * any bodies. A mass-removed release announces itself in the first hundred
     * round trips, so it can be abandoned in seconds instead of after gigabytes
     * of doomed transfers. Only a statistically decisive result abandons the
     * release: the projected loss must exceed the recovery budget even at the
     * bottom of a 3-sigma confidence bound. Anything less — including servers
     * that reject STAT and any connection trouble — falls through to the normal
     * transfer path, where the byte-accounting backstop still applies.
     */
    async function probeShowsUnrecoverable(): Promise<boolean> {
        const dataTasks = tasks.filter((task) => !par2FileIndexes.has(task.fileIndex));

        if (dataTasks.length < probeMinDataSegments) {
            return false;
        }

        const sample = sampleWithoutReplacement(dataTasks, probeSampleSize);
        const dataDeclaredBytes = dataTasks.reduce((total, task) => total + task.declaredBytes, 0);
        const client = stageControl.registerClient(clientFactory(input.server));
        let sampledBytes = 0;
        let missingBytes = 0;
        let missingCount = 0;
        let presentCount = 0;
        let confirmedFullyMissing = false;

        try {
            await stageControl.race(() => client.connect());

            if (stageControl.poll()) {
                return false;
            }

            for (const task of sample) {
                if (stageControl.poll()) {
                    return false;
                }

                sampledBytes += task.declaredBytes;

                if (await stageControl.race(() => client.stat(task.messageId))) {
                    presentCount += 1;
                } else {
                    missingBytes += task.declaredBytes;
                    missingCount += 1;
                }
            }

            // A sample with nothing present is the one shape the bound below cannot
            // speak to, and it has two very different causes: the release is gone,
            // or STAT is not usable here. BODY tells them apart — a 430 to an actual
            // article request is the server's own answer, not an inference from it.
            // Without this, the cheapest release to diagnose became the most
            // expensive: every article had to fail individually before byte
            // accounting reached the same verdict, thousands of round trips later.
            if (presentCount === 0 && missingCount > 0) {
                confirmedFullyMissing = true;

                for (const task of sample.slice(0, probeConfirmationArticles)) {
                    if (stageControl.poll()) {
                        return false;
                    }

                    try {
                        await stageControl.race(() => client.body(task.messageId));

                        // Fetchable after all: STAT is not to be trusted for this release.
                        return false;
                    } catch (error) {
                        if (!(error instanceof NntpError) || error.kind !== "article-not-found") {
                            // Transport trouble proves nothing about the release.
                            return false;
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof NntpError && error.kind === "auth-failed" && error.permanent) {
                throw error;
            }

            stageControl.poll();

            // Probe trouble must never fail a downloadable release; the transfer
            // path re-encounters and classifies any real problem.
            return false;
        } finally {
            await stageControl.disposeClient(client, true);
        }

        if (sampledBytes === 0) {
            return false;
        }

        // The 3-sigma bound below collapses to zero width when the sample is
        // entirely missing, so it offers no protection in exactly the case a
        // misbehaving STAT produces. Require positive proof about the release —
        // either articles the server does serve, or BODY confirming the ones it
        // does not — before a negative verdict is allowed to abandon it.
        if (presentCount < probeMinPresentArticles && !confirmedFullyMissing) {
            return false;
        }

        const missingRatio = missingBytes / sampledBytes;
        const countRatio = missingCount / sample.length;
        const sigma = Math.sqrt((countRatio * (1 - countRatio)) / sample.length);
        // A confirmed all-missing sample needs no confidence interval: the loss
        // was observed directly rather than projected from a partial one.
        const lowerBoundRatio = confirmedFullyMissing
            ? missingRatio
            : Math.max(0, missingRatio - 3 * sigma);

        return lowerBoundRatio * dataDeclaredBytes > par2DeclaredBytes + hiddenRecoveryAllowance;
    }

    stageControl.start();

    try {
        if (await probeShowsUnrecoverable()) {
            unrecoverable = true;
            failureKinds.add("article-not-found");
            stageControl.markTerminal();
        } else {
            await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
        }
    } finally {
        stageControl.stop();

        for (const state of fileStates) {
            await state.handle?.close().catch(() => undefined);
        }
    }

    if (fatalError) {
        throw fatalError;
    }

    function hasCompleteCoverage(state: FileAssemblyState) {
        if (state.expectedFileSize === null || state.ranges.length === 0) {
            return false;
        }

        const sorted = [...state.ranges].sort((left, right) => left.begin - right.begin);
        let expectedBegin = 1;

        for (const range of sorted) {
            if (range.begin !== expectedBegin) {
                return false;
            }

            expectedBegin = range.end + 1;
        }

        return expectedBegin === state.expectedFileSize + 1;
    }

    const files: DownloadedNzbFile[] = fileStates.map((state) => ({
        fileIndex: state.fileIndex,
        subject: state.subject,
        fileName: state.fileName,
        filePath: state.filePath,
        totalSegments: state.totalSegments,
        completedSegments: state.completedSegments,
        failedSegments: state.failedSegments,
        bytesWritten: state.bytesWritten,
        ok:
            state.failedSegments === 0 &&
            state.completedSegments === state.totalSegments &&
            hasCompleteCoverage(state),
    }));

    return {
        files,
        downloadedBytes: totals.downloadedBytes,
        completedSegments: totals.completedSegments,
        failedSegments: totals.failedSegments,
        totalSegments: tasks.length,
        aborted: stageControl.stopped,
        deadlineExceeded: stageControl.deadlineExceeded,
        unrecoverable,
        transportExhausted,
        failureKinds: [...failureKinds],
        ok: !stageControl.stopped && !transportExhausted && files.every((file) => file.ok),
    };
}
