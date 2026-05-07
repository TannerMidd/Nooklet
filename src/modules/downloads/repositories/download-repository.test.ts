import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  downloadImportRuns,
  downloadQueueItems,
  mediaFiles,
  mediaLibraries,
  mediaLibraryPaths,
  mediaTitles,
  serviceConnections,
  users,
} from "@/lib/database/schema";

import {
  completeDownloadImportRun,
  createDownloadClient,
  createDownloadImportRun,
  createDownloadRequest,
  findDownloadClientById,
  findDownloadClientByServiceConnectionId,
  listDownloadRequestsByStatus,
  listActiveDownloadRequestsForImport,
  listUsersWithActiveDownloadRequests,
  listImportedFilesForRun,
  recordDownloadImportedFile,
  recordDownloadQueueItem,
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

function seedSabnzbdConnection(userId: string) {
  const database = ensureDatabaseReady();
  const connectionId = randomUUID();

  database
    .insert(serviceConnections)
    .values({
      id: connectionId,
      serviceType: "sabnzbd",
      ownerUserId: userId,
      displayName: "SABnzbd",
      baseUrl: "http://localhost:8080",
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

beforeEach(() => {
  ensureDatabaseReady();
});

describe("download-repository", () => {
  it("persists a download client, request, and queue item", async () => {
    const userId = await seedUser();
    const serviceConnectionId = seedSabnzbdConnection(userId);
    const client = await createDownloadClient({
      userId,
      serviceConnectionId,
      clientType: "sabnzbd",
      displayName: "SABnzbd",
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
      externalJobId: "sab-job-1",
      statusMessage: "Queued in SABnzbd",
    });
    if (!queuedRequest) throw new Error("queued request missing");

    const queueItem = await recordDownloadQueueItem({
      requestId: request.id,
      userId,
      clientId: client.id,
      externalQueueId: "sab-queue-1",
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
    expect(queuedRequest.externalJobId).toBe("sab-job-1");
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
  });

  it("lists active requests that can be matched to SABnzbd history", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const serviceConnectionId = seedSabnzbdConnection(userId);
    const client = await createDownloadClient({
      userId,
      serviceConnectionId,
      clientType: "sabnzbd",
      displayName: "SABnzbd",
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
      externalQueueId: "SABnzbd_nzo_1",
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
      externalQueueId: "SABnzbd_nzo_2",
      status: "completed",
    });
    await createDownloadRequest({
      userId: otherUserId,
      mediaType: "movie",
      requestedTitle: "Other",
      status: "queued",
    });

    const activeRequests = await listActiveDownloadRequestsForImport(userId, client.id);
    const activeUserIds = await listUsersWithActiveDownloadRequests();

    expect(activeRequests).toHaveLength(1);
    expect(activeRequests[0]?.request.id).toBe(request.id);
    expect(activeRequests[0]?.queueItem.id).toBe(queueItem.id);
    expect(activeUserIds).toEqual(expect.arrayContaining([userId, otherUserId]));
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
});
