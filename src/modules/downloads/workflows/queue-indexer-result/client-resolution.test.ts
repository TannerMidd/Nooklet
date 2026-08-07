import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import { saveServiceConnection } from "@/modules/service-connections/repositories/service-connection-repository";

import { resolveDownloadClient } from "./client-resolution";

function seedUser(role: "admin" | "user") {
    const id = randomUUID();

    ensureDatabaseReady()
        .insert(users)
        .values({
            id,
            email: `${id}@download-client.test`,
            displayName: role,
            passwordHash: "test-hash",
            role,
        })
        .run();

    return id;
}

describe("resolveDownloadClient", () => {
    it("creates one native client per user for a shared Usenet connection", async () => {
        const adminUserId = seedUser("admin");
        const regularUserId = seedUser("user");
        const concurrentUserId = seedUser("user");
        const ownerUserId = await resolveInstanceConfigurationOwnerId(adminUserId);
        const connection = await saveServiceConnection({
            userId: ownerUserId,
            serviceType: "usenet-server",
            displayName: "Usenet server",
            baseUrl: "nntps://news.example.test:563",
            status: "verified",
            statusMessage: "Connected for the instance.",
            metadata: null,
        });

        expect(connection).not.toBeNull();

        if (!connection) {
            throw new Error("The shared Usenet connection was not created.");
        }

        const ownerClient = await resolveDownloadClient(ownerUserId);
        const regularUserClient = await resolveDownloadClient(regularUserId);
        const [firstConcurrentClient, secondConcurrentClient] = await Promise.all([
            resolveDownloadClient(concurrentUserId),
            resolveDownloadClient(concurrentUserId),
        ]);

        expect(ownerClient.client).toMatchObject({
            userId: ownerUserId,
            serviceConnectionId: connection.connection.id,
            clientType: "nooklet",
        });
        expect(regularUserClient.client).toMatchObject({
            userId: regularUserId,
            serviceConnectionId: connection.connection.id,
            clientType: "nooklet",
        });
        expect(regularUserClient.client.id).not.toBe(ownerClient.client.id);
        expect(firstConcurrentClient.client).toMatchObject({
            userId: concurrentUserId,
            serviceConnectionId: connection.connection.id,
            clientType: "nooklet",
        });
        expect(secondConcurrentClient.client.id).toBe(firstConcurrentClient.client.id);
    });
});
