import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { jobs, serviceConnections, users } from "@/lib/database/schema";
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
import { getLibraryScanSettings } from "@/modules/media-library/queries/get-library-scan-settings";
import { getMetadataRefreshSettings } from "@/modules/media-library/queries/get-metadata-refresh-settings";
import { getMissingSearchSettings } from "@/modules/media-library/queries/get-missing-search-settings";
import { configureLibraryScanSchedule } from "@/modules/media-library/workflows/configure-library-scan-schedule";
import { configureMetadataRefreshSchedule } from "@/modules/media-library/workflows/configure-metadata-refresh-schedule";
import { configureMissingSearchSchedule } from "@/modules/media-library/workflows/configure-missing-search-schedule";
import {
  deleteServiceConnection,
  findServiceConnectionByType,
  listServiceConnectionSummaryRecords,
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

async function seedSecondAdminWithConfigurationOwner() {
  const firstAdminId = seedUser("admin");
  const ownerId = await resolveInstanceConfigurationOwnerId(firstAdminId);
  const secondAdminId = seedUser("admin");
  return { secondAdminId, ownerId };
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

  it("keeps instance automation schedules on one canonical row across administrators", async () => {
    const { secondAdminId, ownerId } = await seedSecondAdminWithConfigurationOwner();

    await configureLibraryScanSchedule(ownerId, { enabled: true, intervalMinutes: 60 });
    await configureMissingSearchSchedule(ownerId, { enabled: true, intervalMinutes: 120 });
    await configureMetadataRefreshSchedule(ownerId, { enabled: true, intervalMinutes: 180 });

    await configureLibraryScanSchedule(secondAdminId, { enabled: true, intervalMinutes: 240 });
    await configureMissingSearchSchedule(secondAdminId, { enabled: false, intervalMinutes: 300 });
    await configureMetadataRefreshSchedule(secondAdminId, { enabled: true, intervalMinutes: 360 });

    const automationJobTypes = new Set([
      "media-library-scan",
      "missing-content-search",
      "metadata-refresh",
    ]);
    const ownerJobs = ensureDatabaseReady()
      .select()
      .from(jobs)
      .where(eq(jobs.userId, ownerId))
      .all()
      .filter((job) => automationJobTypes.has(job.jobType));
    const secondAdminJobs = ensureDatabaseReady()
      .select()
      .from(jobs)
      .where(eq(jobs.userId, secondAdminId))
      .all()
      .filter((job) => automationJobTypes.has(job.jobType));

    expect(ownerJobs).toHaveLength(3);
    expect(secondAdminJobs).toEqual([]);
    expect(await getLibraryScanSettings(secondAdminId)).toMatchObject({
      enabled: true,
      intervalMinutes: 240,
    });
    expect(await getMissingSearchSettings(secondAdminId)).toMatchObject({
      enabled: false,
      intervalMinutes: 300,
    });
    expect(await getMetadataRefreshSettings(secondAdminId)).toMatchObject({
      enabled: true,
      intervalMinutes: 360,
    });
  });

  it("updates the canonical shared connection when a second administrator saves", async () => {
    const { secondAdminId, ownerId } = await seedSecondAdminWithConfigurationOwner();
    const original = await saveServiceConnection({
      userId: ownerId,
      serviceType: "usenet-server",
      displayName: "Usenet server",
      baseUrl: "nntps://original.example.test:563",
      status: "verified",
      statusMessage: "Original configuration.",
      metadata: null,
    });
    const updated = await saveServiceConnection({
      userId: secondAdminId,
      serviceType: "usenet-server",
      displayName: "Usenet server",
      baseUrl: "nntps://updated.example.test:563",
      status: "configured",
      statusMessage: "Updated by another administrator.",
      metadata: null,
    });

    expect(updated?.connection).toMatchObject({
      id: original?.connection.id,
      ownerUserId: ownerId,
      ownershipScope: "shared",
      baseUrl: "nntps://updated.example.test:563",
    });
    expect(ensureDatabaseReady()
      .select()
      .from(serviceConnections)
      .where(and(
        eq(serviceConnections.ownerUserId, secondAdminId),
        eq(serviceConnections.serviceType, "usenet-server"),
      ))
      .all()).toEqual([]);
  });

  it("does not let a legacy administrator-owned override shadow canonical configuration", async () => {
    const { secondAdminId, ownerId } = await seedSecondAdminWithConfigurationOwner();
    const canonical = await saveServiceConnection({
      userId: ownerId,
      serviceType: "ai-provider",
      displayName: "AI provider",
      baseUrl: "https://canonical.example.test/v1",
      status: "verified",
      statusMessage: "Canonical configuration.",
      metadata: { model: "canonical-model" },
    });
    ensureDatabaseReady().insert(serviceConnections).values({
      id: randomUUID(),
      ownerUserId: secondAdminId,
      serviceType: "ai-provider",
      ownershipScope: "shared",
      displayName: "Legacy override",
      baseUrl: "https://override.example.test/v1",
      status: "verified",
      statusMessage: "Legacy override.",
      metadataJson: JSON.stringify({ model: "override-model" }),
    }).run();

    const resolved = await findServiceConnectionByType(secondAdminId, "ai-provider");
    const summaries = await listServiceConnectionSummaryRecords(secondAdminId);
    const summary = summaries.find(
      (connection) => connection.connection.serviceType === "ai-provider",
    );

    expect(resolved?.connection.id).toBe(canonical?.connection.id);
    expect(resolved?.connection.ownerUserId).toBe(ownerId);
    expect(summary?.connection.id).toBe(canonical?.connection.id);
    expect(summary?.connection.baseUrl).toBe("https://canonical.example.test/v1");
  });

  it("disconnects the canonical shared connection from a second administrator", async () => {
    const { secondAdminId, ownerId } = await seedSecondAdminWithConfigurationOwner();
    const canonical = await saveServiceConnection({
      userId: ownerId,
      serviceType: "tmdb",
      displayName: "TMDB",
      baseUrl: "https://api.themoviedb.org/3",
      status: "verified",
      statusMessage: "Connected for the instance.",
      metadata: null,
    });

    expect(canonical).not.toBeNull();
    expect(await deleteServiceConnection(secondAdminId, "tmdb")).toBe(true);
    expect(await findServiceConnectionByType(ownerId, "tmdb")).toBeNull();
    expect(ensureDatabaseReady()
      .select()
      .from(serviceConnections)
      .where(and(
        eq(serviceConnections.ownerUserId, secondAdminId),
        eq(serviceConnections.serviceType, "tmdb"),
      ))
      .all()).toEqual([]);
  });

  it("keeps Trakt connections user-scoped", async () => {
    const firstUserId = seedUser("user");
    const secondUserId = seedUser("user");
    const first = await saveServiceConnection({
      userId: firstUserId,
      serviceType: "trakt",
      displayName: "Trakt",
      baseUrl: "https://api.trakt.tv",
      status: "verified",
      statusMessage: "First personal account.",
      metadata: { username: "first" },
    });
    const second = await saveServiceConnection({
      userId: secondUserId,
      serviceType: "trakt",
      displayName: "Trakt",
      baseUrl: "https://api.trakt.tv",
      status: "verified",
      statusMessage: "Second personal account.",
      metadata: { username: "second" },
    });

    expect(first?.connection.ownerUserId).toBe(firstUserId);
    expect(second?.connection.ownerUserId).toBe(secondUserId);
    expect(second?.connection.id).not.toBe(first?.connection.id);
    expect((await findServiceConnectionByType(firstUserId, "trakt"))?.metadata).toMatchObject({
      username: "first",
    });
    expect((await findServiceConnectionByType(secondUserId, "trakt"))?.metadata).toMatchObject({
      username: "second",
    });
  });
});
