import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
  createIndexer,
  listEnabledIndexersForMedia,
  setIndexerMediaCategories,
} from "@/modules/indexers/repositories/indexer-repository";
import {
  addMediaLibraryPath,
  createMediaLibrary,
} from "@/modules/media-library/repositories/media-library-repository";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import {
  findServiceConnectionByType,
  saveServiceConnection,
} from "@/modules/service-connections/repositories/service-connection-repository";

import { resolveInstanceConfigurationOwnerId } from "./resolve-instance-configuration-owner";

function seedUser(role: "admin" | "user") {
  const id = randomUUID();
  ensureDatabaseReady().insert(users).values({
    id,
    email: `${id}@sharing.test`,
    displayName: role,
    passwordHash: "x",
    role,
  }).run();
  return id;
}

async function seedRegularUserWithConfigurationOwner() {
  seedUser("admin");
  const userId = seedUser("user");
  const ownerId = await resolveInstanceConfigurationOwnerId(userId);
  return { userId, ownerId };
}

describe("instance configuration sharing", () => {
  it("resolves an administrator service connection for a regular user", async () => {
    const { userId, ownerId } = await seedRegularUserWithConfigurationOwner();
    await saveServiceConnection({
      userId: ownerId,
      serviceType: "tvdb",
      displayName: "TVDB",
      baseUrl: "https://api4.thetvdb.com/v4",
      status: "verified",
      statusMessage: "Connected for the instance.",
      metadata: null,
    });

    const resolved = await findServiceConnectionByType(userId, "tvdb");
    expect(resolved?.connection.ownerUserId).toBe(ownerId);
    expect(resolved?.connection.ownershipScope).toBe("shared");
  });

  it("uses administrator indexers when the regular user has none", async () => {
    const { userId, ownerId } = await seedRegularUserWithConfigurationOwner();
    const indexer = await createIndexer({
      userId: ownerId,
      name: `Shared ${randomUUID()}`,
      protocol: "newznab",
      baseUrl: "https://indexer.example",
      status: "verified",
    });
    expect(indexer).not.toBeNull();
    if (!indexer) throw new Error("Shared indexer was not created.");
    await setIndexerMediaCategories(indexer.id, [
      { mediaType: "movie", categoryId: "2000", label: "Movies" },
    ]);

    const resolved = await listEnabledIndexersForMedia(userId, "movie");
    expect(resolved.map((entry) => entry.id)).toContain(indexer.id);
  });

  it("offers administrator library destinations to regular-user requests", async () => {
    const { userId, ownerId } = await seedRegularUserWithConfigurationOwner();
    const library = await createMediaLibrary({
      userId: ownerId,
      mediaType: "movie",
      name: `Shared Movies ${randomUUID()}`,
    });
    const destination = await addMediaLibraryPath({
      userId: ownerId,
      libraryId: library.id,
      path: `F:/Shared/${randomUUID()}`,
      label: "Shared movie destination",
    });

    const options = await listMediaLibraryPathOptions(userId);
    expect(options.map((entry) => entry.id)).toContain(destination.id);
  });
});
