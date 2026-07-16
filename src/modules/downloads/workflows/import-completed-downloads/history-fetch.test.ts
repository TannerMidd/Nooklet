import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/workflows/targeted-sabnzbd-history", () => ({
  listTrackedSabnzbdHistory: vi.fn(),
}));

import {
  listTrackedSabnzbdHistory,
} from "@/modules/downloads/workflows/targeted-sabnzbd-history";

import { fetchFinishedSabnzbdHistory } from "./history-fetch";

const listHistoryMock = vi.mocked(listTrackedSabnzbdHistory);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchFinishedSabnzbdHistory", () => {
  it("maps completed, failed, and user-aborted history entries to terminal states", async () => {
    listHistoryMock.mockResolvedValue({
      items: [
        { id: "complete", status: "Completed" },
        { id: "failed", status: "Failed" },
        { id: "aborted", status: "Aborted" },
        { id: "deleted", status: "Deleted" },
        { id: "active", status: "Downloading" },
      ],
    } as never);

    const result = await fetchFinishedSabnzbdHistory(
      "user-1",
      { baseUrl: "http://sab", apiKey: "secret" } as never,
      { historyLimit: 100 } as never,
    );

    expect(result.items.map((item) => [item.id, item.statusKind])).toEqual([
      ["complete", "completed"],
      ["failed", "failed"],
      ["aborted", "failed"],
      ["deleted", "failed"],
    ]);
    expect(listHistoryMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        baseUrl: "http://sab",
        apiKey: "secret",
      }),
      {
        batchSize: 100,
        timeoutMs: 20_000,
      },
    );
  });
});
