import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  downloadImportedFiles,
  downloadImportRuns,
  downloadQueueItems,
  downloadRequests,
  mediaLibraries,
  mediaLibraryPaths,
  users,
} from "@/lib/database/schema";
import {
  createDownloadRequest,
  recordDownloadQueueItem,
} from "@/modules/downloads/repositories/download-repository";

import { persistCompletedDownloadImports } from "./persistence";

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

function seedMoviePath(userId: string) {
  const database = ensureDatabaseReady();
  const libraryId = randomUUID();
  const libraryPathId = randomUUID();

  database.insert(mediaLibraries).values({ id: libraryId, userId, mediaType: "movie", name: "Movies" }).run();
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

  return { libraryId, libraryPathId };
}

beforeEach(() => {
  ensureDatabaseReady();
});

describe("persistCompletedDownloadImports", () => {
  it("records a successful import and completes the download request", async () => {
    const userId = await seedUser();
    const { libraryId, libraryPathId } = seedMoviePath(userId);
    const request = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      status: "queued",
      targetLibraryId: libraryId,
      targetLibraryPathId: libraryPathId,
    });
    const queueItem = await recordDownloadQueueItem({
      requestId: request.id,
      userId,
      externalQueueId: "SABnzbd_nzo_1",
      status: "queued",
    });

    const result = await persistCompletedDownloadImports(userId, [
      {
        kind: "organized",
        destinationRootPath: "F:/Media/Movies/Arrival (2016)",
        files: [
          {
            sourcePath: "C:/Downloads/complete/Arrival/Arrival.mkv",
            destinationPath: "F:/Media/Movies/Arrival (2016)/Arrival (2016).mkv",
          },
        ],
        source: {
          source: {
            sourceRootPath: "C:/Downloads/complete/Arrival",
            target: { path: { id: libraryPathId } },
            match: {
              request,
              queueItem,
              historyItem: {
                id: "SABnzbd_nzo_1",
                statusKind: "completed",
                completedAt: new Date("2026-05-07T00:00:00Z"),
              },
            },
          },
        },
      } as never,
    ]);

    const storedRequest = ensureDatabaseReady()
      .select()
      .from(downloadRequests)
      .where(eq(downloadRequests.id, request.id))
      .get();
    const storedQueueItem = ensureDatabaseReady()
      .select()
      .from(downloadQueueItems)
      .where(eq(downloadQueueItems.id, queueItem.id))
      .get();
    const importRuns = ensureDatabaseReady()
      .select()
      .from(downloadImportRuns)
      .where(eq(downloadImportRuns.requestId, request.id))
      .all();
    const importedFiles = ensureDatabaseReady()
      .select()
      .from(downloadImportedFiles)
      .where(eq(downloadImportedFiles.importRunId, importRuns[0]?.id ?? "missing"))
      .all();

    expect(result).toEqual({
      matchedCount: 1,
      importedCount: 1,
      failedCount: 0,
      importedFileCount: 1,
      affectedLibraryPathIds: [libraryPathId],
    });
    expect(storedRequest?.status).toBe("succeeded");
    expect(storedRequest?.statusMessage).toBe("Imported 1 file into the library.");
    expect(storedQueueItem?.status).toBe("completed");
    expect(storedQueueItem?.progressPercent).toBe(100);
    expect(importRuns).toHaveLength(1);
    expect(importRuns[0]?.status).toBe("succeeded");
    expect(importedFiles).toHaveLength(1);
    expect(importedFiles[0]?.destinationPath).toBe("F:/Media/Movies/Arrival (2016)/Arrival (2016).mkv");
  });

  it("marks failed SABnzbd history items as skipped import runs", async () => {
    const userId = await seedUser();
    const { libraryId, libraryPathId } = seedMoviePath(userId);
    const request = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      status: "queued",
      targetLibraryId: libraryId,
      targetLibraryPathId: libraryPathId,
    });
    const queueItem = await recordDownloadQueueItem({
      requestId: request.id,
      userId,
      externalQueueId: "SABnzbd_nzo_failed",
      status: "queued",
    });

    const result = await persistCompletedDownloadImports(userId, [
      {
        kind: "failed",
        message: "Download failed in SABnzbd.",
        source: {
          kind: "failed",
          message: "Download failed in SABnzbd.",
          source: {
            kind: "failed",
            message: "Download failed in SABnzbd.",
            match: {
              request,
              queueItem,
              historyItem: {
                id: "SABnzbd_nzo_failed",
                title: "Arrival",
                statusKind: "failed",
                storagePath: null,
                completedAt: new Date("2026-05-07T00:00:00Z"),
              },
            },
          },
        },
      } as never,
    ]);

    const storedRequest = ensureDatabaseReady()
      .select()
      .from(downloadRequests)
      .where(eq(downloadRequests.id, request.id))
      .get();
    const storedQueueItem = ensureDatabaseReady()
      .select()
      .from(downloadQueueItems)
      .where(eq(downloadQueueItems.id, queueItem.id))
      .get();
    const importRun = ensureDatabaseReady()
      .select()
      .from(downloadImportRuns)
      .where(eq(downloadImportRuns.requestId, request.id))
      .get();

    expect(result).toEqual({
      matchedCount: 1,
      importedCount: 0,
      failedCount: 1,
      importedFileCount: 0,
      affectedLibraryPathIds: [],
    });
    expect(importRun?.status).toBe("skipped");
    expect(importRun?.sourceRootPath).toBe("Arrival");
    expect(storedQueueItem?.status).toBe("failed");
    expect(storedRequest?.status).toBe("failed");
    expect(storedRequest?.statusMessage).toBe("Download failed in SABnzbd.");
  });
});
