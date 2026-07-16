import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/sabnzbd", () => ({
  listSabnzbdHistory: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  findDownloadRequestById: vi.fn(),
  listActiveDownloadRequestsForImport: vi.fn(),
  listDownloadQueueItemsForRequest: vi.fn(),
}));

import { listSabnzbdHistory } from "@/lib/integrations/sabnzbd";
import {
  findDownloadRequestById,
  listActiveDownloadRequestsForImport,
  listDownloadQueueItemsForRequest,
} from "@/modules/downloads/repositories/download-repository";

import {
  listTargetedSabnzbdHistory,
  listTrackedSabnzbdHistory,
} from "./targeted-sabnzbd-history";

const listHistoryMock = vi.mocked(listSabnzbdHistory);
const findRequestMock = vi.mocked(findDownloadRequestById);
const listActiveMock = vi.mocked(listActiveDownloadRequestsForImport);
const listQueueItemsMock = vi.mocked(listDownloadQueueItemsForRequest);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("targeted SABnzbd history", () => {
  it("batches and combines every targeted job instead of truncating by recency", async () => {
    listHistoryMock
      .mockResolvedValueOnce({
        items: [
          { id: "sab-2", status: "Completed" },
          { id: "untracked", status: "Completed" },
        ],
      } as never)
      .mockResolvedValueOnce({
        items: [{ id: "sab-3", status: "Failed" }],
      } as never);

    const result = await listTargetedSabnzbdHistory({
      baseUrl: "http://sab",
      apiKey: "secret",
      externalQueueIds: ["sab-1", "sab-2", "sab-3", "sab-2"],
      batchSize: 2,
      timeoutMs: 20_000,
    });

    expect(listHistoryMock).toHaveBeenNthCalledWith(1, {
      baseUrl: "http://sab",
      apiKey: "secret",
      limit: 2,
      nzoIds: ["sab-1", "sab-2"],
      timeoutMs: 20_000,
    });
    expect(listHistoryMock).toHaveBeenNthCalledWith(2, {
      baseUrl: "http://sab",
      apiKey: "secret",
      limit: 1,
      nzoIds: ["sab-3"],
      timeoutMs: 20_000,
    });
    expect(result.items.map((item) => item.id)).toEqual(["sab-2", "sab-3"]);
    expect(result.totalHistoryCount).toBe(2);
  });

  it("targets the external ids for every active request owned by the client", async () => {
    listActiveMock.mockResolvedValue([
      { queueItem: { externalQueueId: "sab-old" } },
      { queueItem: { externalQueueId: "sab-new" } },
    ] as never);
    listHistoryMock.mockResolvedValue({ items: [] } as never);

    await listTrackedSabnzbdHistory("user-1", {
      client: { id: "client-1" },
      baseUrl: "http://sab",
      apiKey: "secret",
    });

    expect(listActiveMock).toHaveBeenCalledWith("user-1", "client-1");
    expect(listHistoryMock).toHaveBeenCalledWith(expect.objectContaining({
      nzoIds: ["sab-old", "sab-new"],
    }));
  });

  it("targets one requested import even while the global retry cooldown excludes it", async () => {
    findRequestMock.mockResolvedValue({
      id: "request-1",
      clientId: "client-1",
      cancellationRequestedAt: null,
    } as never);
    listQueueItemsMock.mockResolvedValue([
      { externalQueueId: "sab-target" },
    ] as never);
    listHistoryMock.mockResolvedValue({ items: [] } as never);

    await listTrackedSabnzbdHistory(
      "user-1",
      {
        client: { id: "client-1" },
        baseUrl: "http://sab",
        apiKey: "secret",
      },
      { requestId: "request-1" },
    );

    expect(findRequestMock).toHaveBeenCalledWith("user-1", "request-1");
    expect(listQueueItemsMock).toHaveBeenCalledWith("user-1", "request-1");
    expect(listActiveMock).not.toHaveBeenCalled();
    expect(listHistoryMock).toHaveBeenCalledWith(expect.objectContaining({
      nzoIds: ["sab-target"],
    }));
  });

  it("targets only queue items owned by SAB when a request spans clients", async () => {
    findRequestMock.mockResolvedValue({
      id: "request-1",
      clientId: "engine-client",
      cancellationRequestedAt: null,
    } as never);
    listQueueItemsMock.mockResolvedValue([
      {
        externalQueueId: "sab-target",
        clientId: "sab-client",
      },
      {
        externalQueueId: "engine-target",
        clientId: "engine-client",
      },
    ] as never);
    listHistoryMock.mockResolvedValue({ items: [] } as never);

    await listTrackedSabnzbdHistory(
      "user-1",
      {
        client: { id: "sab-client" },
        baseUrl: "http://sab",
        apiKey: "secret",
      },
      { requestId: "request-1" },
    );

    expect(listHistoryMock).toHaveBeenCalledWith(expect.objectContaining({
      nzoIds: ["sab-target"],
    }));
  });
});
