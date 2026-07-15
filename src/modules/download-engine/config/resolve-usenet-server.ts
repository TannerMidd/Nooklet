import { decryptSecret } from "@/lib/security/secret-box";
import { assertOutboundHostAllowed } from "@/lib/security/safe-fetch";
import { type EngineServerConfig } from "@/modules/download-engine/scheduler/download-nzb";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

/**
 * The usenet server is stored as a service connection:
 * - base URL `nntps://news.example.com:563` (or `nntp://` for plaintext),
 *   with an optional `?connections=N` to size the pool, and
 * - the secret `username::password` (double-colon separator, matching the
 *   Trakt convention; a single `:` also works when the username has none).
 */

export class UsenetServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsenetServerConfigError";
  }
}

const defaultConnections = 8;
const maxConnections = 20;

export function parseUsenetServerUrl(rawUrl: string): {
  host: string;
  port: number;
  tls: boolean;
  connections: number;
} {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new UsenetServerConfigError(
      "Enter the news server as nntps://host:port (TLS) or nntp://host:port.",
    );
  }

  if (url.protocol !== "nntps:" && url.protocol !== "nntp:") {
    throw new UsenetServerConfigError(
      "The news server URL must start with nntps:// (TLS) or nntp://.",
    );
  }

  if (!url.hostname) {
    throw new UsenetServerConfigError("The news server URL is missing a host name.");
  }

  if (url.username || url.password || url.hash) {
    throw new UsenetServerConfigError(
      "Put credentials in the credential field and remove URL credentials or fragments.",
    );
  }

  const tls = url.protocol === "nntps:";
  const port = url.port ? Number.parseInt(url.port, 10) : tls ? 563 : 119;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UsenetServerConfigError("The news server port is invalid.");
  }

  const rawConnections = url.searchParams.get("connections");
  const parsedConnections = rawConnections ? Number.parseInt(rawConnections, 10) : defaultConnections;
  const connections = Number.isInteger(parsedConnections)
    ? Math.min(Math.max(parsedConnections, 1), maxConnections)
    : defaultConnections;

  return { host: url.hostname, port, tls, connections };
}

export function parseUsenetCredentials(secret: string): {
  username: string | null;
  password: string | null;
} {
  const trimmed = secret.trim();

  if (/[\r\n]/.test(secret)) {
    throw new UsenetServerConfigError("Usenet credentials must be a single line.");
  }

  if (!trimmed) {
    return { username: null, password: null };
  }

  const doubleColon = trimmed.indexOf("::");

  if (doubleColon !== -1) {
    return {
      username: trimmed.slice(0, doubleColon) || null,
      password: trimmed.slice(doubleColon + 2) || null,
    };
  }

  const singleColon = trimmed.indexOf(":");

  if (singleColon !== -1) {
    return {
      username: trimmed.slice(0, singleColon) || null,
      password: trimmed.slice(singleColon + 1) || null,
    };
  }

  return { username: trimmed, password: null };
}

export type ResolvedUsenetServer = {
  connectionId: string;
  status: "configured" | "verified" | "error";
  server: EngineServerConfig;
};

/** Loads the user's usenet server as a ready-to-dial engine server config. */
export async function resolveUsenetServer(userId: string): Promise<ResolvedUsenetServer | null> {
  const connection = await findServiceConnectionByType(userId, "usenet-server");

  if (!connection?.connection.baseUrl) {
    return null;
  }

  const parsedUrl = parseUsenetServerUrl(connection.connection.baseUrl);
  const resolvedAddresses = await assertOutboundHostAllowed(parsedUrl.host);
  const credentials = connection.secret
    ? parseUsenetCredentials(decryptSecret(connection.secret.encryptedValue))
    : { username: null, password: null };

  return {
    connectionId: connection.connection.id,
    status: connection.connection.status,
    server: {
      ...parsedUrl,
      username: credentials.username,
      password: credentials.password,
      timeoutMs: 45_000,
      resolvedAddresses,
    },
  };
}
