import net from "node:net";
import tls from "node:tls";

import {
    assertOutboundHostAllowed,
    createPinnedLookup,
    type ResolvedAddress,
} from "@/lib/security/safe-fetch";

/**
 * Minimal NNTP client for the built-in download engine (ADR-0002 slice 2).
 * One instance owns one server connection; the scheduler runs a pool of them.
 * Only the commands the engine needs are implemented: greeting, AUTHINFO,
 * BODY and STAT by message-id, DATE (used as a liveness/verify probe), and
 * QUIT.
 *
 * Every connection is TLS with certificate verification. There is no
 * plaintext mode: article bodies and AUTHINFO credentials must never be
 * readable on the wire.
 */

export type NntpServerOptions = {
    host: string;
    port: number;
    username?: string | null;
    password?: string | null;
    /** Per-operation timeout (connect, command round-trip). */
    timeoutMs?: number;
    /**
     * Replaces the trusted roots for this connection (private provider CAs,
     * tests). Certificate verification itself can never be turned off.
     */
    trustedRootCertificates?: readonly string[];
    /** Maximum raw bytes accepted for one article body. */
    maxArticleBytes?: number;
    /** DNS addresses vetted by the outbound-host policy and pinned for this run. */
    resolvedAddresses?: readonly ResolvedAddress[];
};

export type NntpErrorKind =
    | "connect-failed"
    | "auth-failed"
    | "article-not-found"
    /**
     * The server delivered the article, but its content could not be decoded or
     * does not belong to the file the NZB filed it under. Evidence about the
     * post, never about the connection — kept distinct from `protocol-error` so
     * a bad release can never be reported as a broken news server.
     */
    | "article-unusable"
    /** The server broke the protocol itself: unexpected status codes, bad framing. */
    | "protocol-error"
    /** A documented transient server-side failure response (400 or 403). */
    | "server-unavailable"
    | "timeout"
    | "connection-closed";

export class NntpError extends Error {
    readonly kind: NntpErrorKind;
    /** Permanent errors (e.g. protocol failures or 430) must not be retried. */
    readonly permanent: boolean;

    constructor(kind: NntpErrorKind, message: string, permanent = false) {
        super(message);
        this.name = "NntpError";
        this.kind = kind;
        this.permanent = permanent || kind === "protocol-error";
    }
}

const CRLF = Buffer.from("\r\n");
const MULTILINE_TERMINATOR = Buffer.from("\r\n.\r\n");
const defaultTimeoutMs = 30_000;

export const defaultMaxArticleBytes = 32 * 1024 * 1024;
const maxStatusLineBytes = 8 * 1024;
const maxCommandBytes = 4 * 1024;
const initialReadBufferBytes = 8 * 1024;
const retainedReadBufferBytes = 256 * 1024;
/** RFC 3977 generic responses that explicitly describe a temporary server fault. */
const transientServerResponseCodes = new Set([400, 403]);
/** RFC 3977/RFC 4643 responses that require authentication or privacy setup. */
const authenticationResponseCodes = new Set([480, 481, 482]);

type StatusLine = {
    code: number;
    text: string;
};

function responseError(command: string, response: StatusLine): NntpError {
    if (transientServerResponseCodes.has(response.code)) {
        return new NntpError(
            "server-unavailable",
            `${command} failed because the NNTP server is temporarily unavailable: ${response.code} ${response.text}`,
        );
    }

    if (authenticationResponseCodes.has(response.code)) {
        return new NntpError(
            "auth-failed",
            `${command} requires authentication: ${response.code} ${response.text}`,
            true,
        );
    }

    return new NntpError(
        "protocol-error",
        `${command} failed: ${response.code} ${response.text}`,
        true,
    );
}

type ConnectAttempt = {
    candidate: tls.TLSSocket | null;
    canceled: boolean;
    controller: AbortController;
    cancel: (error: Error) => void;
};

export class NntpClient {
    private readonly options: NntpServerOptions;
    private socket: tls.TLSSocket | null = null;
    // A sliding, exponentially grown buffer avoids Buffer.concat's quadratic
    // copying cost when a multi-megabyte article arrives in small TCP chunks.
    private buffer: Buffer = Buffer.allocUnsafe(initialReadBufferBytes);
    private bufferStart = 0;
    private bufferEnd = 0;
    private pendingRead: {
        resolve: () => void;
        reject: (error: Error) => void;
    } | null = null;
    private connectAttempt: ConnectAttempt | null = null;
    private closed = false;

    constructor(options: NntpServerOptions) {
        this.options = options;
    }

    get isConnected() {
        return this.socket !== null && !this.closed;
    }

    private timeoutMs() {
        return this.options.timeoutMs ?? defaultTimeoutMs;
    }

    private get bufferedLength() {
        return this.bufferEnd - this.bufferStart;
    }

    private bufferView() {
        return this.buffer.subarray(this.bufferStart, this.bufferEnd);
    }

    private appendToBuffer(chunk: Buffer) {
        const length = this.bufferedLength;

        if (this.buffer.length - this.bufferEnd < chunk.length) {
            if (length + chunk.length <= this.buffer.length) {
                this.buffer.copy(this.buffer, 0, this.bufferStart, this.bufferEnd);
            } else {
                let capacity = Math.max(this.buffer.length, initialReadBufferBytes);
                const required = length + chunk.length;

                while (capacity < required) {
                    capacity *= 2;
                }

                const grown = Buffer.allocUnsafe(capacity);

                this.buffer.copy(grown, 0, this.bufferStart, this.bufferEnd);
                this.buffer = grown;
            }

            this.bufferStart = 0;
            this.bufferEnd = length;
        }

        chunk.copy(this.buffer, this.bufferEnd);
        this.bufferEnd += chunk.length;
    }

    private consumeBuffer(bytes: number) {
        this.bufferStart += bytes;

        if (this.bufferStart !== this.bufferEnd) {
            return;
        }

        this.bufferStart = 0;
        this.bufferEnd = 0;

        if (this.buffer.length > retainedReadBufferBytes) {
            this.buffer = Buffer.allocUnsafe(initialReadBufferBytes);
        }
    }

    private handleData = (chunk: Buffer) => {
        if (this.closed) {
            return;
        }

        this.appendToBuffer(chunk);
        this.pendingRead?.resolve();
    };

    private handleCloseOrError = (error?: Error) => {
        this.closed = true;
        this.pendingRead?.reject(
            error ?? new NntpError("connection-closed", "The NNTP connection closed unexpectedly."),
        );
    };

    /** Waits until more data arrives or the per-operation timeout elapses. */
    private waitForData(): Promise<void> {
        if (this.closed) {
            return Promise.reject(
                new NntpError("connection-closed", "The NNTP connection is closed."),
            );
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRead = null;
                reject(new NntpError("timeout", "Timed out waiting for the NNTP server."));
            }, this.timeoutMs());

            this.pendingRead = {
                resolve: () => {
                    clearTimeout(timer);
                    this.pendingRead = null;
                    resolve();
                },
                reject: (error) => {
                    clearTimeout(timer);
                    this.pendingRead = null;
                    reject(error);
                },
            };
        });
    }

    private async readStatusLine(): Promise<StatusLine> {
        for (;;) {
            const buffered = this.bufferView();
            const lineEnd = buffered.indexOf(CRLF);

            if (lineEnd !== -1) {
                if (lineEnd > maxStatusLineBytes) {
                    this.destroy();

                    throw new NntpError(
                        "protocol-error",
                        "NNTP status line exceeded the safety limit.",
                        true,
                    );
                }

                const line = buffered.subarray(0, lineEnd).toString("latin1");

                // RFC 3977 permits a bare three-digit response as well as an
                // optional space and trailing comment. Do not parse a prefix
                // such as `430garbage` or `222x` as a valid response: the
                // stream is no longer trustworthy after malformed framing.
                const status = /^(\d{3})(?: (.*))?$/.exec(line);

                if (!status) {
                    this.destroy();

                    throw new NntpError(
                        "protocol-error",
                        `Malformed NNTP status line: ${line.slice(0, 80)}`,
                        true,
                    );
                }

                this.consumeBuffer(lineEnd + 2);

                const code = Number.parseInt(status[1], 10);

                return { code, text: status[2] ?? "" };
            }

            if (this.bufferedLength > maxStatusLineBytes) {
                this.destroy();

                throw new NntpError(
                    "protocol-error",
                    "NNTP status line exceeded the safety limit.",
                    true,
                );
            }

            await this.waitForData();
        }
    }

    /**
     * Reads a multiline data block up to the `CRLF.CRLF` terminator and returns
     * it verbatim (dot-stuffing intact — the yEnc decoder undoes it per line).
     */
    private async readMultilineBlock(): Promise<Buffer> {
        const maxBytes = this.options.maxArticleBytes ?? defaultMaxArticleBytes;

        for (;;) {
            const buffered = this.bufferView();

            // The terminator can also be the very start of the block (empty body):
            // check a window that includes a synthetic leading CRLF.
            if (buffered.length >= 3) {
                if (buffered[0] === 0x2e && buffered[1] === 0x0d && buffered[2] === 0x0a) {
                    this.consumeBuffer(3);

                    return Buffer.alloc(0);
                }

                const terminatorIndex = buffered.indexOf(MULTILINE_TERMINATOR);

                if (terminatorIndex !== -1) {
                    if (terminatorIndex > maxBytes) {
                        this.destroy();

                        throw new NntpError(
                            "protocol-error",
                            `NNTP article exceeded the ${maxBytes}-byte safety limit.`,
                            true,
                        );
                    }

                    const block = buffered.subarray(0, terminatorIndex);

                    this.consumeBuffer(terminatorIndex + MULTILINE_TERMINATOR.length);

                    return Buffer.from(block);
                }
            }

            if (this.bufferedLength > maxBytes + MULTILINE_TERMINATOR.length) {
                this.destroy();

                throw new NntpError(
                    "protocol-error",
                    `NNTP article exceeded the ${maxBytes}-byte safety limit.`,
                    true,
                );
            }

            await this.waitForData();
        }
    }

    private async sendCommand(command: string) {
        if (!this.socket || this.closed) {
            throw new NntpError("connection-closed", "The NNTP connection is closed.");
        }

        if (/[\r\n]/.test(command) || Buffer.byteLength(command, "utf8") > maxCommandBytes) {
            this.destroy();

            throw new NntpError("protocol-error", "Refused an invalid NNTP command.", true);
        }

        this.socket.write(`${command}\r\n`, "latin1");
    }

    async connect(): Promise<void> {
        if (this.socket || this.connectAttempt) {
            throw new NntpError("protocol-error", "The NNTP client is already connected.");
        }

        let rejectCancellation!: (error: Error) => void;
        const cancellation = new Promise<never>((_resolve, reject) => {
            rejectCancellation = reject;
        });
        const attempt: ConnectAttempt = {
            candidate: null,
            canceled: false,
            controller: new AbortController(),
            cancel: (error) => {
                if (attempt.canceled) {
                    return;
                }

                attempt.canceled = true;
                attempt.controller.abort();
                rejectCancellation(error);
                attempt.candidate?.destroy();
            },
        };

        this.connectAttempt = attempt;

        try {
            // Resolve under the SSRF policy once, then force the socket to use only
            // those addresses. Keeping the original host below preserves TLS SNI and
            // certificate validation while closing the DNS-rebinding window. Racing
            // resolution against cancellation makes destroy() effective before a TLS
            // candidate exists.
            const resolvedAddresses = await Promise.race([
                this.options.resolvedAddresses ??
                    assertOutboundHostAllowed(this.options.host, undefined, {
                        signal: attempt.controller.signal,
                    }),
                cancellation,
            ]);

            if (attempt.canceled) {
                throw new NntpError("connection-closed", "The NNTP connection was canceled.");
            }

            const pinnedLookup = createPinnedLookup(resolvedAddresses);

            const socket = await Promise.race([
                new Promise<tls.TLSSocket>((resolve, reject) => {
                    let settled = false;
                    let timer: ReturnType<typeof setTimeout> | null = null;

                    const onError = (error: Error) => {
                        if (settled) {
                            return;
                        }

                        settled = true;

                        if (timer) {
                            clearTimeout(timer);
                        }

                        candidate.destroy();
                        reject(
                            new NntpError(
                                "connect-failed",
                                `Could not connect to ${this.options.host}:${this.options.port}: ${error.message}`,
                            ),
                        );
                    };

                    const candidate = tls.connect(
                        {
                            host: this.options.host,
                            port: this.options.port,
                            // RFC 6066 forbids IP literals in SNI; for IP hosts the certificate
                            // is still verified against its IP subjectAltName entries.
                            servername:
                                net.isIP(this.options.host) === 0 ? this.options.host : undefined,
                            rejectUnauthorized: true,
                            ca: this.options.trustedRootCertificates
                                ? [...this.options.trustedRootCertificates]
                                : undefined,
                            lookup: pinnedLookup,
                        },
                        () => {
                            if (attempt.canceled) {
                                candidate.destroy();

                                return;
                            }

                            settled = true;

                            if (timer) {
                                clearTimeout(timer);
                            }

                            candidate.off("error", onError);
                            resolve(candidate);
                        },
                    );

                    attempt.candidate = candidate;

                    candidate.once("error", onError);
                    timer = setTimeout(() => {
                        if (settled) {
                            return;
                        }

                        settled = true;
                        candidate.destroy();
                        reject(
                            new NntpError(
                                "timeout",
                                `Timed out connecting to ${this.options.host}:${this.options.port}.`,
                            ),
                        );
                    }, this.timeoutMs());
                }),
                cancellation,
            ]);

            if (attempt.canceled) {
                socket.destroy();

                throw new NntpError("connection-closed", "The NNTP connection was canceled.");
            }

            socket.on("data", this.handleData);
            socket.on("error", (error) =>
                this.handleCloseOrError(
                    new NntpError("connection-closed", `NNTP connection error: ${error.message}`),
                ),
            );
            socket.on("close", () => this.handleCloseOrError());
            // The JS-level read timeout only fires around an active waitForData
            // round trip. A peer that vanishes behind a silent NAT drop otherwise
            // lingers as ESTABLISHED forever, so ask the OS to probe the connection.
            socket.setKeepAlive(true, 30_000);
            this.socket = socket;
            this.closed = false;
            this.connectAttempt = null;

            try {
                const greeting = await this.readStatusLine();

                if (greeting.code === 400) {
                    throw new NntpError(
                        "server-unavailable",
                        `NNTP service is temporarily unavailable: ${greeting.code} ${greeting.text}`,
                    );
                }

                if (greeting.code !== 200 && greeting.code !== 201) {
                    throw new NntpError(
                        "protocol-error",
                        `Unexpected NNTP greeting: ${greeting.code} ${greeting.text}`,
                        true,
                    );
                }

                if (this.options.username) {
                    await this.authenticate();
                }
            } catch (error) {
                this.destroy();

                throw error;
            }
        } finally {
            if (this.connectAttempt === attempt) {
                this.connectAttempt = null;
            }
        }
    }

    private async authenticate() {
        await this.sendCommand(`AUTHINFO USER ${this.options.username}`);
        let response = await this.readStatusLine();

        if (response.code === 381) {
            await this.sendCommand(`AUTHINFO PASS ${this.options.password ?? ""}`);
            response = await this.readStatusLine();
        }

        if (response.code === 281) {
            return;
        }

        this.destroy();

        if (transientServerResponseCodes.has(response.code)) {
            throw responseError("AUTHINFO", response);
        }

        throw new NntpError(
            authenticationResponseCodes.has(response.code) ? "auth-failed" : "protocol-error",
            `AUTHINFO failed: ${response.code} ${response.text}`,
            true,
        );
    }

    /**
     * Fetches an article body by message-id. Returns the raw multiline block.
     * 430/423/420 are permanent "not on this server" outcomes.
     */
    async body(messageId: string): Promise<Buffer> {
        if (
            messageId.length === 0 ||
            messageId.length > 998 ||
            !/^[\x21-\x3b\x3d\x3f-\x7e]+$/.test(messageId)
        ) {
            throw new NntpError("protocol-error", "Refused an invalid NNTP message id.", true);
        }

        await this.sendCommand(`BODY <${messageId}>`);
        const response = await this.readStatusLine();

        if (response.code === 222) {
            return this.readMultilineBlock();
        }

        if (response.code === 430 || response.code === 423 || response.code === 420) {
            throw new NntpError(
                "article-not-found",
                `Article <${messageId}> is not available on this server (${response.code}).`,
                true,
            );
        }

        throw responseError(`BODY <${messageId}>`, response);
    }

    /**
     * Checks article availability by message-id without transferring the body.
     * Returns false for the permanent "not on this server" responses.
     */
    async stat(messageId: string): Promise<boolean> {
        if (
            messageId.length === 0 ||
            messageId.length > 998 ||
            !/^[\x21-\x3b\x3d\x3f-\x7e]+$/.test(messageId)
        ) {
            throw new NntpError("protocol-error", "Refused an invalid NNTP message id.", true);
        }

        await this.sendCommand(`STAT <${messageId}>`);
        const response = await this.readStatusLine();

        if (response.code === 223) {
            return true;
        }

        if (response.code === 430 || response.code === 423 || response.code === 420) {
            return false;
        }

        throw responseError(`STAT <${messageId}>`, response);
    }

    /** Round-trip probe used by connection verification. */
    async date(): Promise<string> {
        await this.sendCommand("DATE");
        const response = await this.readStatusLine();

        if (response.code !== 111) {
            throw responseError("DATE", response);
        }

        return response.text.trim();
    }

    async quit(): Promise<void> {
        if (!this.socket || this.closed) {
            return;
        }

        const quitAttempt = (async () => {
            await this.sendCommand("QUIT");
            const response = await this.readStatusLine();

            if (response.code !== 205) {
                throw responseError("QUIT", response);
            }
        })();
        // A timeout or external destroy may leave the protocol attempt running
        // until the socket emits close. It is intentionally detached, but its
        // rejection must still be observed.

        void quitAttempt.catch(() => undefined);

        let timer: ReturnType<typeof setTimeout> | null = null;

        try {
            await Promise.race([
                quitAttempt,
                new Promise<void>((resolve) => {
                    timer = setTimeout(resolve, this.timeoutMs());
                }),
            ]);
        } catch {
            // The goodbye is best-effort; the socket is being torn down regardless.
        } finally {
            if (timer) {
                clearTimeout(timer);
            }

            this.destroy();
        }
    }

    destroy() {
        const cancellationError = new NntpError(
            "connection-closed",
            "The NNTP connection was destroyed.",
        );

        this.connectAttempt?.cancel(cancellationError);
        this.pendingRead?.reject(cancellationError);
        this.closed = true;

        const socket = this.socket;

        this.socket = null;
        socket?.destroy();
        this.buffer = Buffer.allocUnsafe(initialReadBufferBytes);
        this.bufferStart = 0;
        this.bufferEnd = 0;
    }
}
