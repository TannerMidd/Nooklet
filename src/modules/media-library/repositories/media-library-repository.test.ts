import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaTitleExternalIds,
  users,
} from "@/lib/database/schema";

import {
  addMediaLibraryPath,
  createMediaLibrary,
  findMediaTitleByNormalizedKey,
  setMediaTitleExternalIds,
  upsertMediaTitle,
} from "./media-library-repository";

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

describe("media-library-repository", () => {
  it("persists a TV library path, title, and external IDs", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({
      userId,
      mediaType: "tv",
      name: "TV Shows",
      isDefault: true,
    });
    const libraryPath = await addMediaLibraryPath({
      libraryId: library.id,
      userId,
      path: "F:/Media/TV",
      label: "TV",
      freeSpaceBytes: 500_000_000_000,
      totalSpaceBytes: 1_000_000_000_000,
    });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Severance",
      sortTitle: "severance",
      year: 2022,
      normalizedKey: "severance::2022",
      status: "available",
      overview: "Office work with a clean split.",
      posterUrl: "https://images.example/severance.jpg",
      originalLanguage: "en",
    });

    expect(title).not.toBeNull();
    if (!title) throw new Error("title missing");

    const externalIds = await setMediaTitleExternalIds(title.id, [
      { source: "tvdb", value: "371980" },
      { source: "tmdb", value: "95396" },
      { source: "tvdb", value: "371980" },
    ]);
    expect(library.mediaType).toBe("tv");
    expect(library.isDefault).toBe(true);
    expect(libraryPath.status).toBe("active");
    expect(libraryPath.freeSpaceBytes).toBe(500_000_000_000);
    expect(title.status).toBe("available");
    expect(new Set(externalIds.map((entry) => entry.source))).toEqual(new Set(["tmdb", "tvdb"]));

    const reloadedTitle = await findMediaTitleByNormalizedKey(userId, "tv", "severance::2022");
    const storedExternalIds = ensureDatabaseReady()
      .select()
      .from(mediaTitleExternalIds)
      .where(eq(mediaTitleExternalIds.titleId, title.id))
      .all();

    expect(reloadedTitle?.title).toBe("Severance");
    expect(reloadedTitle?.posterUrl).toBe("https://images.example/severance.jpg");
    expect(storedExternalIds).toHaveLength(2);
  });
  });
