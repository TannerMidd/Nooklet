import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { indexers, users } from "@/lib/database/schema";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import { addIndexerCommand } from "@/modules/indexers/commands/add-indexer";
import { createIndexer } from "@/modules/indexers/repositories/indexer-repository";

import { listIndexerSettings } from "./list-indexer-settings";

async function seedUser() {
    const database = ensureDatabaseReady();
    const userId = randomUUID();

    database
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@test.local`,
            displayName: "test",
            passwordHash: "x",
            role: "user",
        })
        .run();

    return userId;
}

beforeEach(() => {
    ensureDatabaseReady();
});

describe("listIndexerSettings", () => {
    it("returns instance-scoped indexer settings without encrypted secrets", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser();

        await addIndexerCommand(userId, {
            name: "Main indexer",
            protocol: "newznab",
            baseUrl: "https://api.example.test",
            apiPath: "/api",
            apiKey: "main-secret",
            isEnabled: true,
            priority: 1,
            categories: [
                { mediaType: "movie", categoryId: "2000", label: "Movies" },
                { mediaType: "tv", categoryId: "5000", label: "TV" },
            ],
        });
        await addIndexerCommand(otherUserId, {
            name: "Other user indexer",
            protocol: "newznab",
            baseUrl: "https://other.example.test",
            apiPath: "/api",
            apiKey: "other-secret",
            isEnabled: true,
            priority: 0,
            categories: [{ mediaType: "movie", categoryId: "2000", label: "Movies" }],
        });

        const settings = await listIndexerSettings(userId);

        expect(settings).toHaveLength(2);
        expect(settings.find((setting) => setting.name === "Main indexer")).toMatchObject({
            name: "Main indexer",
            maskedApiKey: "ma*******et",
            categories: [
                { mediaType: "movie", categoryId: "2000", label: "Movies" },
                { mediaType: "tv", categoryId: "5000", label: "TV" },
            ],
        });
        expect(JSON.stringify(settings)).not.toContain("main-secret");
        expect(JSON.stringify(settings)).not.toContain("other-secret");
    });

    it("redacts legacy credential URLs and status messages in the settings projection", async () => {
        const userId = await seedUser();
        const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
        const indexer = await createIndexer({
            userId: ownerUserId,
            name: "Legacy indexer",
            protocol: "newznab",
            baseUrl: "https://indexer.example.test",
            status: "verified",
        });
        const database = ensureDatabaseReady();

        const cleanSetting = (await listIndexerSettings(userId)).find(
            (entry) => entry.id === indexer!.id,
        );

        expect(cleanSetting).toMatchObject({
            baseUrl: "https://indexer.example.test",
            hasEmbeddedCredentials: false,
            status: "verified",
            statusMessage: null,
        });

        database
            .update(indexers)
            .set({
                baseUrl: "https://legacy-user:legacy-secret@indexer.example.test/api?apiKey=secret",
                statusMessage:
                    "Indexer redirected to https://indexer.example.test/api?apiKey=secret",
            })
            .where(eq(indexers.id, indexer!.id))
            .run();

        const setting = (await listIndexerSettings(userId)).find(
            (entry) => entry.id === indexer!.id,
        );

        expect(setting).toMatchObject({
            baseUrl: "https://indexer.example.test/api",
            hasEmbeddedCredentials: true,
            status: "error",
            statusMessage:
                "The saved base URL contains embedded credentials. Replace it before enabling or testing.",
        });
        expect(JSON.stringify(setting)).not.toContain("legacy-secret");
        expect(JSON.stringify(setting)).not.toContain("apiKey=secret");
    });

    it("marks an invalid formerly verified URL as unsafe", async () => {
        const userId = await seedUser();
        const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
        const indexer = await createIndexer({
            userId: ownerUserId,
            name: "Invalid legacy indexer",
            protocol: "newznab",
            baseUrl: "https://indexer.example.test",
            status: "verified",
        });
        const database = ensureDatabaseReady();

        database
            .update(indexers)
            .set({
                baseUrl: "",
                statusMessage: "Connected",
            })
            .where(eq(indexers.id, indexer!.id))
            .run();

        const setting = (await listIndexerSettings(userId)).find(
            (entry) => entry.id === indexer!.id,
        );

        expect(setting).toMatchObject({
            baseUrl: "[REDACTED URL]",
            hasEmbeddedCredentials: true,
            status: "error",
            statusMessage: "The saved base URL is invalid. Replace it before enabling or testing.",
        });
    });

    it("keeps disabled indexers disabled while exposing unsafe URL repair guidance", async () => {
        const userId = await seedUser();
        const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
        const indexer = await createIndexer({
            userId: ownerUserId,
            name: "Disabled legacy indexer",
            protocol: "newznab",
            baseUrl: "https://indexer.example.test",
            status: "disabled",
        });
        const database = ensureDatabaseReady();

        database
            .update(indexers)
            .set({
                baseUrl: "https://legacy-user:legacy-secret@indexer.example.test/api",
                statusMessage: "Connected",
            })
            .where(eq(indexers.id, indexer!.id))
            .run();

        const setting = (await listIndexerSettings(userId)).find(
            (entry) => entry.id === indexer!.id,
        );

        expect(setting).toMatchObject({
            baseUrl: "https://indexer.example.test/api",
            hasEmbeddedCredentials: true,
            status: "disabled",
            statusMessage:
                "The saved base URL contains embedded credentials. Replace it before enabling or testing.",
        });
    });
});
