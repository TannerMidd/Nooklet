import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  downloadImportRuns,
  downloadFulfillments,
  downloadQueueItems,
  downloadRequests,
  engineDownloads,
  indexerSearchResults,
  indexerSearchRuns,
  mediaFiles,
  mediaLibraries,
  mediaLibraryPaths,
  mediaTitles,
  serviceConnections,
  tvEpisodes,
  tvSeasons,
  users,
} from "@/lib/database/schema";

import {
  completeDownloadImportRun,
  countBudgetConsumingReleaseAttemptsForItem,
  createDownloadClient,
  createDownloadImportRun,
  createDownloadRequest,
  expireStalePendingDownloadReservations,
  findActiveDownloadRequestForItem,
  findDownloadClientById,
  findDownloadClientByServiceConnectionId,
  findDownloadRequestById,
  incrementDownloadRequestMissingTickCount,
  incrementDownloadRequestRetryCount,
  isActiveDownloadRequestUniqueViolation,
  countDownloadRequestHistory,
  listDownloadRequestHistoryPage,
  listRequestsForFulfillment,
  listDownloadRequestsByStatus,
  listActiveDownloadRequestsForImport,
  listDownloadRequestReleaseExclusionsForItem,
  listRecentDownloadRequestsWithQueueItems,
  listUsersWithActiveDownloadRequests,
  listImportedFilesForRun,
  markDownloadRequestSubmitted,
  recordDownloadImportedFile,
  recordDownloadQueueItem,
  recordSubmittedDownload,
  resetDownloadRequestMissingTickCount,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "./download-repository";

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

function seedUsenetServerConnection(userId: string) {
  const database = ensureDatabaseReady();
  const connectionId = randomUUID();

  database
    .insert(serviceConnections)
    .values({
      id: connectionId,
      serviceType: "usenet-server",
      ownerUserId: userId,
      displayName: "Usenet server",
      baseUrl: "news.example.test:563",
      status: "verified",
    })
    .run();

  return connectionId;
}

function seedImportedMovieFile(userId: string) {
  const database = ensureDatabaseReady();
  const libraryId = randomUUID();
  const libraryPathId = randomUUID();
  const titleId = randomUUID();
  const mediaFileId = randomUUID();

  database
    .insert(mediaLibraries)
    .values({ id: libraryId, userId, mediaType: "movie", name: "Movies" })
    .run();
  database
    .insert(mediaLibraryPaths)
    .values({
      id: libraryPathId,
      libraryId,
      userId,
      path: "F:/Media/Movies",
      label: "Movies",
    })
    .run();
  database
    .insert(mediaTitles)
    .values({
      id: titleId,
      userId,
      libraryId,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      year: 2016,
      normalizedKey: "arrival::2016",
      status: "available",
    })
    .run();
  database
    .insert(mediaFiles)
    .values({
      id: mediaFileId,
      userId,
      titleId,
      libraryPathId,
      mediaType: "movie",
      fileKind: "movie",
      filePath: "F:/Media/Movies/Arrival (2016)/Arrival (2016).mkv",
      relativePath: "Arrival (2016)/Arrival (2016).mkv",
    })
    .run();

  return { libraryPathId, mediaFileId };
}

function seedTitleAndEpisode(userId: string, keySuffix = "") {
  const database = ensureDatabaseReady();
  const movieLibraryId = randomUUID();
  const tvLibraryId = randomUUID();
  const movieTitleId = randomUUID();
  const episodeTitleId = randomUUID();
  const seasonId = randomUUID();
  const episodeId = randomUUID();

  database.insert(mediaLibraries).values({ id: movieLibraryId, userId, mediaType: "movie", name: `Movies ${movieLibraryId}` }).run();
  database.insert(mediaLibraries).values({ id: tvLibraryId, userId, mediaType: "tv", name: `TV ${tvLibraryId}` }).run();
  database
    .insert(mediaTitles)
    .values({
      id: movieTitleId,
      userId,
      libraryId: movieLibraryId,
      mediaType: "movie",
      title: `Arrival${keySuffix}`,
      sortTitle: `arrival${keySuffix}`,
      year: 2016,
      normalizedKey: `arrival${keySuffix}::2016`,
      status: "missing",
    })
    .run();
  database
    .insert(mediaTitles)
    .values({
      id: episodeTitleId,
      userId,
      libraryId: tvLibraryId,
      mediaType: "tv",
      title: `Severance${keySuffix}`,
      sortTitle: `severance${keySuffix}`,
      year: 2022,
      normalizedKey: `severance${keySuffix}::2022`,
      status: "missing",
    })
    .run();
  database
    .insert(tvSeasons)
    .values({ id: seasonId, titleId: episodeTitleId, seasonNumber: 1 })
    .run();
  database
    .insert(tvEpisodes)
    .values({
      id: episodeId,
      titleId: episodeTitleId,
      seasonId,
      seasonNumber: 1,
      episodeNumber: 2,
      title: "Half Loop",
    })
    .run();

  return { movieTitleId, episodeTitleId, seasonId, episodeId };
}

function seedSearchResult(input: {
  userId: string;
  mediaType: "movie" | "tv";
  title: string;
  indexerGuid?: string;
}) {
  const database = ensureDatabaseReady();
  const searchRunId = randomUUID();
  const resultId = randomUUID();

  database
    .insert(indexerSearchRuns)
    .values({
      id: searchRunId,
      userId: input.userId,
      mediaType: input.mediaType,
      query: input.title,
      status: "succeeded",
      expiresAt: new Date("2026-05-08T00:00:00Z"),
    })
    .run();
  database
    .insert(indexerSearchResults)
    .values({
      id: resultId,
      searchRunId,
      userId: input.userId,
      mediaType: input.mediaType,
      title: input.title,
      normalizedTitle: input.title.toLowerCase(),
      indexerGuid: input.indexerGuid ?? resultId,
    })
    .run();

  return resultId;
}

beforeEach(() => {
  ensureDatabaseReady();
});

describe("download-repository", () => {
  it("expires only stale pre-submission reservations", async () => {
    const database = ensureDatabaseReady();
    const userId = await seedUser();
    const now = new Date();
    const old = new Date(now.getTime() - 20 * 60_000);

    const stale = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Stale reservation",
      status: "pending",
    });
    const fresh = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Fresh reservation",
      status: "pending",
    });
    const submitted = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Submission already recorded",
      status: "pending",
    });
    const queueLinked = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Queue-linked reservation",
      status: "pending",
    });
    await recordDownloadQueueItem({
      requestId: queueLinked.id,
      userId,
      externalQueueId: `queue-${queueLinked.id}`,
    });

    database
      .update(downloadRequests)
      .set({ createdAt: old, updatedAt: old })
      .where(inArray(downloadRequests.id, [stale.id, submitted.id, queueLinked.id]))
      .run();
    database
      .update(downloadRequests)
      .set({ submittedAt: old })
      .where(eq(downloadRequests.id, submitted.id))
      .run();

    const expired = await expireStalePendingDownloadReservations({ now });
    const rows = database
      .select()
      .from(downloadRequests)
      .where(inArray(downloadRequests.id, [stale.id, fresh.id, submitted.id, queueLinked.id]))
      .all();
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(expired).toBe(1);
    expect(byId.get(stale.id)).toMatchObject({
      status: "failed",
      completedAt: now,
    });
    expect(byId.get(stale.id)?.statusMessage).toMatch(/reservation expired/i);
    expect(byId.get(fresh.id)?.status).toBe("pending");
    expect(byId.get(submitted.id)?.status).toBe("pending");
    expect(byId.get(queueLinked.id)?.status).toBe("pending");
  });

  it("reaps a stale item reservation before reporting an active conflict", async () => {
    const database = ensureDatabaseReady();
    const userId = await seedUser();
    const { movieTitleId } = seedTitleAndEpisode(userId);
    const request = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      status: "pending",
    });
    const old = new Date(Date.now() - 20 * 60_000);
    database
      .update(downloadRequests)
      .set({ createdAt: old, updatedAt: old })
      .where(eq(downloadRequests.id, request.id))
      .run();

    const active = await findActiveDownloadRequestForItem({ userId, mediaTitleId: movieTitleId });
    const stored = await findDownloadRequestById(userId, request.id);

    expect(active).toBeNull();
    expect(stored?.status).toBe("failed");
  });

  it("publishes a pending request and all downloader queue ids atomically", async () => {
    const userId = await seedUser();
    const serviceConnectionId = seedUsenetServerConnection(userId);
    const client = await createDownloadClient({
      userId,
      serviceConnectionId,
      clientType: "nooklet",
      displayName: "Built-in downloader",
    });
    const request = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      clientId: client?.id,
      status: "pending",
    });

    const submitted = await recordSubmittedDownload({
      userId,
      requestId: request.id,
      clientId: client?.id,
      externalQueueIds: ["engine-1", "engine-2"],
      sizeBytes: 1234,
      category: "movies",
      statusMessage: "Queued in the built-in downloader.",
    });

    expect(submitted.request.status).toBe("queued");
    expect(submitted.request.externalJobId).toBe("engine-1");
    expect(submitted.queueItems.map((item) => item.externalQueueId).sort()).toEqual(["engine-1", "engine-2"]);
    await expect(recordSubmittedDownload({
      userId,
      requestId: request.id,
      clientId: client?.id,
      externalQueueIds: ["engine-3"],
      statusMessage: "Queued again.",
    })).rejects.toThrow(/no longer pending/);
    expect(ensureDatabaseReady()
      .select()
      .from(downloadQueueItems)
      .where(eq(downloadQueueItems.requestId, request.id))
      .all()).toHaveLength(2);
  });

  it("persists a download client, request, and queue item", async () => {
    const userId = await seedUser();
    const serviceConnectionId = seedUsenetServerConnection(userId);
    const client = await createDownloadClient({
      userId,
      serviceConnectionId,
      clientType: "nooklet",
      displayName: "Built-in downloader",
      status: "verified",
      isDefault: true,
    });

    expect(client).not.toBeNull();
    if (!client) throw new Error("download client missing");

    const request = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      releaseTitle: "Arrival 2016 2160p WEB-DL",
      clientId: client.id,
      status: "pending",
    });
    const queuedRequest = await updateDownloadRequestStatus({
      userId,
      requestId: request.id,
      status: "queued",
      externalJobId: "engine-job-1",
      statusMessage: "Queued in the built-in downloader",
    });
    if (!queuedRequest) throw new Error("queued request missing");

    const queueItem = await recordDownloadQueueItem({
      requestId: request.id,
      userId,
      clientId: client.id,
      externalQueueId: "engine-queue-1",
      status: "downloading",
      progressPercent: 42.5,
      sizeBytes: 20_000_000_000,
      remainingBytes: 11_500_000_000,
      etaSeconds: 600,
      category: "nooklet-movies",
    });

    const reloadedClient = await findDownloadClientById(userId, client.id);
    const reloadedClientByConnection = await findDownloadClientByServiceConnectionId(userId, serviceConnectionId);
    const queuedRequests = await listDownloadRequestsByStatus(userId, "queued");
    const storedQueueItem = ensureDatabaseReady()
      .select()
      .from(downloadQueueItems)
      .where(eq(downloadQueueItems.id, queueItem.id))
      .get();

    expect(reloadedClient?.serviceConnectionId).toBe(serviceConnectionId);
    expect(reloadedClientByConnection?.id).toBe(client.id);
    expect(reloadedClient?.isDefault).toBe(true);
    expect(queuedRequest.externalJobId).toBe("engine-job-1");
    expect(queuedRequests.map((entry) => entry.id)).toEqual([request.id]);
    expect(storedQueueItem?.progressPercent).toBe(42.5);
    expect(storedQueueItem?.category).toBe("nooklet-movies");

    const completedQueueItem = await updateDownloadQueueItemStatus({
      userId,
      queueItemId: queueItem.id,
      status: "completed",
      progressPercent: 100,
      completedAt: new Date("2026-05-07T00:00:00Z"),
    });

    expect(completedQueueItem?.status).toBe("completed");
    expect(completedQueueItem?.progressPercent).toBe(100);
    expect(completedQueueItem?.completedAt).toEqual(new Date("2026-05-07T00:00:00Z"));

    const reloadedRequest = await findDownloadRequestById(userId, request.id);
    const missingRequest = await findDownloadRequestById(userId, randomUUID());
    const recentActivity = await listRecentDownloadRequestsWithQueueItems(userId, 10);

    expect(reloadedRequest?.id).toBe(request.id);
    expect(missingRequest).toBeNull();
    expect(recentActivity).toHaveLength(1);
    expect(recentActivity[0]?.request?.id).toBe(request.id);
    expect(recentActivity[0]?.queueItem?.externalQueueId).toBe("engine-queue-1");
  });

  it("lists active and failed local-import requests for one download client", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const serviceConnectionId = seedUsenetServerConnection(userId);
    const client = await createDownloadClient({
      userId,
      serviceConnectionId,
      clientType: "nooklet",
      displayName: "Built-in downloader",
      status: "verified",
      isDefault: true,
    });

    if (!client) throw new Error("download client missing");

    const request = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      clientId: client.id,
      status: "queued",
    });
    const queueItem = await recordDownloadQueueItem({
      requestId: request.id,
      userId,
      clientId: client.id,
      externalQueueId: "engine-download-1",
      status: "queued",
    });
    const completedRequest = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Blade Runner",
      clientId: client.id,
      status: "succeeded",
    });
    await recordDownloadQueueItem({
      requestId: completedRequest.id,
      userId,
      clientId: client.id,
      externalQueueId: "engine-download-2",
      status: "completed",
    });
    const failedImportRequest = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Solaris",
      clientId: client.id,
      status: "failed",
    });
    const failedImportQueueItem = await recordDownloadQueueItem({
      requestId: failedImportRequest.id,
      userId,
      clientId: client.id,
      externalQueueId: "engine-download-3",
      status: "completed",
    });
    ensureDatabaseReady()
      .update(downloadRequests)
      .set({ updatedAt: new Date("2026-05-07T00:00:00Z") })
      .where(eq(downloadRequests.id, failedImportRequest.id))
      .run();
    const recentFailedImportRequest = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Too Recent",
      clientId: client.id,
      status: "failed",
    });
    await recordDownloadQueueItem({
      requestId: recentFailedImportRequest.id,
      userId,
      clientId: client.id,
      externalQueueId: "engine-download-4",
      status: "completed",
    });
    const requeuingRequest = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Still reconciling",
      clientId: client.id,
      status: "requeuing",
    });
    await recordDownloadQueueItem({
      requestId: requeuingRequest.id,
      userId,
      clientId: client.id,
      externalQueueId: "engine-download-5",
      status: "queued",
    });
    await createDownloadRequest({
      userId: otherUserId,
      mediaType: "movie",
      requestedTitle: "Other",
      status: "queued",
    });

    const activeRequests = await listActiveDownloadRequestsForImport(userId, client.id);
    const activeUserIds = await listUsersWithActiveDownloadRequests();

    expect(activeRequests).toHaveLength(3);
    expect(activeRequests.map((entry) => entry.request.id)).toContain(request.id);
    expect(activeRequests.map((entry) => entry.queueItem.id)).toContain(queueItem.id);
    expect(activeRequests.map((entry) => entry.request.id)).toContain(failedImportRequest.id);
    expect(activeRequests.map((entry) => entry.queueItem.id)).toContain(failedImportQueueItem.id);
    expect(activeRequests.map((entry) => entry.request.id)).toContain(requeuingRequest.id);
    expect(activeRequests.map((entry) => entry.request.id)).not.toContain(recentFailedImportRequest.id);
    expect(activeUserIds).toEqual(expect.arrayContaining([userId, otherUserId]));
  });

  it("finds the active download request for one movie or episode", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const { movieTitleId, episodeTitleId, episodeId } = seedTitleAndEpisode(userId);
    const activeMovieRequest = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      status: "queued",
    });
    const completedMovieRequest = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      status: "succeeded",
    });
    const activeEpisodeRequest = await createDownloadRequest({
      userId,
      mediaType: "tv",
      requestedTitle: "Severance S01E02",
      mediaTitleId: episodeTitleId,
      episodeId,
      status: "downloading",
    });
    await createDownloadRequest({
      userId: otherUserId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      status: "queued",
    });

    const movieRequest = await findActiveDownloadRequestForItem({ userId, mediaTitleId: movieTitleId });
    const episodeRequest = await findActiveDownloadRequestForItem({ userId, mediaTitleId: episodeTitleId, episodeId });

    expect(movieRequest?.id).toBe(activeMovieRequest.id);
    expect(movieRequest?.id).not.toBe(completedMovieRequest.id);
    expect(episodeRequest?.id).toBe(activeEpisodeRequest.id);
  });

  it("lists attempted release exclusions for a movie or episode", async () => {
    const userId = await seedUser();
    const { movieTitleId, episodeTitleId, episodeId } = seedTitleAndEpisode(userId);

    await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      searchResultId: seedSearchResult({
        userId,
        mediaType: "movie",
        title: "Arrival 2016 1080p",
        indexerGuid: "indexer1:arrival-1080p",
      }),
      status: "failed",
    });
    const secondMovieResultId = seedSearchResult({
      userId,
      mediaType: "movie",
      title: "Arrival 2016 2160p",
      indexerGuid: "indexer1:arrival-2160p",
    });
    const secondMovieRequest = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      searchResultId: secondMovieResultId,
      status: "queued",
    });
    const episodeResultId = seedSearchResult({
      userId,
      mediaType: "tv",
      title: "Severance S01E02 1080p",
      indexerGuid: "indexer1:severance-s01e02-1080p",
    });
    const episodeRequest = await createDownloadRequest({
      userId,
      mediaType: "tv",
      requestedTitle: "Severance S01E02",
      mediaTitleId: episodeTitleId,
      episodeId,
      searchResultId: episodeResultId,
      status: "failed",
    });
    await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      searchResultId: null,
      status: "failed",
    });

    const movieExclusions = await listDownloadRequestReleaseExclusionsForItem({ userId, mediaTitleId: movieTitleId });
    const episodeExclusions = await listDownloadRequestReleaseExclusionsForItem({
      userId,
      mediaTitleId: episodeTitleId,
      episodeId,
    });

    expect(movieExclusions.resultIds).toEqual(expect.arrayContaining([
      secondMovieResultId,
    ]));
    expect(movieExclusions.resultIds).toHaveLength(2);
    expect(movieExclusions.releaseKeys).toEqual(expect.arrayContaining([
      "guid:indexer1:arrival-1080p",
      "guid:indexer1:arrival-2160p",
      "title:arrival 2016 1080p",
      "title:arrival 2016 2160p",
    ]));
    expect(secondMovieRequest.searchResultId).toBe(secondMovieResultId);
    expect(episodeRequest.searchResultId).toBe(episodeResultId);
    expect(episodeExclusions.resultIds).toEqual([episodeResultId]);
    expect(episodeExclusions.releaseKeys).toEqual(expect.arrayContaining([
      "guid:indexer1:severance-s01e02-1080p",
      "title:severance s01e02 1080p",
    ]));
  });

  it("counts only budget-consuming release attempts for auto-retry", async () => {
    const database = ensureDatabaseReady();
    const userId = await seedUser();
    const { movieTitleId } = seedTitleAndEpisode(userId);

    const seedAttempt = async (options: {
      title: string;
      guid: string;
      engine: { state: "failed" | "completed"; failureKind: "content" | "infrastructure" | null; downloadedBytes: number } | null;
    }) => {
      const request = await createDownloadRequest({
        userId,
        mediaType: "movie",
        requestedTitle: "Arrival",
        mediaTitleId: movieTitleId,
        searchResultId: seedSearchResult({
          userId,
          mediaType: "movie",
          title: options.title,
          indexerGuid: options.guid,
        }),
        status: "failed",
      });

      if (options.engine) {
        const engineId = randomUUID();

        database
          .insert(engineDownloads)
          .values({
            id: engineId,
            userId,
            name: options.title,
            nzbXml: "<nzb />",
            state: options.engine.state,
            failureKind: options.engine.failureKind,
            downloadedBytes: options.engine.downloadedBytes,
          })
          .run();
        await recordDownloadQueueItem({
          requestId: request.id,
          userId,
          externalQueueId: engineId,
          status: "failed",
        });
      } else {
        await recordDownloadQueueItem({
          requestId: request.id,
          userId,
          externalQueueId: `untracked-${randomUUID()}`,
          status: "failed",
        });
      }
    };

    // Zero-transfer content failure: excluded from search, but budget-free.
    await seedAttempt({
      title: "Arrival 2016 1080p DEAD",
      guid: "indexer1:arrival-dead",
      engine: { state: "failed", failureKind: "content", downloadedBytes: 0 },
    });
    // Partial transfer before failing: consumes budget.
    await seedAttempt({
      title: "Arrival 2016 1080p PARTIAL",
      guid: "indexer1:arrival-partial",
      engine: { state: "failed", failureKind: "content", downloadedBytes: 512 * 1024 * 1024 },
    });
    // A queue record without engine telemetry consumes budget conservatively.
    await seedAttempt({
      title: "Arrival 2016 1080p UNTRACKED",
      guid: "indexer1:arrival-untracked",
      engine: null,
    });

    const consumed = await countBudgetConsumingReleaseAttemptsForItem({
      userId,
      mediaTitleId: movieTitleId,
    });
    const exclusions = await listDownloadRequestReleaseExclusionsForItem({
      userId,
      mediaTitleId: movieTitleId,
    });

    expect(consumed).toBe(2);
    expect(exclusions.resultIds).toHaveLength(3);
  });

  it("persists a download import run and imported files", async () => {
    const userId = await seedUser();
    const { libraryPathId, mediaFileId } = seedImportedMovieFile(userId);
    const request = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      releaseTitle: "Arrival 2016 2160p WEB-DL",
      status: "importing",
      targetLibraryPathId: libraryPathId,
    });
    const importRun = await createDownloadImportRun({
      requestId: request.id,
      userId,
      libraryPathId,
      status: "running",
      sourceRootPath: "C:/Downloads/complete/Arrival",
    });
    const importedFile = await recordDownloadImportedFile({
      importRunId: importRun.id,
      userId,
      mediaFileId,
      sourcePath: "C:/Downloads/complete/Arrival/Arrival.mkv",
      destinationPath: "F:/Media/Movies/Arrival (2016)/Arrival (2016).mkv",
    });
    const completedRun = await completeDownloadImportRun({
      userId,
      importRunId: importRun.id,
      status: "succeeded",
      destinationRootPath: "F:/Media/Movies/Arrival (2016)",
      completedAt: new Date("2026-05-06T12:05:00Z"),
    });

    if (!completedRun) throw new Error("completed import run missing");

    const importedFiles = await listImportedFilesForRun(userId, importRun.id);
    const storedRun = ensureDatabaseReady()
      .select()
      .from(downloadImportRuns)
      .where(eq(downloadImportRuns.id, importRun.id))
      .get();

    expect(completedRun.status).toBe("succeeded");
    expect(storedRun?.destinationRootPath).toBe("F:/Media/Movies/Arrival (2016)");
    expect(importedFiles.map((entry) => entry.id)).toEqual([importedFile.id]);
    expect(importedFiles[0]?.mediaFileId).toBe(mediaFileId);
  });

  it("rejects a second active download request for the same title via the unique index", async () => {
    const userId = await seedUser();
    const { movieTitleId } = seedTitleAndEpisode(userId);

    await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      status: "queued",
    });

    let caught: unknown = null;
    try {
      await createDownloadRequest({
        userId,
        mediaType: "movie",
        requestedTitle: "Arrival",
        mediaTitleId: movieTitleId,
        status: "pending",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(isActiveDownloadRequestUniqueViolation(caught)).toBe(true);
    expect(isActiveDownloadRequestUniqueViolation(new Error("unrelated"))).toBe(false);
  });

  it("allows a fresh active request after the previous one is terminal", async () => {
    const userId = await seedUser();
    const { movieTitleId } = seedTitleAndEpisode(userId);

    const first = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      status: "queued",
    });
    await updateDownloadRequestStatus({
      userId,
      requestId: first.id,
      status: "cancelled",
    });

    const second = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      status: "pending",
    });

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("pending");
  });

  it("lists active and terminal queue attempts for season cancellation cleanup", async () => {
    const userId = await seedUser();
    const { episodeTitleId, seasonId } = seedTitleAndEpisode(userId);
    const fulfillmentId = randomUUID();
    ensureDatabaseReady()
      .insert(downloadFulfillments)
      .values({
        id: fulfillmentId,
        userId,
        mediaTitleId: episodeTitleId,
        seasonId,
        requestedTitle: "Severance Season 1",
        status: "retry_wait",
      })
      .run();

    const attempts = await Promise.all([
      createDownloadRequest({
        userId,
        mediaType: "tv",
        requestedTitle: "Severance Season 1",
        mediaTitleId: episodeTitleId,
        seasonId,
        fulfillmentId,
        status: "failed",
      }),
      createDownloadRequest({
        userId,
        mediaType: "tv",
        requestedTitle: "Severance Season 1",
        mediaTitleId: episodeTitleId,
        seasonId,
        fulfillmentId,
        status: "succeeded",
      }),
      createDownloadRequest({
        userId,
        mediaType: "tv",
        requestedTitle: "Severance Season 1",
        mediaTitleId: episodeTitleId,
        seasonId,
        fulfillmentId,
        status: "queued",
      }),
    ]);
    await Promise.all(attempts.map((attempt, index) => recordDownloadQueueItem({
      requestId: attempt.id,
      userId,
      externalQueueId: `season-attempt-${index + 1}`,
      status: index === 0 ? "failed" : index === 1 ? "completed" : "queued",
    })));

    const entries = await listRequestsForFulfillment(userId, fulfillmentId);

    expect(entries.map((entry) => entry.queueItem.externalQueueId)).toEqual(expect.arrayContaining([
      "season-attempt-1",
      "season-attempt-2",
      "season-attempt-3",
    ]));
    expect(entries.map((entry) => entry.request.status)).toEqual(expect.arrayContaining([
      "failed",
      "succeeded",
      "queued",
    ]));
    expect(entries).toHaveLength(3);
  });

  it("tracks submission time, missing-tick count, and retry count", async () => {
    const userId = await seedUser();
    const { movieTitleId } = seedTitleAndEpisode(userId);
    const request = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      mediaTitleId: movieTitleId,
      status: "pending",
    });

    const submitted = await markDownloadRequestSubmitted({
      userId,
      requestId: request.id,
      externalJobId: "engine-job-x",
    });
    if (!submitted) throw new Error("submitted request missing");
    expect(submitted.status).toBe("queued");
    expect(submitted.submittedAt).not.toBeNull();
    expect(submitted.missingTickCount).toBe(0);

    await incrementDownloadRequestMissingTickCount({ userId, requestId: request.id });
    await incrementDownloadRequestMissingTickCount({ userId, requestId: request.id });
    const afterIncrement = ensureDatabaseReady()
      .select()
      .from(downloadRequests)
      .where(eq(downloadRequests.id, request.id))
      .get();
    expect(afterIncrement?.missingTickCount).toBe(2);

    await resetDownloadRequestMissingTickCount({ userId, requestId: request.id });
    const afterReset = ensureDatabaseReady()
      .select()
      .from(downloadRequests)
      .where(eq(downloadRequests.id, request.id))
      .get();
    expect(afterReset?.missingTickCount).toBe(0);

    await incrementDownloadRequestRetryCount({ userId, requestId: request.id });
    const afterRetry = ensureDatabaseReady()
      .select()
      .from(downloadRequests)
      .where(eq(downloadRequests.id, request.id))
      .get();
    expect(afterRetry?.retryCount).toBe(1);
    expect(afterRetry?.lastRetriedAt).not.toBeNull();
  });

  it("counts an open season fulfillment once and keeps its failed attempts out of attention", async () => {
    const database = ensureDatabaseReady();
    const userId = await seedUser();
    const { episodeTitleId, seasonId, episodeId } = seedTitleAndEpisode(userId);
    const fulfillmentId = randomUUID();

    database.insert(downloadFulfillments).values({
      id: fulfillmentId,
      userId,
      mediaTitleId: episodeTitleId,
      seasonId,
      requestedTitle: "Severance Season 1",
      strategy: "episodes",
      status: "partial",
      packAttemptCount: 1,
      statusMessage: "Using individual episodes: 1 retrying.",
    }).run();

    await createDownloadRequest({
      userId,
      mediaType: "tv",
      mediaTitleId: episodeTitleId,
      seasonId,
      requestedTitle: "Severance Season 1",
      releaseTitle: "Severance.S01.PACK",
      fulfillmentId,
      attemptStrategy: "season_pack",
      attemptNumber: 1,
      status: "failed",
    });
    await createDownloadRequest({
      userId,
      mediaType: "tv",
      mediaTitleId: episodeTitleId,
      seasonId,
      episodeId,
      requestedTitle: "Severance S01E02",
      releaseTitle: "Severance.S01E02.1080p",
      fulfillmentId,
      attemptStrategy: "episode",
      attemptNumber: 1,
      status: "failed",
    });

    const activeStatuses = ["pending", "queued", "downloading", "importing", "requeuing"] as const;
    const activeCount = await countDownloadRequestHistory({
      userId,
      statuses: [...activeStatuses],
    });
    const attentionCount = await countDownloadRequestHistory({
      userId,
      statuses: ["failed", "cancelled"],
    });
    const page = await listDownloadRequestHistoryPage({
      userId,
      statuses: [...activeStatuses],
      limit: 25,
      offset: 0,
    });

    expect(activeCount).toBe(1);
    expect(attentionCount).toBe(0);
    expect(page.total).toBe(1);
    expect(page.rows).toHaveLength(2);
    expect(page.rows.every((row) => row.fulfillment?.id === fulfillmentId)).toBe(true);
  });

  it("hides internal attempt fragments after their library title and plan are removed", async () => {
    const database = ensureDatabaseReady();
    const userId = await seedUser();
    const { episodeTitleId, seasonId, episodeId } = seedTitleAndEpisode(userId);
    const fulfillmentId = randomUUID();

    database.insert(downloadFulfillments).values({
      id: fulfillmentId,
      userId,
      mediaTitleId: episodeTitleId,
      seasonId,
      requestedTitle: "Severance Season 1",
      strategy: "episodes",
      status: "cancelled",
    }).run();
    const attempt = await createDownloadRequest({
      userId,
      mediaType: "tv",
      mediaTitleId: episodeTitleId,
      seasonId,
      episodeId,
      requestedTitle: "Severance S01E02",
      fulfillmentId,
      attemptStrategy: "episode",
      attemptNumber: 1,
      status: "cancelled",
    });
    const standalone = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Standalone Movie",
      status: "cancelled",
    });

    database.delete(mediaTitles).where(eq(mediaTitles.id, episodeTitleId)).run();

    const storedAttempt = await findDownloadRequestById(userId, attempt.id);
    const rows = await listRecentDownloadRequestsWithQueueItems(userId, 10);
    const attentionCount = await countDownloadRequestHistory({
      userId,
      statuses: ["failed", "cancelled"],
    });

    expect(storedAttempt).toMatchObject({
      fulfillmentId: null,
      mediaTitleId: null,
      seasonId: null,
      episodeId: null,
      attemptStrategy: "episode",
    });
    expect(rows.map((row) => row.request?.id)).toEqual([standalone.id]);
    expect(attentionCount).toBe(1);
  });

  it("counts and pages season fulfillments before any physical request exists", async () => {
    const database = ensureDatabaseReady();
    const userId = await seedUser();
    const activeTarget = seedTitleAndEpisode(userId, " Active");
    const blockedTarget = seedTitleAndEpisode(userId, " Blocked");
    const completedTarget = seedTitleAndEpisode(userId, " Completed");

    database.insert(downloadFulfillments).values([
      {
        id: "bare-active-plan",
        userId,
        mediaTitleId: activeTarget.episodeTitleId,
        seasonId: activeTarget.seasonId,
        requestedTitle: "Bare Active Season",
        status: "active",
      },
      {
        id: "bare-blocked-plan",
        userId,
        mediaTitleId: blockedTarget.episodeTitleId,
        seasonId: blockedTarget.seasonId,
        requestedTitle: "Bare Blocked Season",
        status: "blocked",
        statusMessage: "Storage must be fixed.",
      },
      {
        id: "bare-completed-plan",
        userId,
        mediaTitleId: completedTarget.episodeTitleId,
        seasonId: completedTarget.seasonId,
        requestedTitle: "Bare Completed Season",
        status: "succeeded",
      },
    ]).run();

    const activeStatuses = ["pending", "queued", "downloading", "importing", "requeuing"] as const;
    await expect(countDownloadRequestHistory({
      userId,
      statuses: [...activeStatuses],
    })).resolves.toBe(1);
    await expect(countDownloadRequestHistory({
      userId,
      statuses: ["failed", "cancelled"],
    })).resolves.toBe(1);
    await expect(countDownloadRequestHistory({
      userId,
      statuses: ["succeeded"],
    })).resolves.toBe(1);

    const attention = await listDownloadRequestHistoryPage({
      userId,
      statuses: ["failed", "cancelled"],
      query: "Bare Blocked",
      limit: 25,
      offset: 0,
    });
    expect(attention.total).toBe(1);
    expect(attention.rows).toEqual([
      expect.objectContaining({
        request: null,
        queueItem: null,
        fulfillment: expect.objectContaining({ id: "bare-blocked-plan" }),
      }),
    ]);
  });

  it("uses stable kind and id tie-breaks for logical Activity items", async () => {
    const database = ensureDatabaseReady();
    const userId = await seedUser();
    const firstTarget = seedTitleAndEpisode(userId, " First");
    const secondTarget = seedTitleAndEpisode(userId, " Second");
    const tiedAt = new Date("2026-07-15T12:00:00.000Z");

    database.insert(downloadFulfillments).values([
      {
        id: "a-fulfillment",
        userId,
        mediaTitleId: firstTarget.episodeTitleId,
        seasonId: firstTarget.seasonId,
        requestedTitle: "First Season",
        status: "active",
        createdAt: tiedAt,
        updatedAt: tiedAt,
      },
      {
        id: "b-fulfillment",
        userId,
        mediaTitleId: secondTarget.episodeTitleId,
        seasonId: secondTarget.seasonId,
        requestedTitle: "Second Season",
        status: "active",
        createdAt: tiedAt,
        updatedAt: tiedAt,
      },
    ]).run();
    database.insert(downloadRequests).values({
      id: "a-request",
      userId,
      mediaType: "movie",
      requestedTitle: "Standalone Movie",
      status: "queued",
      createdAt: tiedAt,
      updatedAt: tiedAt,
    }).run();

    const first = await listRecentDownloadRequestsWithQueueItems(userId, 10);
    const second = await listRecentDownloadRequestsWithQueueItems(userId, 10);
    const logicalIds = (rows: typeof first) => rows.map((row) => row.fulfillment?.id ?? row.request?.id);

    expect(logicalIds(first)).toEqual(["a-fulfillment", "b-fulfillment", "a-request"]);
    expect(logicalIds(second)).toEqual(logicalIds(first));
  });
});
