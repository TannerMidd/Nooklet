import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/sabnzbd", () => ({
  listSabnzbdHistory: vi.fn(),
}));

import { listSabnzbdHistory } from "@/lib/integrations/sabnzbd";

import { fetchFinishedSabnzbdHistory } from "./history-fetch";

const listHistoryMock = vi.mocked(listSabnzbdHistory);

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
      { baseUrl: "http://sab", apiKey: "secret" } as never,
      { historyLimit: 100 } as never,
    );

    expect(result.items.map((item) => [item.id, item.statusKind])).toEqual([
      ["complete", "completed"],
      ["failed", "failed"],
      ["aborted", "failed"],
      ["deleted", "failed"],
    ]);
  });
});
