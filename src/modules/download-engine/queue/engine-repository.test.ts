import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { engineDownloads, users } from "@/lib/database/schema";

import {
  claimNextQueuedEngineDownload,
  createEngineDownload,
  deleteEngineDownload,
  findEngineDownloadById,
  listActiveEngineDownloads,
  listUnimportedFinishedEngineDownloads,
  markEngineDownloadImported,
  requeueStrandedEngineDownloads,
  setEngineDownloadPriority,
  setEngineDownloadState,
  transitionEngineDownloadState,
  updateEngineDownloadProgress,
} from "./engine-repository";

const userId = randomUUID();

async function createUser() {
  const database = ensureDatabaseReady();

  database
    .insert(users)
    .values({
      id: userId,
      email: `${userId}@test.local`,
      passwordHash: "hash",
      displayName: "Engine Tester",
    })
    .onConflictDoNothing()
    .run();
}

function baseInput(overrides: Partial<Parameters<typeof createEngineDownload>[0]> = {}) {
  return {
    userId,
    name: "Test.Release.1080p",
    category: "movies" as const,
    nzbXml: "<nzb><file/></nzb>",
    totalBytes: 1_000_000,
    totalSegments: 10,
    ...overrides,
  };
}

beforeEach(async () => {
  const database = ensureDatabaseReady();
  database.delete(engineDownloads).run();
  await createUser();
});

describe("engine repository", () => {
  it("creates and claims queued downloads in priority order", async () => {
    const low = await createEngineDownload(baseInput({ name: "low", priority: 5 }));
    const high = await createEngineDownload(baseInput({ name: "high", priority: 1 }));

    const claimedFirst = await claimNextQueuedEngineDownload();
    expect(claimedFirst?.id).toBe(high.id);
    expect(claimedFirst?.state).toBe("fetching");

    const claimedSecond = await claimNextQueuedEngineDownload();
    expect(claimedSecond?.id).toBe(low.id);

    expect(await claimNextQueuedEngineDownload()).toBeNull();
  });

  it("tracks progress and terminal state", async () => {
    const record = await createEngineDownload(baseInput());

    await updateEngineDownloadProgress(record.id, {
      downloadedBytes: 500_000,
      completedSegments: 5,
      failedSegments: 1,
    });
    await setEngineDownloadState(record.id, "completed", {
      outputPath: "/data/downloads/complete/x",
      completedAt: new Date(),
    });

    const updated = await findEngineDownloadById(userId, record.id);
    expect(updated?.downloadedBytes).toBe(500_000);
    expect(updated?.completedSegments).toBe(5);
    expect(updated?.state).toBe("completed");
    expect(updated?.outputPath).toBe("/data/downloads/complete/x");
  });

  it("lists finished downloads until they are marked imported", async () => {
    const record = await createEngineDownload(baseInput());
    await setEngineDownloadState(record.id, "completed", { completedAt: new Date() });

    expect(await listUnimportedFinishedEngineDownloads(userId)).toHaveLength(1);

    await markEngineDownloadImported(record.id);

    expect(await listUnimportedFinishedEngineDownloads(userId)).toHaveLength(0);
  });

  it("supports pause/resume transitions and guards invalid ones", async () => {
    const record = await createEngineDownload(baseInput());

    expect(await transitionEngineDownloadState(userId, record.id, ["queued"], "paused")).toBe(true);
    expect(await transitionEngineDownloadState(userId, record.id, ["queued"], "paused")).toBe(false);
    expect(await transitionEngineDownloadState(userId, record.id, ["paused"], "queued")).toBe(true);
  });

  it("requeues stranded in-flight downloads after a restart", async () => {
    const record = await createEngineDownload(baseInput());
    await claimNextQueuedEngineDownload();

    expect((await findEngineDownloadById(userId, record.id))?.state).toBe("fetching");

    await requeueStrandedEngineDownloads();

    expect((await findEngineDownloadById(userId, record.id))?.state).toBe("queued");
  });

  it("orders the active queue by priority for reordering", async () => {
    const first = await createEngineDownload(baseInput({ name: "a" }));
    const second = await createEngineDownload(baseInput({ name: "b" }));

    await setEngineDownloadPriority(userId, first.id, 2);
    await setEngineDownloadPriority(userId, second.id, 1);

    const active = await listActiveEngineDownloads(userId);
    expect(active.map((record) => record.name)).toEqual(["b", "a"]);
  });

  it("deletes downloads", async () => {
    const record = await createEngineDownload(baseInput());

    expect(await deleteEngineDownload(userId, record.id)).toBe(true);
    expect(await findEngineDownloadById(userId, record.id)).toBeNull();
  });
});
