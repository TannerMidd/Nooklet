import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, mediaTitles, tvEpisodes, tvSeasons, users } from "@/lib/database/schema";
import {
  createMediaLibrary,
  createTvEpisode,
  createTvSeason,
  upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import { updateMediaLibraryMonitoringCommand } from "./update-media-library-monitoring";

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

describe("updateMediaLibraryMonitoringCommand", () => {
  it("updates every user title, season, and episode without touching other users", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const tvLibrary = await createMediaLibrary({ userId, mediaType: "tv", name: "TV", isDefault: true });
    const movieLibrary = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const otherLibrary = await createMediaLibrary({ userId: otherUserId, mediaType: "movie", name: "Movies", isDefault: true });
    const tvTitle = await upsertMediaTitle({
      userId,
      libraryId: tvLibrary.id,
      mediaType: "tv",
      title: "Fringe",
      sortTitle: "fringe",
      normalizedKey: "fringe::2008",
      monitored: true,
    });
    const movieTitle = await upsertMediaTitle({
      userId,
      libraryId: movieLibrary.id,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      normalizedKey: "arrival::2016",
      monitored: true,
    });
    const otherTitle = await upsertMediaTitle({
      userId: otherUserId,
      libraryId: otherLibrary.id,
      mediaType: "movie",
      title: "Moon",
      sortTitle: "moon",
      normalizedKey: "moon::2009",
      monitored: true,
    });
    const season = await createTvSeason({ titleId: tvTitle!.id, seasonNumber: 1, monitored: true });

    await createTvEpisode({
      titleId: tvTitle!.id,
      seasonId: season.id,
      seasonNumber: 1,
      episodeNumber: 1,
      monitored: true,
    });

    const result = await updateMediaLibraryMonitoringCommand(userId, {
      mediaType: "all",
      monitored: false,
    });
    const database = ensureDatabaseReady();
    const updatedTitles = database.select().from(mediaTitles).where(eq(mediaTitles.userId, userId)).all();
    const updatedSeason = database.select().from(tvSeasons).where(eq(tvSeasons.id, season.id)).get();
    const updatedEpisode = database.select().from(tvEpisodes).where(eq(tvEpisodes.seasonId, season.id)).get();
    const untouchedTitle = database.select().from(mediaTitles).where(eq(mediaTitles.id, otherTitle!.id)).get();
    const auditEvent = database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectType, "media-library"))
      .get();

    expect(result).toEqual({ monitored: false, titleCount: 2, seasonCount: 1, episodeCount: 1 });
    expect(updatedTitles).toHaveLength(2);
    expect(updatedTitles.every((title) => title.monitored === false)).toBe(true);
    expect(updatedSeason?.monitored).toBe(false);
    expect(updatedEpisode?.monitored).toBe(false);
    expect(untouchedTitle?.monitored).toBe(true);
    expect(movieTitle).not.toBeNull();
    expect(auditEvent?.eventType).toBe("media-library.monitoring.bulk-updated");
  });
});