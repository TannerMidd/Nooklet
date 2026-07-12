import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/apply-download-queue-action", () => ({
  applyDownloadQueueAction: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/get-active-download-queue", () => ({
  getActiveDownloadQueue: vi.fn(),
}));

import { auth } from "@/auth";
import { getActiveDownloadQueue } from "@/modules/service-connections/workflows/get-active-download-queue";

import { GET } from "./route";

const authMock = vi.mocked(auth);
const getActiveDownloadQueueMock = vi.mocked(getActiveDownloadQueue);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("download queue API", () => {
  it("rejects unauthenticated queue refreshes", async () => {
    authMock.mockResolvedValue(null as never);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Unauthorized" });
    expect(getActiveDownloadQueueMock).not.toHaveBeenCalled();
  });

  it("returns the unified download queue for the authenticated user", async () => {
    const queueState = {
      connectionStatus: "verified",
      statusMessage: "No active downloads right now.",
      snapshot: null,
    };

    authMock.mockResolvedValue({ user: { id: "user1" } } as never);
    getActiveDownloadQueueMock.mockResolvedValue(queueState as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(queueState);
    expect(getActiveDownloadQueueMock).toHaveBeenCalledWith("user1");
  });
});
