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
 * BODY by message-id, DATE (used as a liveness/verify probe), and QUIT.
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
  | "protocol-error"
  | "timeout"
  | "connection-closed";

export class NntpError extends Error {
  readonly kind: NntpErrorKind;
  /** Permanent errors (e.g. 430) must not be retried on the same server. */
  readonly permanent: boolean;

  constructor(kind: NntpErrorKind, message: string, permanent = false) {
    super(message);
    this.name = "NntpError";
    this.kind = kind;
    this.permanent = permanent;
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

type StatusLine = {
  code: number;
  text: string;
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
        this.consumeBuffer(lineEnd + 2);
        const code = Number.parseInt(line.slice(0, 3), 10);

        if (!Number.isInteger(code)) {
          throw new NntpError("protocol-error", `Malformed NNTP status line: ${line.slice(0, 80)}`);
        }

        return { code, text: line.slice(4) };
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
    if (this.socket) {
      throw new NntpError("protocol-error", "The NNTP client is already connected.");
    }

    // Resolve under the SSRF policy once, then force the socket to use only
    // those addresses. Keeping the original host below preserves TLS SNI and
    // certificate validation while closing the DNS-rebinding window.
    const resolvedAddresses =
      this.options.resolvedAddresses
      ?? await assertOutboundHostAllowed(this.options.host);
    const pinnedLookup = createPinnedLookup(resolvedAddresses);

    const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const timer = setTimeout(() => {
        candidate.destroy();
        reject(new NntpError("timeout", `Timed out connecting to ${this.options.host}:${this.options.port}.`));
      }, this.timeoutMs());

      const onError = (error: Error) => {
        clearTimeout(timer);
        reject(new NntpError("connect-failed", `Could not connect to ${this.options.host}:${this.options.port}: ${error.message}`));
      };

      const candidate = tls.connect(
        {
          host: this.options.host,
          port: this.options.port,
          // RFC 6066 forbids IP literals in SNI; for IP hosts the certificate
          // is still verified against its IP subjectAltName entries.
          servername: net.isIP(this.options.host) === 0 ? this.options.host : undefined,
          rejectUnauthorized: true,
          ca: this.options.trustedRootCertificates
            ? [...this.options.trustedRootCertificates]
            : undefined,
          lookup: pinnedLookup,
        },
        () => {
          clearTimeout(timer);
          candidate.off("error", onError);
          resolve(candidate);
        },
      );

      candidate.once("error", onError);
    });

    socket.on("data", this.handleData);
    socket.on("error", (error) => this.handleCloseOrError(
      new NntpError("connection-closed", `NNTP connection error: ${error.message}`),
    ));
    socket.on("close", () => this.handleCloseOrError());
    this.socket = socket;
    this.closed = false;

    const greeting = await this.readStatusLine();

    if (greeting.code !== 200 && greeting.code !== 201) {
      this.destroy();
      throw new NntpError("protocol-error", `Unexpected NNTP greeting: ${greeting.code} ${greeting.text}`);
    }

    if (this.options.username) {
      await this.authenticate();
    }
  }

  private async authenticate() {
    await this.sendCommand(`AUTHINFO USER ${this.options.username}`);
    let response = await this.readStatusLine();

    if (response.code === 381) {
      await this.sendCommand(`AUTHINFO PASS ${this.options.password ?? ""}`);
      response = await this.readStatusLine();
    }

    if (response.code !== 281) {
      this.destroy();
      throw new NntpError(
        "auth-failed",
        `NNTP authentication failed: ${response.code} ${response.text}`,
        true,
      );
    }
  }

  /**
   * Fetches an article body by message-id. Returns the raw multiline block.
   * 430/423/420 are permanent "not on this server" outcomes.
   */
  async body(messageId: string): Promise<Buffer> {
    if (
      messageId.length === 0
      || messageId.length > 998
      || !/^[\x21-\x3b\x3d\x3f-\x7e]+$/.test(messageId)
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

    throw new NntpError(
      "protocol-error",
      `BODY <${messageId}> failed: ${response.code} ${response.text}`,
    );
  }

  /** Round-trip probe used by connection verification. */
  async date(): Promise<string> {
    await this.sendCommand("DATE");
    const response = await this.readStatusLine();

    if (response.code !== 111) {
      throw new NntpError("protocol-error", `DATE failed: ${response.code} ${response.text}`);
    }

    return response.text.trim();
  }

  async quit(): Promise<void> {
    if (!this.socket || this.closed) {
      return;
    }

    try {
      await this.sendCommand("QUIT");
      await this.readStatusLine();
    } catch {
      // The goodbye is best-effort; the socket is being torn down regardless.
    } finally {
      this.destroy();
    }
  }

  destroy() {
    this.closed = true;
    this.socket?.destroy();
    this.socket = null;
    this.buffer = Buffer.allocUnsafe(initialReadBufferBytes);
    this.bufferStart = 0;
    this.bufferEnd = 0;
  }
}
