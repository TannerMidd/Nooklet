import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/sabnzbd", () => ({
  listSabnzbdHistory: vi.fn(),
  listSabnzbdQueue: vi.fn(),
  removeSabnzbdHistoryItem: vi.fn(),
  removeSabnzbdQueueItem: vi.fn(),
}));

import {
  listSabnzbdHistory,
  listSabnzbdQueue,
  removeSabnzbdHistoryItem,
  removeSabnzbdQueueItem,
} from "@/lib/integrations/sabnzbd";

import { removeAndVerifySabnzbdItems } from "./verified-sabnzbd-removal";

const listQueueMock = vi.mocked(listSabnzbdQueue);
const listHistoryMock = vi.mocked(listSabnzbdHistory);
const removeQueueMock = vi.mocked(removeSabnzbdQueueItem);
const removeHistoryMock = vi.mocked(removeSabnzbdHistoryItem);
const context = { baseUrl: "http://sab.local", apiKey: "secret" };

function queue(ids: string[], total = ids.length) {
  return {
    items: ids.map((id) => ({ id })),
    totalQueueCount: total,
  } as never;
}

function history(ids: string[], total = ids.length) {
  return {
    items: ids.map((id) => ({ id })),
    totalHistoryCount: total,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  removeQueueMock.mockResolvedValue(undefined);
  removeHistoryMock.mockResolvedValue(undefined);
});

describe("removeAndVerifySabnzbdItems", () => {
  it("rejects a false-positive queue delete while the item remains visible", async () => {
    listQueueMock.mockResolvedValue(queue(["sab-1"]));
    listHistoryMock.mockResolvedValue(history([]));

    const result = await removeAndVerifySabnzbdItems(context, ["sab-1"]);

    expect(result.get("sab-1")).toEqual(expect.objectContaining({
      removed: false,
      message: expect.stringContaining("still reports"),
    }));
    expect(removeQueueMock).toHaveBeenCalledTimes(2);
  });

  it("deletes a job that moves from the queue into history with all files", async () => {
    listQueueMock
      .mockResolvedValueOnce(queue(["sab-1"]))
      .mockResolvedValue(queue([]));
    listHistoryMock
      .mockResolvedValueOnce(history([]))
      .mockResolvedValueOnce(history(["sab-1"]))
      .mockResolvedValueOnce(history([]));

    const result = await removeAndVerifySabnzbdItems(context, ["sab-1"]);

    expect(removeQueueMock).toHaveBeenCalledWith({
      ...context,
      itemId: "sab-1",
    });
    expect(removeHistoryMock).toHaveBeenCalledWith({
      ...context,
      itemId: "sab-1",
    });
    expect(result.get("sab-1")).toEqual({ removed: true });
  });

  it("paginates until it finds a target beyond the first queue page", async () => {
    listQueueMock
      .mockResolvedValueOnce(queue(["other"], 2))
      .mockResolvedValueOnce(queue(["sab-1"], 2))
      .mockResolvedValue(queue([]));
    listHistoryMock.mockResolvedValue(history([]));

    const result = await removeAndVerifySabnzbdItems(context, ["sab-1"]);

    expect(result.get("sab-1")).toEqual({ removed: true });
    expect(listQueueMock).toHaveBeenCalledWith(expect.objectContaining({
      start: 1,
    }));
    expect(removeQueueMock).toHaveBeenCalled();
    expect(removeHistoryMock).not.toHaveBeenCalled();
  });
});
