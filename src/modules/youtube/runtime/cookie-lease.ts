import "server-only";

import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { instanceConfiguration, serviceConnections, serviceSecrets } from "@/lib/database/schema";
import { decryptSecret } from "@/lib/security/secret-box";
import type { YtDlpCookieLease } from "@/modules/youtube/adapters/yt-dlp";

const singletonConfigurationId = "default";

export async function createYouTubeCookieLeaseFromText(
    cookiesText: string,
): Promise<YtDlpCookieLease> {
    const directory = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-auth-"));
    const cookiePath = path.join(directory, "cookies.txt");

    try {
        await writeFile(cookiePath, cookiesText, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch (error) {
        await rm(directory, { recursive: true, force: true });

        throw error;
    }

    let released = false;

    return {
        path: cookiePath,
        async release() {
            if (released) {
                return;
            }

            released = true;
            await rm(directory, { recursive: true, force: true });
        },
    };
}

export function readVerifiedYouTubeCookieText() {
    const database = ensureDatabaseReady();
    const owner = database
        .select({ ownerUserId: instanceConfiguration.ownerUserId })
        .from(instanceConfiguration)
        .where(eq(instanceConfiguration.id, singletonConfigurationId))
        .get();

    if (!owner) {
        return null;
    }

    const record = database
        .select({
            status: serviceConnections.status,
            encryptedValue: serviceSecrets.encryptedValue,
        })
        .from(serviceConnections)
        .innerJoin(serviceSecrets, eq(serviceSecrets.connectionId, serviceConnections.id))
        .where(
            and(
                eq(serviceConnections.ownerUserId, owner.ownerUserId),
                eq(serviceConnections.serviceType, "youtube"),
            ),
        )
        .get();

    if (!record || record.status !== "verified") {
        return null;
    }

    return decryptSecret(record.encryptedValue);
}

export async function createConfiguredYouTubeCookieLease() {
    const cookiesText = readVerifiedYouTubeCookieText();

    return cookiesText ? createYouTubeCookieLeaseFromText(cookiesText) : null;
}
