import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
  createMediaLibrary,
  createTvEpisode,
  createTvSeason,
  upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import { SearchLibraryItemReleasesWorkflowError } from "./errors";
import { resolveLibrarySearchItem } from "./item-resolution";

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

describe("resolveLibrarySearchItem", () => {
  it("resolves a user-owned title and episode", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV Shows", isDefault: true });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Severance",
      sortTitle: "severance",
      normalizedKey: "severance::2022",
      year: 2022,
    });

    if (!title) throw new Error("title missing");

    const season = await createTvSeason({ titleId: title.id, seasonNumber: 1 });
    const episode = await createTvEpisode({
      titleId: title.id,
      seasonId: season.id,
      seasonNumber: 1,
      episodeNumber: 2,
    });

    const item = await resolveLibrarySearchItem(userId, { titleId: title.id, episodeId: episode.id });

    expect(item.title.id).toBe(title.id);
    expect(item.episode?.id).toBe(episode.id);
  });

  it("rejects episodes that do not belong to the selected title", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV Shows", isDefault: true });
    const firstTitle = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Severance",
      sortTitle: "severance",
      normalizedKey: "severance::2022",
      year: 2022,
    });
    const secondTitle = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Silo",
      sortTitle: "silo",
      normalizedKey: "silo::2023",
      year: 2023,
    });

    if (!firstTitle || !secondTitle) throw new Error("title missing");

    const season = await createTvSeason({ titleId: secondTitle.id, seasonNumber: 1 });
    const episode = await createTvEpisode({
      titleId: secondTitle.id,
      seasonId: season.id,
      seasonNumber: 1,
      episodeNumber: 1,
    });

    await expect(resolveLibrarySearchItem(userId, { titleId: firstTitle.id, episodeId: episode.id }))
      .rejects.toThrow(SearchLibraryItemReleasesWorkflowError);
  });
});
