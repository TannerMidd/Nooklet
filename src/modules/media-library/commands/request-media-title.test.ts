import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, mediaTitleExternalIds, users } from "@/lib/database/schema";
import { createMediaLibrary } from "@/modules/media-library/repositories/media-library-repository";

import { requestMediaTitleCommand, RequestMediaTitleCommandError } from "./request-media-title";

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

describe("requestMediaTitleCommand", () => {
  it("adds a title with monitoring, quality profile, metadata, and TMDB external id", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });

    const title = await requestMediaTitleCommand(userId, {
      mediaType: "movie",
      libraryId: library.id,
      tmdbId: 329865,
      title: "Arrival",
      year: 2016,
      monitored: true,
      qualityProfile: "uhd-2160p",
      overview: "A linguist works with aliens.",
      posterUrl: "https://images.example/arrival.jpg",
      backdropUrl: "https://images.example/arrival-backdrop.jpg",
      runtimeMinutes: 116,
      originalLanguage: "en",
    });
    const externalIds = ensureDatabaseReady()
      .select()
      .from(mediaTitleExternalIds)
      .where(eq(mediaTitleExternalIds.titleId, title.id))
      .all();
    const auditEvent = ensureDatabaseReady()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, title.id))
      .get();

    expect(title).toMatchObject({
      libraryId: library.id,
      title: "Arrival",
      mediaType: "movie",
      year: 2016,
      status: "requested",
      monitored: true,
      qualityProfile: "uhd-2160p",
      overview: "A linguist works with aliens.",
      posterUrl: "https://images.example/arrival.jpg",
      runtimeMinutes: 116,
      originalLanguage: "en",
    });
    expect(externalIds).toEqual([expect.objectContaining({ source: "tmdb", value: "329865" })]);
    expect(auditEvent?.eventType).toBe("media-library.title.requested");
  });

  it("rejects libraries that do not belong to the user or media type", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const library = await createMediaLibrary({ userId: otherUserId, mediaType: "tv", name: "TV", isDefault: true });

    await expect(requestMediaTitleCommand(userId, {
      mediaType: "movie",
      libraryId: library.id,
      title: "Arrival",
      year: 2016,
      monitored: true,
      qualityProfile: "hd-1080p",
    })).rejects.toThrow(RequestMediaTitleCommandError);
  });
});
