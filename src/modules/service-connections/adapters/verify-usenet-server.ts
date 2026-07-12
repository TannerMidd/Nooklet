import { NntpClient } from "@/modules/download-engine/nntp/nntp-client";
import {
  parseUsenetCredentials,
  parseUsenetServerUrl,
  UsenetServerConfigError,
} from "@/modules/download-engine/config/resolve-usenet-server";

import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";

/**
 * Verifies a usenet server by dialing it: TCP/TLS connect, AUTHINFO when
 * credentials are present, and a DATE round-trip.
 */
export async function verifyUsenetServer(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  let client: NntpClient | null = null;

  try {
    const server = parseUsenetServerUrl(input.baseUrl);
    const credentials = parseUsenetCredentials(input.secret);

    client = new NntpClient({
      host: server.host,
      port: server.port,
      tls: server.tls,
      username: credentials.username,
      password: credentials.password,
      timeoutMs: SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    });

    await client.connect();
    await client.date();
    await client.quit();

    return {
      ok: true,
      message: `Connected to ${server.host}:${server.port} (${server.tls ? "TLS" : "plaintext"}, ${server.connections} connections)${credentials.username ? " and authenticated" : ""}.`,
      metadata: {
        host: server.host,
        port: server.port,
        tls: server.tls,
        connections: server.connections,
        authenticated: Boolean(credentials.username),
      },
    };
  } catch (error) {
    client?.destroy();

    if (error instanceof UsenetServerConfigError) {
      return { ok: false, message: error.message };
    }

    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Connection verification failed unexpectedly.",
    };
  }
}
