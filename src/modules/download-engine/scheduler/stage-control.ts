/**
 * Controls the lifecycle of one download scheduler stage.
 *
 * The scheduler has two independent ways to stop: durable caller control and
 * its wall-clock budget.  Keeping that decision here makes the precedence
 * explicit and keeps live socket cancellation, timer overflow handling, and
 * best-effort cleanup from being repeated in every worker.
 */

export type DownloadStageStopReason = "caller" | "deadline";
export type DownloadStagePhase = "active" | "terminal" | "cleanup";

export type StageClient = {
    quit: () => Promise<void>;
    destroy: () => void;
};

export type DownloadStageControlOptions = {
    deadlineAt?: number;
    shouldAbort?: () => boolean;
    onCallerError?: (error: unknown) => void;
    expectedWorkers?: number;
    quitCleanupFallbackMs?: number;
};

/** Node's timer implementation treats larger delays as an immediate timer. */
export const maxNodeTimerDelayMs = 2_147_000_000;
export const defaultQuitCleanupFallbackMs = 1_000;

/** Schedules an absolute deadline without overflowing Node's timer range. */
export function scheduleAt(deadlineAt: number, callback: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let canceled = false;

    const tick = () => {
        timer = null;

        if (canceled) {
            return;
        }

        const remaining = deadlineAt - Date.now();

        if (remaining > 0) {
            timer = setTimeout(tick, Math.min(maxNodeTimerDelayMs, remaining));

            return;
        }

        callback();
    };

    timer = setTimeout(tick, Math.min(maxNodeTimerDelayMs, Math.max(0, deadlineAt - Date.now())));

    return () => {
        canceled = true;

        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
}

export class DownloadStageStopError extends Error {
    readonly reason: DownloadStageStopReason;

    constructor(reason: DownloadStageStopReason) {
        super(
            reason === "deadline"
                ? "The download stage deadline elapsed."
                : "The download stage was canceled by its caller.",
        );
        this.name = "DownloadStageStopError";
        this.reason = reason;
    }
}

export class DownloadStageControl {
    private readonly deadlineAt: number | undefined;
    private readonly shouldAbort: (() => boolean) | undefined;
    private readonly onCallerError: ((error: unknown) => void) | undefined;
    private readonly expectedWorkers: number;
    private readonly quitCleanupFallbackMs: number;
    private readonly liveClients = new Set<StageClient>();
    private phaseValue: DownloadStagePhase = "active";
    private stopReasonValue: DownloadStageStopReason | null = null;
    private deadlineWatchdog: (() => void) | null = null;
    private concludedWorkers = 0;

    constructor(options: DownloadStageControlOptions = {}) {
        this.deadlineAt = options.deadlineAt;
        this.shouldAbort = options.shouldAbort;
        this.onCallerError = options.onCallerError;
        this.expectedWorkers = Math.max(0, options.expectedWorkers ?? 0);
        this.quitCleanupFallbackMs = Math.max(
            0,
            options.quitCleanupFallbackMs ?? defaultQuitCleanupFallbackMs,
        );
    }

    get phase(): DownloadStagePhase {
        return this.phaseValue;
    }

    get stopReason(): DownloadStageStopReason | null {
        return this.stopReasonValue;
    }

    get stopped() {
        return this.stopReasonValue !== null;
    }

    get deadlineExceeded() {
        return this.stopReasonValue === "deadline";
    }

    get callerAborted() {
        return this.stopReasonValue === "caller";
    }

    /** Starts the watchdog. Calling start more than once is harmless. */
    start() {
        if (this.deadlineAt === undefined || this.deadlineWatchdog) {
            return;
        }

        const tick = () => {
            try {
                if (this.deadlineAt === undefined || Date.now() < this.deadlineAt) {
                    this.deadlineWatchdog = scheduleAt(this.deadlineAt!, tick);

                    return;
                }

                this.deadlineWatchdog = null;

                // Sample the caller fence first. A cancellation observed at the
                // exact deadline is still an explicit caller stop.
                this.pollCaller();

                if (!this.stopReasonValue && this.phaseValue === "active") {
                    this.requestStop("deadline");
                } else {
                    // A terminal/cleanup phase cannot be relabeled as a deadline
                    // overrun, but any live socket still needs to be destroyed.
                    this.destroyLiveClients();
                }
            } catch (error) {
                // Timer callbacks must not become unhandled exceptions. A caller
                // callback failure remains observable through the stage's fatal
                // error hook and is classified as caller cancellation.
                this.onCallerError?.(error);
                this.requestStop("caller");
            }
        };

        this.deadlineWatchdog = scheduleAt(this.deadlineAt, tick);
    }

    /** Stops the watchdog after all stage work and cleanup have settled. */
    stop() {
        if (this.deadlineWatchdog) {
            this.deadlineWatchdog();
            this.deadlineWatchdog = null;
        }
    }

    /** Polls caller cancellation, then the deadline, with caller precedence. */
    poll(): DownloadStageStopReason | null {
        if (this.stopReasonValue || this.phaseValue !== "active") {
            return this.stopReasonValue;
        }

        this.pollCaller();

        if (
            !this.stopReasonValue &&
            this.deadlineAt !== undefined &&
            Date.now() >= this.deadlineAt
        ) {
            this.requestStop("deadline");
        }

        return this.stopReasonValue;
    }

    /** Registers an in-flight NNTP client for watchdog destruction. */
    registerClient<T extends StageClient>(client: T): T {
        this.liveClients.add(client);

        return client;
    }

    unregisterClient(client: StageClient) {
        this.liveClients.delete(client);
    }

    /** Destroys all registered clients without allowing cleanup errors to mask a stop. */
    destroyLiveClients() {
        for (const client of this.liveClients) {
            this.destroyClient(client);
        }
    }

    /** Destroys and unregisters one client. */
    destroyClient(client: StageClient) {
        try {
            client.destroy();
        } catch {
            // Destroying an already-closed socket must never mask stage cleanup.
        } finally {
            this.unregisterClient(client);
        }
    }

    requestStop(reason: DownloadStageStopReason) {
        this.stopReasonValue ??= reason;
        this.destroyLiveClients();

        return this.stopReasonValue;
    }

    markTerminal() {
        this.phaseValue = "terminal";
    }

    /** Marks one worker complete and enters terminal phase after the last worker. */
    workerConcluded() {
        this.concludedWorkers += 1;

        if (this.expectedWorkers > 0 && this.concludedWorkers >= this.expectedWorkers) {
            this.markTerminal();
        }

        return this.phaseValue === "terminal";
    }

    /** Enters a protected cleanup phase that cannot be relabeled by the watchdog. */
    beginProtectedCleanup() {
        const previousPhase = this.phaseValue;

        if (this.phaseValue === "active") {
            this.phaseValue = "cleanup";
        }

        return () => {
            if (this.phaseValue === "cleanup") {
                this.phaseValue = previousPhase;
            }
        };
    }

    /** Races a possibly non-cooperative operation against the hard deadline. */
    async race<T>(operation: () => Promise<T>): Promise<T> {
        const existingStop = this.stopReasonValue;

        if (existingStop) {
            throw new DownloadStageStopError(existingStop);
        }

        // Poll before starting so a deadline that has already elapsed cannot
        // launch another socket operation.
        const polled = this.poll();

        if (polled) {
            throw new DownloadStageStopError(polled);
        }

        const attempt = Promise.resolve().then(() => {
            // A queued microtask can cross the deadline after the initial poll
            // but before the operation actually starts. Poll at invocation time
            // so no socket operation begins after the hard deadline.
            const invocationStop = this.poll();

            if (invocationStop) {
                throw new DownloadStageStopError(invocationStop);
            }

            return operation();
        });

        void attempt.catch(() => undefined);

        if (this.deadlineAt === undefined) {
            return attempt;
        }

        const remaining = this.deadlineAt - Date.now();

        if (remaining <= 0) {
            const reason = this.poll() ?? "deadline";

            this.requestStop(reason);

            throw new DownloadStageStopError(reason);
        }

        let cancelDeadline: () => void = () => undefined;
        const deadline = new Promise<never>((_resolve, reject) => {
            cancelDeadline = scheduleAt(this.deadlineAt!, () => {
                const reason = this.poll() ?? "deadline";

                this.requestStop(reason);
                reject(new DownloadStageStopError(reason));
            });
        });

        try {
            return await Promise.race([attempt, deadline]);
        } finally {
            cancelDeadline();
        }
    }

    /**
     * Sends bounded best-effort QUIT, then destroys the client if it does not
     * settle. Protected cleanup keeps completed/caller-canceled work distinct
     * from a deadline that happens to pass while QUIT is pending.
     */
    async disposeClient(client: StageClient, protectsStage = false) {
        const leaveCleanup = protectsStage ? this.beginProtectedCleanup() : () => undefined;

        try {
            const quitAttempt = Promise.resolve().then(() => client.quit());

            void quitAttempt.catch(() => undefined);

            const remaining =
                this.deadlineAt === undefined
                    ? this.quitCleanupFallbackMs
                    : Math.max(0, this.deadlineAt - Date.now());
            const cleanupBudget = Math.min(this.quitCleanupFallbackMs, remaining);

            if (cleanupBudget <= 0) {
                this.destroyClient(client);

                return;
            }

            let cancelTimeout: () => void = () => undefined;
            const timeout = new Promise<"timeout">((resolve) => {
                cancelTimeout = scheduleAt(Date.now() + cleanupBudget, () => resolve("timeout"));
            });
            const result = await Promise.race([
                quitAttempt.then(
                    () => "completed" as const,
                    () => "failed" as const,
                ),
                timeout,
            ]);

            cancelTimeout();

            if (result !== "completed") {
                this.destroyClient(client);
            }
        } finally {
            leaveCleanup();
            this.unregisterClient(client);
        }
    }

    private pollCaller() {
        if (!this.shouldAbort || this.stopReasonValue || this.phaseValue !== "active") {
            return false;
        }

        try {
            if (!this.shouldAbort()) {
                return false;
            }
        } catch (error) {
            this.onCallerError?.(error);
        }

        this.requestStop("caller");

        return true;
    }
}

export function createDownloadStageControl(options: DownloadStageControlOptions = {}) {
    return new DownloadStageControl(options);
}
