import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/security/secret-box")>();

    return {
        ...actual,
        decryptSecretWithMetadata: vi.fn(actual.decryptSecretWithMetadata),
    };
});

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    instanceConfiguration,
    serviceConnections,
    serviceSecrets,
    users,
} from "@/lib/database/schema";
import { decryptSecretWithMetadata } from "@/lib/security/secret-box";

import { listConnectionSummaries } from "./list-connection-summaries";

const decryptMock = vi.mocked(decryptSecretWithMetadata);

function seedUserWithConnection(serviceType: "trakt" | "plex", maskedValue: string) {
    const database = ensureDatabaseReady();
    const userId = randomUUID();
    const connectionId = randomUUID();

    database
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@summary.test`,
            displayName: "Summary user",
            passwordHash: "x",
            role: "user",
        })
        .run();
    database
        .insert(serviceConnections)
        .values({
            id: connectionId,
            serviceType,
            ownershipScope: "shared",
            ownerUserId: userId,
            displayName: serviceType.toUpperCase(),
            baseUrl: `https://${serviceType}.example.com`,
            status: "verified",
            statusMessage: "Connected",
        })
        .run();
    database
        .insert(serviceSecrets)
        .values({
            connectionId,
            // Deliberately invalid ciphertext: a summary must never read or rotate it.
            encryptedValue: `invalid-ciphertext-${connectionId}`,
            maskedValue,
        })
        .run();

    return userId;
}

describe("listConnectionSummaries", () => {
    beforeEach(() => {
        ensureDatabaseReady();
        decryptMock.mockClear();
    });

    it("loads only the requested user's masked projection without decrypting any secret", async () => {
        const userId = seedUserWithConnection("trakt", "trakt-requester-••••");

        seedUserWithConnection("trakt", "trakt-other-user-••••");

        const summaries = await listConnectionSummaries(userId);

        expect(summaries.find((summary) => summary.serviceType === "trakt")).toMatchObject({
            baseUrl: "https://trakt.example.com",
            hasEmbeddedCredentials: false,
            status: "verified",
            statusMessage: "Connected",
            maskedSecret: "trakt-requester-••••",
        });
        expect(decryptMock).not.toHaveBeenCalled();
    });

    it("redacts a legacy credential URL and status error in the shared projection", async () => {
        const userId = seedUserWithConnection("trakt", "trakt-requester-••••");
        const database = ensureDatabaseReady();

        database
            .update(serviceConnections)
            .set({
                baseUrl: "https://legacy-user:legacy-secret@trakt.example.com/api?token=secret",
                statusMessage: "Provider redirected to https://trakt.example.com/api?token=secret",
            })
            .where(eq(serviceConnections.ownerUserId, userId))
            .run();

        const summary = (await listConnectionSummaries(userId)).find(
            (entry) => entry.serviceType === "trakt",
        );

        expect(summary).toMatchObject({
            baseUrl: "https://trakt.example.com/api",
            hasEmbeddedCredentials: true,
            status: "error",
            statusMessage:
                "The saved base URL contains embedded credentials. Replace it before verifying.",
        });
        expect(JSON.stringify(summary)).not.toContain("legacy-secret");
        expect(JSON.stringify(summary)).not.toContain("token=secret");
    });

    it("redacts legacy Plex query tokens and marks the connection for repair without decrypting", async () => {
        const userId = seedUserWithConnection("plex", "plex-requester-••••");
        const viewerId = seedUserWithConnection("trakt", "viewer-trakt-••••");

        ensureDatabaseReady()
            .insert(instanceConfiguration)
            .values({ id: "default", ownerUserId: userId })
            .onConflictDoUpdate({ target: instanceConfiguration.id, set: { ownerUserId: userId } })
            .run();
        ensureDatabaseReady()
            .update(serviceConnections)
            .set({
                baseUrl:
                    "https://plex.example.com/?X-Plex-Token=synthetic-plex-secret&X-Plex-Product=Nooklet",
            })
            .where(eq(serviceConnections.ownerUserId, userId))
            .run();

        const summary = (await listConnectionSummaries(viewerId)).find(
            (entry) => entry.serviceType === "plex",
        );

        expect(summary).toMatchObject({
            baseUrl: "https://plex.example.com/?X-Plex-Product=Nooklet",
            hasEmbeddedCredentials: true,
            status: "error",
            statusMessage:
                "The saved base URL contains embedded credentials. Replace it before verifying.",
            maskedSecret: "plex-requester-••••",
        });
        expect(JSON.stringify(summary)).not.toContain("synthetic-plex-secret");
        expect(decryptMock).not.toHaveBeenCalled();
    });

    it("marks an invalid legacy base URL as unsafe even when it was formerly verified", async () => {
        const userId = seedUserWithConnection("trakt", "trakt-requester-••••");
        const database = ensureDatabaseReady();

        database
            .update(serviceConnections)
            .set({
                baseUrl: "",
                statusMessage: "Connected",
            })
            .where(eq(serviceConnections.ownerUserId, userId))
            .run();

        const summary = (await listConnectionSummaries(userId)).find(
            (entry) => entry.serviceType === "trakt",
        );

        expect(summary).toMatchObject({
            baseUrl: "[REDACTED URL]",
            hasEmbeddedCredentials: true,
            status: "error",
            statusMessage: "The saved base URL is invalid. Replace it before verifying.",
        });
    });
});
