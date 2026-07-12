import net from "node:net";
import tls from "node:tls";

/**
 * Minimal NNTP client for the built-in download engine (ADR-0002 slice 2).
 * One instance owns one server connection; the scheduler runs a pool of them.
 * Only the commands the engine needs are implemented: greeting, AUTHINFO,
 * BODY by message-id, DATE (used as a liveness/verify probe), and QUIT.
 */

export type NntpServerOptions = {
  host: string;
  port: number;
  tls: boolean;
  username?: string | null;
  password?: string | null;
  /** Per-operation timeout (connect, command round-trip). */
  timeoutMs?: number;
  /** Skip TLS certificate validation — off unless a user opts in. */
  allowInvalidCertificates?: boolean;
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

type StatusLine = {
  code: number;
  text: string;
};

export class NntpClient {
  private readonly options: NntpServerOptions;
  private socket: net.Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
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

  private handleData = (chunk: Buffer) => {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
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
      const lineEnd = this.buffer.indexOf(CRLF);

      if (lineEnd !== -1) {
        const line = this.buffer.subarray(0, lineEnd).toString("latin1");
        this.buffer = this.buffer.subarray(lineEnd + 2);
        const code = Number.parseInt(line.slice(0, 3), 10);

        if (!Number.isInteger(code)) {
          throw new NntpError("protocol-error", `Malformed NNTP status line: ${line.slice(0, 80)}`);
        }

        return { code, text: line.slice(4) };
      }

      await this.waitForData();
    }
  }

  /**
   * Reads a multiline data block up to the `CRLF.CRLF` terminator and returns
   * it verbatim (dot-stuffing intact — the yEnc decoder undoes it per line).
   */
  private async readMultilineBlock(): Promise<Buffer> {
    for (;;) {
      // The terminator can also be the very start of the block (empty body):
      // check a window that includes a synthetic leading CRLF.
      if (this.buffer.length >= 3) {
        if (this.buffer[0] === 0x2e && this.buffer[1] === 0x0d && this.buffer[2] === 0x0a) {
          this.buffer = this.buffer.subarray(3);
          return Buffer.alloc(0);
        }

        const terminatorIndex = this.buffer.indexOf(MULTILINE_TERMINATOR);

        if (terminatorIndex !== -1) {
          const block = this.buffer.subarray(0, terminatorIndex);
          this.buffer = this.buffer.subarray(terminatorIndex + MULTILINE_TERMINATOR.length);
          return Buffer.from(block);
        }
      }

      await this.waitForData();
    }
  }

  private async sendCommand(command: string) {
    if (!this.socket || this.closed) {
      throw new NntpError("connection-closed", "The NNTP connection is closed.");
    }

    this.socket.write(`${command}\r\n`, "latin1");
  }

  async connect(): Promise<void> {
    if (this.socket) {
      throw new NntpError("protocol-error", "The NNTP client is already connected.");
    }

    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const timer = setTimeout(() => {
        candidate.destroy();
        reject(new NntpError("timeout", `Timed out connecting to ${this.options.host}:${this.options.port}.`));
      }, this.timeoutMs());

      const onError = (error: Error) => {
        clearTimeout(timer);
        reject(new NntpError("connect-failed", `Could not connect to ${this.options.host}:${this.options.port}: ${error.message}`));
      };

      const candidate = this.options.tls
        ? tls.connect(
            {
              host: this.options.host,
              port: this.options.port,
              servername: this.options.host,
              rejectUnauthorized: !this.options.allowInvalidCertificates,
            },
            () => {
              clearTimeout(timer);
              candidate.off("error", onError);
              resolve(candidate);
            },
          )
        : net.connect({ host: this.options.host, port: this.options.port }, () => {
            clearTimeout(timer);
            candidate.off("error", onError);
            resolve(candidate);
          });

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
  }
}
