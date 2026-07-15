import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/sabnzbd", () => ({
  removeSabnzbdQueueItem: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  listActiveDownloadRequestsForImport: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
}));

import { removeSabnzbdQueueItem } from "@/lib/integrations/sabnzbd";
import {
  listActiveDownloadRequestsForImport,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";

import { removeDuplicateSabnzbdQueueItems } from "./duplicate-removal";

const removeQueueItemMock = vi.mocked(removeSabnzbdQueueItem);
const listActiveMock = vi.mocked(listActiveDownloadRequestsForImport);
const updateQueueItemMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("removeDuplicateSabnzbdQueueItems", () => {
  it("keeps the most progressed active item and cancels duplicate queue entries", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: { id: "request1", status: "queued", mediaTitleId: "title1", episodeId: null },
        queueItem: {
          id: "queue1",
          status: "queued",
          externalQueueId: "nzo-keep",
          progressPercent: 0,
          createdAt: new Date("2026-05-08T10:00:00Z"),
        },
      },
      {
        request: { id: "request2", status: "queued", mediaTitleId: "title1", episodeId: null },
        queueItem: {
          id: "queue2",
          status: "queued",
          externalQueueId: "nzo-remove",
          progressPercent: 0,
          createdAt: new Date("2026-05-08T10:01:00Z"),
        },
      },
    ] as never);

    const result = await removeDuplicateSabnzbdQueueItems(
      "user1",
      { client: { id: "client1" }, baseUrl: "http://sab", apiKey: "secret" } as never,
      {
        version: null,
        queueStatus: "Downloading",
        paused: false,
        speed: null,
        kbPerSec: null,
        timeLeft: null,
        activeQueueCount: 2,
        totalQueueCount: 2,
        items: [
          { id: "nzo-keep", progressPercent: 7 } as never,
          { id: "nzo-remove", progressPercent: 0 } as never,
        ],
      },
    );

    expect(removeQueueItemMock).toHaveBeenCalledWith({
      baseUrl: "http://sab",
      apiKey: "secret",
      itemId: "nzo-remove",
    });
    expect(updateQueueItemMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user1",
      queueItemId: "queue2",
      status: "failed",
    }));
    expect(updateRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user1",
      requestId: "request2",
      status: "cancelled",
      externalJobId: "nzo-remove",
    }));
    expect(result).toEqual({ duplicateGroupCount: 1, keptCount: 1, removedCount: 1, failedCount: 0 });
  });

  it("ignores repeated titles that are different episodes", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: { id: "request1", status: "queued", mediaTitleId: "title1", episodeId: "episode1" },
        queueItem: { id: "queue1", status: "queued", externalQueueId: "nzo-1", createdAt: new Date() },
      },
      {
        request: { id: "request2", status: "queued", mediaTitleId: "title1", episodeId: "episode2" },
        queueItem: { id: "queue2", status: "queued", externalQueueId: "nzo-2", createdAt: new Date() },
      },
    ] as never);

    const result = await removeDuplicateSabnzbdQueueItems(
      "user1",
      { client: { id: "client1" }, baseUrl: "http://sab", apiKey: "secret" } as never,
      {
        version: null,
        queueStatus: "Downloading",
        paused: false,
        speed: null,
        kbPerSec: null,
        timeLeft: null,
        activeQueueCount: 2,
        totalQueueCount: 2,
        items: [{ id: "nzo-1" } as never, { id: "nzo-2" } as never],
      },
    );

    expect(removeQueueItemMock).not.toHaveBeenCalled();
    expect(result).toEqual({ duplicateGroupCount: 0, keptCount: 0, removedCount: 0, failedCount: 0 });
  });

  it("does not conflate packs for different seasons", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: {
          id: "request1",
          status: "queued",
          mediaTitleId: "title1",
          episodeId: null,
          seasonId: "season1",
        },
        queueItem: { id: "queue1", status: "queued", externalQueueId: "nzo-1", createdAt: new Date() },
      },
      {
        request: {
          id: "request2",
          status: "queued",
          mediaTitleId: "title1",
          episodeId: null,
          seasonId: "season2",
        },
        queueItem: { id: "queue2", status: "queued", externalQueueId: "nzo-2", createdAt: new Date() },
      },
    ] as never);

    const result = await removeDuplicateSabnzbdQueueItems(
      "user1",
      { client: { id: "client1" }, baseUrl: "http://sab", apiKey: "secret" } as never,
      {
        version: null,
        queueStatus: "Downloading",
        paused: false,
        speed: null,
        kbPerSec: null,
        timeLeft: null,
        activeQueueCount: 2,
        totalQueueCount: 2,
        items: [{ id: "nzo-1" } as never, { id: "nzo-2" } as never],
      },
    );

    expect(removeQueueItemMock).not.toHaveBeenCalled();
    expect(result.duplicateGroupCount).toBe(0);
  });
});
