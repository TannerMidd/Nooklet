import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/notifications/workflows/dispatch-notification/resolve-enabled-channels", () => ({
  resolveEnabledChannels: vi.fn(),
}));
vi.mock("@/modules/notifications/workflows/dispatch-notification/format-message", () => ({
  formatNotificationMessage: vi.fn(),
}));
vi.mock("@/modules/notifications/workflows/dispatch-notification/send-fan-out", () => ({
  sendFanOut: vi.fn(),
}));
vi.mock("@/modules/notifications/workflows/dispatch-notification/persist-result-audit", () => ({
  persistResultAudit: vi.fn(),
}));

import { dispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";
import { formatNotificationMessage } from "@/modules/notifications/workflows/dispatch-notification/format-message";
import { persistResultAudit } from "@/modules/notifications/workflows/dispatch-notification/persist-result-audit";
import { resolveEnabledChannels } from "@/modules/notifications/workflows/dispatch-notification/resolve-enabled-channels";
import { sendFanOut } from "@/modules/notifications/workflows/dispatch-notification/send-fan-out";

const resolveMock = vi.mocked(resolveEnabledChannels);
const formatMock = vi.mocked(formatNotificationMessage);
const fanOutMock = vi.mocked(sendFanOut);
const persistMock = vi.mocked(persistResultAudit);

describe("dispatchNotificationWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits when there are no enabled channels", async () => {
    resolveMock.mockResolvedValue([]);

    const result = await dispatchNotificationWorkflow({
      userId: "user-1",
      payload: {
        eventType: "recommendation_run_succeeded",
        runId: "run-1",
        mediaType: "tv",
        itemCount: 5,
      },
    });

    expect(result).toEqual({
      attemptedChannelCount: 0,
      successfulChannelCount: 0,
      outcomes: [],
    });
    expect(formatMock).not.toHaveBeenCalled();
    expect(fanOutMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("formats the message, fans out, and persists outcomes in order", async () => {
    const channel = {
      id: "ch-1",
      userId: "user-1",
      channelType: "discord" as const,
      displayName: "Test",
      targetUrl: "https://example.test/hook",
      isEnabled: true,
      events: ["recommendation_run_succeeded" as const],
      lastDispatchAt: null,
      lastDispatchStatus: null,
      lastDispatchMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const callOrder: string[] = [];

    resolveMock.mockImplementation(async () => {
      callOrder.push("resolve");
      return [channel];
    });
    formatMock.mockImplementation(() => {
      callOrder.push("format");
      return {
        eventType: "recommendation_run_succeeded",
        title: "t",
        body: "b",
      };
    });
    fanOutMock.mockImplementation(async () => {
      callOrder.push("fanOut");
      return [{ channel, result: { ok: true } }];
    });
    persistMock.mockImplementation(async () => {
      callOrder.push("persist");
    });

    const result = await dispatchNotificationWorkflow({
      userId: "user-1",
      payload: {
        eventType: "recommendation_run_succeeded",
        runId: "run-1",
        mediaType: "movie",
        itemCount: 3,
      },
    });

    expect(callOrder).toEqual(["resolve", "format", "fanOut", "persist"]);
    expect(result.attemptedChannelCount).toBe(1);
    expect(result.successfulChannelCount).toBe(1);
  });
});
