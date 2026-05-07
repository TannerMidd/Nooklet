import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/apply-sabnzbd-queue-action", () => ({
  applySabnzbdQueueAction: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/refresh-sabnzbd-queue-activity", () => ({
  refreshSabnzbdQueueActivity: vi.fn(),
}));

import { auth } from "@/auth";
import { refreshSabnzbdQueueActivity } from "@/modules/service-connections/workflows/refresh-sabnzbd-queue-activity";

import { GET } from "./route";

const authMock = vi.mocked(auth);
const refreshSabnzbdQueueActivityMock = vi.mocked(refreshSabnzbdQueueActivity);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SABnzbd queue API", () => {
  it("rejects unauthenticated queue refreshes", async () => {
    authMock.mockResolvedValue(null as never);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Unauthorized" });
    expect(refreshSabnzbdQueueActivityMock).not.toHaveBeenCalled();
  });

  it("refreshes SABnzbd activity for the authenticated user", async () => {
    const queueState = {
      connectionStatus: "verified",
      statusMessage: "No active SABnzbd requests right now.",
      snapshot: null,
    };

    authMock.mockResolvedValue({ user: { id: "user1" } } as never);
    refreshSabnzbdQueueActivityMock.mockResolvedValue(queueState as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(queueState);
    expect(refreshSabnzbdQueueActivityMock).toHaveBeenCalledWith("user1");
  });
});