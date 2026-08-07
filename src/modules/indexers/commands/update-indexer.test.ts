import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, indexerMediaCategories, indexerSecrets, users } from "@/lib/database/schema";
import { addIndexerCommand } from "./add-indexer";
import { updateIndexerCommand } from "./update-indexer";

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

describe("updateIndexerCommand", () => {
    it("updates configuration, categories, secret, and audit event", async () => {
        const userId = await seedUser();
        const indexer = await addIndexerCommand(userId, {
            name: "Old indexer",
            protocol: "newznab",
            baseUrl: "https://old.example.test",
            apiPath: "/api",
            apiKey: "old-secret",
            isEnabled: true,
            priority: 10,
            categories: [{ mediaType: "movie", categoryId: "2000", label: "Movies" }],
        });

        const updated = await updateIndexerCommand(userId, {
            id: indexer.id,
            name: "New indexer",
            protocol: "torznab",
            baseUrl: "https://new.example.test",
            apiPath: "/torznab",
            apiKey: "new-secret",
            isEnabled: false,
            priority: 5,
            categories: [{ mediaType: "tv", categoryId: "5000", label: "TV" }],
        });

        const secret = ensureDatabaseReady()
            .select()
            .from(indexerSecrets)
            .where(eq(indexerSecrets.indexerId, indexer.id))
            .get();
        const categories = ensureDatabaseReady()
            .select()
            .from(indexerMediaCategories)
            .where(eq(indexerMediaCategories.indexerId, indexer.id))
            .all();
        const events = ensureDatabaseReady()
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.subjectId, indexer.id))
            .all();

        expect(updated).toMatchObject({
            name: "New indexer",
            protocol: "torznab",
            baseUrl: "https://new.example.test",
            apiPath: "/torznab",
            status: "disabled",
            statusMessage: "Indexer disabled.",
            isEnabled: false,
            priority: 5,
        });
        expect(secret?.encryptedApiKey).not.toBe("new-secret");
        expect(secret?.maskedApiKey).toBe("ne******et");
        expect(categories).toMatchObject([{ mediaType: "tv", categoryId: "5000", label: "TV" }]);
        expect(events.map((event) => event.eventType)).toContain("indexer.updated");
    });

    it("keeps the existing secret when no replacement API key is provided", async () => {
        const userId = await seedUser();
        const indexer = await addIndexerCommand(userId, {
            name: "Indexer",
            protocol: "newznab",
            baseUrl: "https://api.example.test",
            apiPath: "/api",
            apiKey: "existing-secret",
            isEnabled: true,
            priority: 0,
            categories: [{ mediaType: "movie", categoryId: "2000", label: "Movies" }],
        });
        const before = ensureDatabaseReady()
            .select()
            .from(indexerSecrets)
            .where(eq(indexerSecrets.indexerId, indexer.id))
            .get();

        await updateIndexerCommand(userId, {
            id: indexer.id,
            name: "Indexer",
            protocol: "newznab",
            baseUrl: "https://api.example.test",
            apiPath: "/api",
            isEnabled: true,
            priority: 1,
            categories: [{ mediaType: "movie", categoryId: "2040", label: "Movies" }],
        });

        const after = ensureDatabaseReady()
            .select()
            .from(indexerSecrets)
            .where(eq(indexerSecrets.indexerId, indexer.id))
            .get();

        expect(after?.encryptedApiKey).toBe(before?.encryptedApiKey);
        expect(after?.maskedApiKey).toBe(before?.maskedApiKey);
    });

    it("rejects missing indexers", async () => {
        const userId = await seedUser();

        await expect(
            updateIndexerCommand(userId, {
                id: randomUUID(),
                name: "Missing",
                protocol: "newznab",
                baseUrl: "https://api.example.test",
                apiPath: "/api",
                isEnabled: true,
                priority: 0,
                categories: [{ mediaType: "movie", categoryId: "2000", label: "Movies" }],
            }),
        ).rejects.toThrow("Indexer not found.");
    });
});
