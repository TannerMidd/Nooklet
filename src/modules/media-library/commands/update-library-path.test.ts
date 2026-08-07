import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, mediaLibraries, mediaLibraryPaths, users } from "@/lib/database/schema";
import {
  addMediaLibraryPath,
  createMediaLibrary,
} from "@/modules/media-library/repositories/media-library-repository";

import { updateLibraryPathCommand, UpdateLibraryPathCommandError } from "./update-library-path";

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

let configurationOwnerId: string;

beforeAll(async () => {
  configurationOwnerId = await seedUser();
});

beforeEach(() => {
  const database = ensureDatabaseReady();
  database.delete(auditEvents).run();
  database.delete(mediaLibraryPaths).run();
  database.delete(mediaLibraries).run();
});

describe("updateLibraryPathCommand", () => {
  it("updates folder details and moves the path to a matching media library", async () => {
    const userId = configurationOwnerId;
    const movieFolder = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-movies-"));
    const tvFolder = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-tv-"));
    const movies = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const libraryPath = await addMediaLibraryPath({
      libraryId: movies.id,
      userId,
      path: movieFolder,
      label: "Movies",
    });

    const updatedPath = await updateLibraryPathCommand(userId, {
      pathId: libraryPath.id,
      mediaType: "tv",
      libraryName: "TV Shows",
      path: tvFolder,
      label: "TV root",
      status: "active",
    });
    const storedLibrary = ensureDatabaseReady()
      .select()
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, updatedPath.libraryId))
      .get();
    const auditEvent = ensureDatabaseReady()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, updatedPath.id))
      .get();

    expect(storedLibrary?.mediaType).toBe("tv");
    expect(storedLibrary?.name).toBe("TV Shows");
    expect(updatedPath.path).toBe(tvFolder);
    expect(updatedPath.label).toBe("TV root");
    expect(updatedPath.status).toBe("active");
    expect(auditEvent?.eventType).toBe("media-library.path.updated");
  });

  it("rejects duplicate folder paths", async () => {
    const userId = configurationOwnerId;
    const firstFolder = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-first-"));
    const secondFolder = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-second-"));
    const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    await addMediaLibraryPath({ libraryId: library.id, userId, path: firstFolder, label: "First" });
    const secondPath = await addMediaLibraryPath({
      libraryId: library.id,
      userId,
      path: secondFolder,
      label: "Second",
    });

    await expect(updateLibraryPathCommand(userId, {
      pathId: secondPath.id,
      mediaType: "movie",
      libraryName: "Movies",
      path: firstFolder,
      label: "Duplicate",
      status: "active",
    })).rejects.toMatchObject({ code: "path_already_exists" });
  });

  it("rejects unknown folders", async () => {
    const userId = configurationOwnerId;

    await expect(updateLibraryPathCommand(userId, {
      pathId: randomUUID(),
      mediaType: "movie",
      libraryName: "Movies",
      path: path.join(os.tmpdir(), `missing-${randomUUID()}`),
      label: "Missing",
      status: "active",
    })).rejects.toThrow(UpdateLibraryPathCommandError);
  });
});
