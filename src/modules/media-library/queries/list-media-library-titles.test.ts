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
      qualityProfile: "uhd-2160p",
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

    const result = await listMediaLibraryTitles(userId, "movie", { query: "arri" });

    expect(result.totals).toEqual({
      titles: 1,
      files: 1,
      monitored: 1,
      available: 1,
      requested: 0,
      missing: 0,
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 50,
      pageCount: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      firstItem: 1,
      lastItem: 1,
    });
    expect(result.titles[0]).toEqual(expect.objectContaining({
      title: "Arrival",
      year: 2016,
      libraryName: "Movies",
      fileCount: 1,
      qualityLabels: ["1080P"],
      qualityProfile: "uhd-2160p",
      posterUrl: "https://images.example/arrival.jpg",
    }));
  });

  it("returns a bounded page while keeping filtered totals database-backed", async () => {
    const userId = await seedUser();
    const movieLibrary = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const alpha = await upsertMediaTitle({
      userId,
      libraryId: movieLibrary.id,
      mediaType: "movie",
      title: "Alpha",
      sortTitle: "alpha",
      year: 2026,
      normalizedKey: "alpha::2026",
      status: "available",
      monitored: true,
    });
    await upsertMediaTitle({
      userId,
      libraryId: movieLibrary.id,
      mediaType: "movie",
      title: "Beta",
      sortTitle: "beta",
      year: 2026,
      normalizedKey: "beta::2026",
      status: "missing",
      monitored: false,
    });
    await upsertMediaTitle({
      userId,
      libraryId: movieLibrary.id,
      mediaType: "movie",
      title: "Delta",
      sortTitle: "delta",
      year: 2026,
      normalizedKey: "delta::2026",
      status: "requested",
      monitored: true,
    });
    const gamma = await upsertMediaTitle({
      userId,
      libraryId: movieLibrary.id,
      mediaType: "movie",
      title: "Gamma",
      sortTitle: "gamma",
      year: 2026,
      normalizedKey: "gamma::2026",
      status: "available",
      monitored: true,
    });

    await recordMediaFile({
      userId,
      titleId: alpha!.id,
      libraryPathId: null,
      mediaType: "movie",
      fileKind: "movie",
      filePath: "F:/Movies/Alpha/Alpha.mkv",
      relativePath: "Alpha/Alpha.mkv",
      sizeBytes: 100,
      modifiedAt: new Date("2026-05-06T13:00:00Z"),
      qualityLabel: "1080P",
    });
    await recordMediaFile({
      userId,
      titleId: gamma!.id,
      libraryPathId: null,
      mediaType: "movie",
      fileKind: "movie",
      filePath: "F:/Movies/Gamma/Gamma.mkv",
      relativePath: "Gamma/Gamma.mkv",
      sizeBytes: 100,
      modifiedAt: new Date("2026-05-06T14:00:00Z"),
      qualityLabel: "2160P",
    });

    const result = await listMediaLibraryTitles(userId, "movie", { page: 2, pageSize: 2 });

    expect(result.titles).toHaveLength(2);
    expect(result.titles).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Delta", status: "requested", fileCount: 0 }),
      expect.objectContaining({ title: "Gamma", status: "available", fileCount: 1, qualityLabels: ["2160P"] }),
    ]));
    expect(result.totals).toEqual({
      titles: 4,
      files: 2,
      monitored: 3,
      available: 2,
      requested: 1,
      missing: 1,
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 2,
      pageCount: 2,
      hasNextPage: false,
      hasPreviousPage: true,
      firstItem: 3,
      lastItem: 4,
    });

    const requested = await listMediaLibraryTitles(userId, "movie", {
      status: "requested",
      monitored: true,
      libraryId: movieLibrary.id,
      sort: "status",
    });
    expect(requested.titles.map((title) => title.title)).toEqual(["Delta"]);
    expect(requested.totals).toEqual(expect.objectContaining({
      titles: 1,
      requested: 1,
      available: 0,
      missing: 0,
    }));

    const available = await listMediaLibraryTitles(userId, "movie", { status: "available" });
    expect(available.titles.map((title) => title.title)).toEqual(["Alpha", "Gamma"]);
  });

  it("does not report a title as available when no media file exists", async () => {
    const userId = await seedUser();
    const movieLibrary = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    await upsertMediaTitle({
      userId,
      libraryId: movieLibrary.id,
      mediaType: "movie",
      title: "Stale status",
      sortTitle: "stale status",
      year: 2026,
      normalizedKey: "stale-status::2026",
      status: "available",
      monitored: true,
    });

    const result = await listMediaLibraryTitles(userId, "movie");

    expect(result.titles[0]?.status).toBe("missing");
    expect(result.totals).toEqual({
      titles: 1,
      files: 0,
      monitored: 1,
      available: 0,
      requested: 0,
      missing: 1,
    });
  });

  it("caps page size to protect large libraries from unbounded renders", async () => {
    const userId = await seedUser();
    const movieLibrary = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });

    for (let index = 0; index < 101; index += 1) {
      const titleNumber = String(index).padStart(3, "0");

      await upsertMediaTitle({
        userId,
        libraryId: movieLibrary.id,
        mediaType: "movie",
        title: `Title ${titleNumber}`,
        sortTitle: `title ${titleNumber}`,
        year: 2026,
        normalizedKey: `title-${titleNumber}::2026`,
      });
    }

    const result = await listMediaLibraryTitles(userId, "movie", { pageSize: 1_000 });

    expect(result.titles).toHaveLength(100);
    expect(result.totals.titles).toBe(101);
    expect(result.pagination).toEqual(expect.objectContaining({
      page: 1,
      pageSize: 100,
      pageCount: 2,
      hasNextPage: true,
      hasPreviousPage: false,
      firstItem: 1,
      lastItem: 100,
    }));
  });
});
