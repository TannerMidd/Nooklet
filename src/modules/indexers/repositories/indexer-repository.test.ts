import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  indexerMediaCategories,
  indexerSearchResultSecrets,
  indexerSecrets,
  users,
} from "@/lib/database/schema";

import {
  completeIndexerSearchRun,
  createIndexer,
  createIndexerSearchRun,
  findIndexerById,
  findIndexerSecret,
  findSearchResultById,
  findSearchResultSecret,
  listEnabledIndexersForMedia,
  listIndexerMediaCategories,
  listSearchResultsForRun,
  recordIndexerSearchResult,
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
    const reloadedSecret = await findIndexerSecret(indexer.id);
    const tvCategories = await listIndexerMediaCategories(indexer.id, "tv");
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
    expect(reloadedSecret?.encryptedApiKey).toBe("encrypted-key");
    expect(tvCategories.map((entry) => entry.categoryId)).toEqual(["5000", "5030"]);
    expect(storedSecret?.encryptedApiKey).toBe("encrypted-key");
    expect(categories).toHaveLength(3);
    expect(storedCategories).toHaveLength(3);
    expect(enabledTvIndexers.map((entry) => entry.id)).toEqual([indexer.id]);
  });

  it("persists search runs, safe result metadata, and encrypted result links", async () => {
    const userId = await seedUser();
    const indexer = await createIndexer({
      userId,
      name: "NZB Scout",
      protocol: "newznab",
      baseUrl: "https://indexer.example",
    });

    expect(indexer).not.toBeNull();
    if (!indexer) throw new Error("indexer missing");

    const searchRun = await createIndexerSearchRun({
      userId,
      indexerId: indexer.id,
      mediaType: "movie",
      query: "Arrival 2016",
      normalizedKey: "arrival::2016",
      status: "running",
      expiresAt: new Date("2026-05-06T12:30:00Z"),
    });
    const result = await recordIndexerSearchResult({
      searchRunId: searchRun.id,
      userId,
      indexerId: indexer.id,
      mediaType: "movie",
      title: "Arrival 2016 2160p WEB-DL",
      normalizedTitle: "arrival 2016 2160p web-dl",
      indexerGuid: "guid-arrival-2160p",
      qualityLabel: "WEB-2160p",
      releaseGroup: "Nooklet",
      sizeBytes: 20_000_000_000,
      publishedAt: new Date("2026-05-06T12:00:00Z"),
      ageMinutes: 12,
      encryptedDownloadUrl: "encrypted-download-url",
      maskedDownloadUrl: "https://indexer.example/...",
    });
    const completedRun = await completeIndexerSearchRun({
      searchRunId: searchRun.id,
      status: "succeeded",
      resultCount: 1,
      completedAt: new Date("2026-05-06T12:01:00Z"),
    });
    const selectedResult = await findSearchResultById(userId, result.id);
    const selectedSecret = await findSearchResultSecret(result.id);
    const safeResults = await listSearchResultsForRun(userId, searchRun.id);
    const storedSecret = ensureDatabaseReady()
      .select()
      .from(indexerSearchResultSecrets)
      .where(eq(indexerSearchResultSecrets.resultId, result.id))
      .get();

    expect(completedRun.status).toBe("succeeded");
    expect(completedRun.resultCount).toBe(1);
    expect(result.qualityLabel).toBe("WEB-2160p");
    expect("encryptedDownloadUrl" in result).toBe(false);
    expect(selectedResult?.title).toBe("Arrival 2016 2160p WEB-DL");
    expect(selectedSecret?.encryptedDownloadUrl).toBe("encrypted-download-url");
    expect(safeResults.map((entry) => entry.indexerGuid)).toEqual(["guid-arrival-2160p"]);
    expect(storedSecret?.encryptedDownloadUrl).toBe("encrypted-download-url");
    expect(storedSecret?.maskedDownloadUrl).toBe("https://indexer.example/...");
  });
});
