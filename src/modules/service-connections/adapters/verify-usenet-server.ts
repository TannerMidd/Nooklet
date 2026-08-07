import { NntpClient } from "@/modules/download-engine/nntp/nntp-client";
import { assertOutboundHostAllowed } from "@/lib/security/safe-fetch";
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
 * Verifies a usenet server by dialing it: TLS connect (the only transport the
 * engine speaks), AUTHINFO when credentials are present, and a DATE round-trip.
 */
export async function verifyUsenetServer(
    input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
    let client: NntpClient | null = null;

    try {
        const server = parseUsenetServerUrl(input.baseUrl);
        const credentials = parseUsenetCredentials(input.secret);
        const resolvedAddresses = await assertOutboundHostAllowed(server.host);

        client = new NntpClient({
            host: server.host,
            port: server.port,
            username: credentials.username,
            password: credentials.password,
            timeoutMs: SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
            resolvedAddresses,
        });

        await client.connect();
        await client.date();
        await client.quit();

        return {
            ok: true,
            message: `Connected to ${server.host}:${server.port} (TLS, ${server.connections} connections)${credentials.username ? " and authenticated" : ""}.`,
            metadata: {
                host: server.host,
                port: server.port,
                tls: true,
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
                error instanceof Error
                    ? error.message
                    : "Connection verification failed unexpectedly.",
        };
    }
}
