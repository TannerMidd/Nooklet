import tls from "node:tls";

import {
  tlsTestCertificate,
  tlsTestPrivateKey,
} from "@/modules/download-engine/testing/tls-test-certificate";

/**
 * Scripted in-process NNTP server for engine tests. Speaks just enough of the
 * protocol to exercise the client and scheduler: greeting, AUTHINFO, BODY and
 * STAT by message-id, DATE, QUIT. Articles are served from a map; unknown ids
 * get 430.
 * Listens over TLS with the shared test certificate, matching the TLS-only
 * production client.
 */

export type FakeNntpServerOptions = {
  /** Message-id (no brackets) → raw article body (without the terminator). */
  articles: Map<string, Buffer | string>;
  /** When set, AUTHINFO must present these credentials before BODY works. */
  credentials?: { username: string; password: string };
  /** Send body bytes in small chunks to exercise client buffering. */
  chunkSize?: number;
};

export type FakeNntpServer = {
  port: number;
  connectionCount: () => number;
  close: () => Promise<void>;
};

export async function startFakeNntpServer(options: FakeNntpServerOptions): Promise<FakeNntpServer> {
  let connections = 0;

  const server = tls.createServer(
    { cert: tlsTestCertificate, key: tlsTestPrivateKey },
    (socket) => {
    connections += 1;
    let authenticatedUser: string | null = null;
    let pendingUser: string | null = null;
    let lineBuffer = "";

    const send = (text: string) => {
      socket.write(`${text}\r\n`, "latin1");
    };

    const sendBody = (body: Buffer) => {
      const chunkSize = options.chunkSize ?? (body.length || 1);
      const payload = Buffer.concat([body, Buffer.from("\r\n.\r\n", "latin1")]);

      for (let offset = 0; offset < payload.length; offset += chunkSize) {
        socket.write(payload.subarray(offset, Math.min(offset + chunkSize, payload.length)));
      }
    };

    send("200 fake-nntp ready");

    socket.on("data", (chunk) => {
      lineBuffer += chunk.toString("latin1");

      for (;;) {
        const lineEnd = lineBuffer.indexOf("\r\n");

        if (lineEnd === -1) {
          return;
        }

        const line = lineBuffer.slice(0, lineEnd);
        lineBuffer = lineBuffer.slice(lineEnd + 2);
        const [command, ...rest] = line.split(" ");

        switch (command.toUpperCase()) {
          case "AUTHINFO": {
            const kind = rest[0]?.toUpperCase();
            const value = rest.slice(1).join(" ");

            if (kind === "USER") {
              pendingUser = value;
              send("381 password required");
            } else if (kind === "PASS") {
              if (
                options.credentials &&
                pendingUser === options.credentials.username &&
                value === options.credentials.password
              ) {
                authenticatedUser = pendingUser;
                send("281 authenticated");
              } else {
                send("481 authentication failed");
              }
            } else {
              send("501 syntax error");
            }
            break;
          }
          case "BODY": {
            if (options.credentials && !authenticatedUser) {
              send("480 authentication required");
              break;
            }

            const messageId = rest.join(" ").replace(/^<|>$/g, "");
            const article = options.articles.get(messageId);

            if (article === undefined) {
              send("430 no such article");
              break;
            }

            send(`222 0 <${messageId}> body`);
            sendBody(Buffer.isBuffer(article) ? article : Buffer.from(article, "latin1"));
            break;
          }
          case "STAT": {
            if (options.credentials && !authenticatedUser) {
              send("480 authentication required");
              break;
            }

            const messageId = rest.join(" ").replace(/^<|>$/g, "");

            send(
              options.articles.has(messageId)
                ? `223 0 <${messageId}> article exists`
                : "430 no such article",
            );
            break;
          }
          case "DATE": {
            send("111 20260711000000");
            break;
          }
          case "QUIT": {
            send("205 goodbye");
            socket.end();
            break;
          }
          default: {
            send("500 unknown command");
          }
        }
      }
    });
    },
  );

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Fake NNTP server failed to bind a port.");
  }

  return {
    port: address.port,
    connectionCount: () => connections,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
