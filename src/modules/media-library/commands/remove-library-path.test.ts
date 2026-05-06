import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, mediaLibraryPaths, users } from "@/lib/database/schema";
import {
  addMediaLibraryPath,
  createMediaLibrary,
} from "@/modules/media-library/repositories/media-library-repository";

import { removeLibraryPathCommand, RemoveLibraryPathCommandError } from "./remove-library-path";

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

describe("removeLibraryPathCommand", () => {
  it("removes a library path and records an audit event", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const libraryPath = await addMediaLibraryPath({
      libraryId: library.id,
      userId,
      path: "F:/Media/Movies",
      label: "Movies",
    });

    const removedPath = await removeLibraryPathCommand(userId, { pathId: libraryPath.id });
    const storedPath = ensureDatabaseReady()
      .select()
      .from(mediaLibraryPaths)
      .where(eq(mediaLibraryPaths.id, libraryPath.id))
      .get();
    const auditEvent = ensureDatabaseReady()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, libraryPath.id))
      .get();

    expect(removedPath.id).toBe(libraryPath.id);
    expect(storedPath).toBeUndefined();
    expect(auditEvent?.eventType).toBe("media-library.path.removed");
  });

  it("rejects unknown library paths", async () => {
    const userId = await seedUser();

    await expect(removeLibraryPathCommand(userId, { pathId: randomUUID() }))
      .rejects.toThrow(RemoveLibraryPathCommandError);
  });
});
