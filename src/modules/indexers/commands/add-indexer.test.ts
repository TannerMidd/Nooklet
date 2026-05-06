import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  auditEvents,
  indexerMediaCategories,
  indexerSecrets,
  users,
} from "@/lib/database/schema";

import { addIndexerCommand } from "./add-indexer";

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

describe("addIndexerCommand", () => {
  it("stores configuration, encrypted secret, categories, and audit event", async () => {
    const userId = await seedUser();

    const indexer = await addIndexerCommand(userId, {
      name: "NZBGeek",
      protocol: "newznab",
      baseUrl: "https://api.example.test",
      apiPath: "/api",
      apiKey: "super-secret-key",
      isEnabled: true,
      priority: 10,
      categories: [
        { mediaType: "movie", categoryId: "2000", label: "Movies" },
        { mediaType: "tv", categoryId: "5000", label: "TV" },
      ],
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
    const auditEvent = ensureDatabaseReady()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, indexer.id))
      .get();

    expect(indexer.name).toBe("NZBGeek");
    expect(secret?.encryptedApiKey).not.toBe("super-secret-key");
    expect(secret?.maskedApiKey).toBe("su************ey");
    expect(categories).toHaveLength(2);
    expect(auditEvent?.eventType).toBe("indexer.created");
  });

  it("requires at least one media category", async () => {
    const userId = await seedUser();

    await expect(addIndexerCommand(userId, {
      name: "No categories",
      protocol: "newznab",
      baseUrl: "https://api.example.test",
      apiPath: "/api",
      apiKey: "secret",
      isEnabled: true,
      priority: 0,
      categories: [],
    })).rejects.toThrow("Add at least one movie or TV category");
  });
});
