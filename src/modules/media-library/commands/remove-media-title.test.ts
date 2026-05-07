import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, mediaTitles, tvEpisodes, users } from "@/lib/database/schema";
import {
  createMediaLibrary,
  createTvEpisode,
  createTvSeason,
  upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import {
  removeMediaTitleCommand,
  RemoveMediaTitleCommandError,
} from "./remove-media-title";

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

describe("removeMediaTitleCommand", () => {
  it("removes a user-owned movie title and audits the removal", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      normalizedKey: "arrival::2016",
      year: 2016,
    });

    if (!title) throw new Error("title missing");

    const removedTitle = await removeMediaTitleCommand(userId, { titleId: title.id });
    const storedTitle = ensureDatabaseReady()
      .select()
      .from(mediaTitles)
      .where(eq(mediaTitles.id, title.id))
      .get();
    const auditEvent = ensureDatabaseReady()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, title.id))
      .get();

    expect(removedTitle.id).toBe(title.id);
    expect(storedTitle).toBeUndefined();
    expect(auditEvent?.eventType).toBe("media-library.title.removed");
  });

  it("removes TV seasons and episodes through title cascade", async () => {
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
      episodeNumber: 1,
    });

    await removeMediaTitleCommand(userId, { titleId: title.id });

    const storedEpisode = ensureDatabaseReady()
      .select()
      .from(tvEpisodes)
      .where(eq(tvEpisodes.id, episode.id))
      .get();

    expect(storedEpisode).toBeUndefined();
  });

  it("rejects titles that do not belong to the user", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const library = await createMediaLibrary({ userId: otherUserId, mediaType: "movie", name: "Movies", isDefault: true });
    const title = await upsertMediaTitle({
      userId: otherUserId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      normalizedKey: "arrival::2016",
      year: 2016,
    });

    if (!title) throw new Error("title missing");

    await expect(removeMediaTitleCommand(userId, { titleId: title.id }))
      .rejects.toThrow(RemoveMediaTitleCommandError);
  });
});