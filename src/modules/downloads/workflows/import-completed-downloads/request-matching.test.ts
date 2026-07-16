import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  findDownloadRequestById: vi.fn(),
  listActiveDownloadRequestsForImport: vi.fn(),
  listDownloadQueueItemsForRequest: vi.fn(),
}));

import {
  findDownloadRequestById,
  listActiveDownloadRequestsForImport,
  listDownloadQueueItemsForRequest,
} from "@/modules/downloads/repositories/download-repository";

import { matchFinishedHistoryToDownloads } from "./request-matching";

const findRequestMock = vi.mocked(findDownloadRequestById);
const listActiveMock = vi.mocked(listActiveDownloadRequestsForImport);
const listQueueItemsMock = vi.mocked(listDownloadQueueItemsForRequest);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("matchFinishedHistoryToDownloads", () => {
  it("matches a request-scoped retry without relying on global cooldown eligibility", async () => {
    const request = {
      id: "request-1",
      clientId: "client-1",
      cancellationRequestedAt: null,
    };
    const queueItem = {
      id: "queue-1",
      externalQueueId: "sab-target",
    };
    findRequestMock.mockResolvedValue(request as never);
    listQueueItemsMock.mockResolvedValue([queueItem] as never);

    const result = await matchFinishedHistoryToDownloads(
      "user-1",
      { client: { id: "client-1" } } as never,
      {
        items: [{
          id: "sab-target",
          status: "Completed",
          statusKind: "completed",
        }],
      } as never,
      { requestId: "request-1" },
    );

    expect(result).toEqual([expect.objectContaining({
      request,
      queueItem,
      historyItem: expect.objectContaining({ id: "sab-target" }),
    })]);
    expect(listActiveMock).not.toHaveBeenCalled();
  });

  it("does not cross tenant or client boundaries for a targeted retry", async () => {
    findRequestMock.mockResolvedValue({
      id: "request-1",
      clientId: "another-client",
      cancellationRequestedAt: null,
    } as never);
    listQueueItemsMock.mockResolvedValue([{
      id: "queue-1",
      clientId: "another-client",
      externalQueueId: "sab-target",
    }] as never);

    await expect(matchFinishedHistoryToDownloads(
      "user-1",
      { client: { id: "client-1" } } as never,
      { items: [{ id: "sab-target", statusKind: "completed" }] } as never,
      { requestId: "request-1" },
    )).resolves.toEqual([]);
    expect(listQueueItemsMock).toHaveBeenCalledWith("user-1", "request-1");
  });

  it("uses the queue item's client when a request contains cross-client attempts", async () => {
    const request = {
      id: "request-1",
      clientId: "engine-client",
      cancellationRequestedAt: null,
    };
    const sabQueueItem = {
      id: "queue-sab",
      clientId: "sab-client",
      externalQueueId: "sab-target",
    };
    findRequestMock.mockResolvedValue(request as never);
    listQueueItemsMock.mockResolvedValue([
      sabQueueItem,
      {
        id: "queue-engine",
        clientId: "engine-client",
        externalQueueId: "engine-target",
      },
    ] as never);

    const result = await matchFinishedHistoryToDownloads(
      "user-1",
      { client: { id: "sab-client" } } as never,
      {
        items: [{
          id: "sab-target",
          status: "Completed",
          statusKind: "completed",
        }],
      } as never,
      { requestId: "request-1" },
    );

    expect(result).toEqual([expect.objectContaining({
      request,
      queueItem: sabQueueItem,
    })]);
  });
});
