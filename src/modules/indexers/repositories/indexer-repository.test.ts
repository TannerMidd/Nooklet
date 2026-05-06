import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  indexerMediaCategories,
  indexerSecrets,
  users,
} from "@/lib/database/schema";

import {
  createIndexer,
  findIndexerById,
  listEnabledIndexersForMedia,
  saveIndexerSecret,
  setIndexerMediaCategories,
} from "./indexer-repository";

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

describe("indexer-repository", () => {
  it("persists an indexer, encrypted secret, and media categories", async () => {
    const userId = await seedUser();
    const indexer = await createIndexer({
      userId,
      name: "NZB Scout",
      protocol: "newznab",
      baseUrl: "https://indexer.example",
      status: "verified",
      priority: 10,
    });

    expect(indexer).not.toBeNull();
    if (!indexer) throw new Error("indexer missing");

    const secret = await saveIndexerSecret({
      indexerId: indexer.id,
      encryptedApiKey: "encrypted-key",
      maskedApiKey: "****-key",
    });
    const categories = await setIndexerMediaCategories(indexer.id, [
      { mediaType: "tv", categoryId: "5000", label: "TV" },
      { mediaType: "tv", categoryId: "5030", label: "TV HD" },
      { mediaType: "movie", categoryId: "2000", label: "Movies" },
      { mediaType: "tv", categoryId: "5000", label: "TV duplicate" },
    ]);

    const reloadedIndexer = await findIndexerById(userId, indexer.id);
    const enabledTvIndexers = await listEnabledIndexersForMedia(userId, "tv");
    const storedSecret = ensureDatabaseReady()
      .select()
      .from(indexerSecrets)
      .where(eq(indexerSecrets.indexerId, indexer.id))
      .get();
    const storedCategories = ensureDatabaseReady()
      .select()
      .from(indexerMediaCategories)
      .where(eq(indexerMediaCategories.indexerId, indexer.id))
      .all();

    expect(reloadedIndexer?.apiPath).toBe("/api");
    expect(reloadedIndexer?.status).toBe("verified");
    expect(secret.maskedApiKey).toBe("****-key");
    expect(storedSecret?.encryptedApiKey).toBe("encrypted-key");
    expect(categories).toHaveLength(3);
    expect(storedCategories).toHaveLength(3);
    expect(enabledTvIndexers.map((entry) => entry.id)).toEqual([indexer.id]);
  });
});
