import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
  createMediaLibrary,
  recordMediaFile,
  upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import { listMediaLibraryTitles } from "./list-media-library-titles";

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

describe("listMediaLibraryTitles", () => {
  it("returns user-scoped media titles with file counts and quality labels", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const movieLibrary = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const arrival = await upsertMediaTitle({
      userId,
      libraryId: movieLibrary.id,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      year: 2016,
      normalizedKey: "arrival::2016",
      status: "available",
      monitored: true,
      posterUrl: "https://images.example/arrival.jpg",
    });
    await upsertMediaTitle({
      userId: otherUserId,
      libraryId: null,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      year: 2016,
      normalizedKey: "arrival::2016",
      status: "available",
    });

    await recordMediaFile({
      userId,
      titleId: arrival!.id,
      libraryPathId: null,
      mediaType: "movie",
      fileKind: "movie",
      filePath: "F:/Movies/Arrival/Arrival.mkv",
      relativePath: "Arrival/Arrival.mkv",
      sizeBytes: 100,
      modifiedAt: new Date("2026-05-06T13:00:00Z"),
      qualityLabel: "1080P",
    });

    const result = await listMediaLibraryTitles(userId, "movie", "arri");

    expect(result.totals).toEqual({ titles: 1, files: 1, monitored: 1, missing: 0 });
    expect(result.titles[0]).toEqual(expect.objectContaining({
      title: "Arrival",
      year: 2016,
      libraryName: "Movies",
      fileCount: 1,
      qualityLabels: ["1080P"],
      posterUrl: "https://images.example/arrival.jpg",
    }));
  });
});
