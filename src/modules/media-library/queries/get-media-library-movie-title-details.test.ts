import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
  createMediaLibrary,
  recordMediaFile,
  upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import { getMediaLibraryMovieTitleDetails } from "./get-media-library-movie-title-details";

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

describe("getMediaLibraryMovieTitleDetails", () => {
  it("returns one user-scoped movie title with file stats", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      year: 2016,
      normalizedKey: "arrival::2016",
      status: "available",
      qualityProfile: "hd-1080p",
      overview: "A linguist works with aliens.",
      posterUrl: "https://images.example/arrival.jpg",
    });
    const otherTitle = await upsertMediaTitle({
      userId: otherUserId,
      libraryId: null,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      year: 2016,
      normalizedKey: "arrival::2016",
      status: "available",
    });

    if (!title || !otherTitle) throw new Error("title missing");

    await recordMediaFile({
      userId,
      titleId: title.id,
      mediaType: "movie",
      fileKind: "movie",
      filePath: "F:/Movies/Arrival (2016)/Arrival.2016.mkv",
      relativePath: "Arrival (2016)/Arrival.2016.mkv",
      modifiedAt: new Date("2026-05-06T13:00:00Z"),
      qualityLabel: "1080P",
    });

    const result = await getMediaLibraryMovieTitleDetails(userId, title.id);
    const otherResult = await getMediaLibraryMovieTitleDetails(otherUserId, title.id);

    expect(otherResult).toBeNull();
    expect(result).toEqual(expect.objectContaining({
      title: "Arrival",
      year: 2016,
      libraryName: "Movies",
      overview: "A linguist works with aliens.",
      posterUrl: "https://images.example/arrival.jpg",
      fileCount: 1,
      qualityLabels: ["1080P"],
      lastFileModifiedAt: new Date("2026-05-06T13:00:00Z"),
    }));
  });
});
