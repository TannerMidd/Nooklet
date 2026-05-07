import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
  addMediaLibraryPath,
  createMediaLibrary,
  updateMediaLibraryPath,
} from "@/modules/media-library/repositories/media-library-repository";

import {
  listMediaLibraryPathOptions,
  resolveMediaLibraryDownloadTarget,
} from "./list-media-library-path-options";

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

describe("listMediaLibraryPathOptions", () => {
  it("lists active path options with their media libraries", async () => {
    const userId = await seedUser();
    const movieLibrary = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies" });
    const tvLibrary = await createMediaLibrary({ userId, mediaType: "tv", name: "TV Shows" });
    const moviesPath = await addMediaLibraryPath({
      libraryId: movieLibrary.id,
      userId,
      path: "F:/Media/Movies",
      label: "Movie drive",
    });
    const disabledPath = await addMediaLibraryPath({
      libraryId: tvLibrary.id,
      userId,
      path: "G:/Media/TV Disabled",
      label: "Disabled TV drive",
    });
    await addMediaLibraryPath({
      libraryId: tvLibrary.id,
      userId,
      path: "G:/Media/TV",
      label: "TV drive",
    });
    await updateMediaLibraryPath({
      id: disabledPath.id,
      userId,
      libraryId: tvLibrary.id,
      path: disabledPath.path,
      label: disabledPath.label,
      status: "disabled",
    });

    const options = await listMediaLibraryPathOptions(userId);

    expect(options.map((option) => option.path)).toEqual(["F:/Media/Movies", "G:/Media/TV"]);
    expect(options[0]).toMatchObject({
      id: moviesPath.id,
      libraryId: movieLibrary.id,
      libraryName: "Movies",
      mediaType: "movie",
      label: "Movie drive",
    });
  });
});

describe("resolveMediaLibraryDownloadTarget", () => {
  it("resolves active paths matching the requested media type and library", async () => {
    const userId = await seedUser();
    const movieLibrary = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies" });
    const moviePath = await addMediaLibraryPath({
      libraryId: movieLibrary.id,
      userId,
      path: "F:/Media/Movies",
      label: "Movie drive",
    });

    const target = await resolveMediaLibraryDownloadTarget(userId, {
      pathId: moviePath.id,
      mediaType: "movie",
      libraryId: movieLibrary.id,
    });

    expect(target?.path.id).toBe(moviePath.id);
    expect(target?.library.id).toBe(movieLibrary.id);
  });

  it("rejects paths for another media type or library", async () => {
    const userId = await seedUser();
    const movieLibrary = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies" });
    const tvLibrary = await createMediaLibrary({ userId, mediaType: "tv", name: "TV Shows" });
    const tvPath = await addMediaLibraryPath({
      libraryId: tvLibrary.id,
      userId,
      path: "G:/Media/TV",
      label: "TV drive",
    });

    await expect(resolveMediaLibraryDownloadTarget(userId, {
      pathId: tvPath.id,
      mediaType: "movie",
      libraryId: movieLibrary.id,
    })).resolves.toBeNull();
  });
});