import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/sabnzbd", () => ({
  verifySabnzbdConnection: vi.fn(),
}));

import { verifySabnzbdConnection } from "@/lib/integrations/sabnzbd";

import { verifySabnzbd } from "./verify-sabnzbd";
import type { VerifyServiceConnectionInput } from "./verify-service-connection-types";

const verifySabnzbdConnectionMock = vi.mocked(verifySabnzbdConnection);

function buildInput(overrides: Partial<VerifyServiceConnectionInput> = {}): VerifyServiceConnectionInput {
  return {
    serviceType: "sabnzbd",
    baseUrl: "https://nzb.test",
    secret: "sab-api-key",
    metadata: null,
    ...overrides,
  };
}

type QueueSnapshot = Awaited<ReturnType<typeof verifySabnzbdConnection>>;

function buildSnapshot(overrides: Partial<QueueSnapshot> = {}): QueueSnapshot {
  return {
    version: "4.1.0",
    queueStatus: "Idle",
    paused: false,
    activeQueueCount: 0,
    speed: "0 B/s",
    timeLeft: "0:00:00",
    ...overrides,
  } as QueueSnapshot;
}

describe("verifySabnzbd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards baseUrl and the secret as apiKey", async () => {
    verifySabnzbdConnectionMock.mockResolvedValue(buildSnapshot());

    await verifySabnzbd(buildInput());

    expect(verifySabnzbdConnectionMock).toHaveBeenCalledTimes(1);
    expect(verifySabnzbdConnectionMock).toHaveBeenCalledWith({
      baseUrl: "https://nzb.test",
      apiKey: "sab-api-key",
    });
  });

  it("returns success with the SABnzbd version and singular queue noun", async () => {
    verifySabnzbdConnectionMock.mockResolvedValue(
      buildSnapshot({ version: "4.1.0", activeQueueCount: 1 }),
    );

    const result = await verifySabnzbd(buildInput());

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Connected to SABnzbd 4.1.0. 1 active queue item.");
  });

  it("uses the plural queue noun for any count other than one", async () => {
    verifySabnzbdConnectionMock.mockResolvedValue(
      buildSnapshot({ version: "4.1.0", activeQueueCount: 3 }),
    );

    const result = await verifySabnzbd(buildInput());

    expect(result.message).toBe("Connected to SABnzbd 4.1.0. 3 active queue items.");
  });

  it("falls back to a version-less message when the server omits a version string", async () => {
    verifySabnzbdConnectionMock.mockResolvedValue(
      buildSnapshot({ version: null, activeQueueCount: 0 }),
    );

    const result = await verifySabnzbd(buildInput());

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Connected to SABnzbd. 0 active queue items.");
  });

  it("maps the integration snapshot fields into the persisted metadata shape", async () => {
    verifySabnzbdConnectionMock.mockResolvedValue(
      buildSnapshot({
        version: "4.1.0",
        queueStatus: "Downloading",
        paused: true,
        activeQueueCount: 2,
        speed: "12.3 MB/s",
        timeLeft: "0:01:23",
      }),
    );

    const result = await verifySabnzbd(buildInput());

    expect(result.metadata).toEqual({
      version: "4.1.0",
      queueStatus: "Downloading",
      queuePaused: true,
      activeQueueCount: 2,
      speed: "12.3 MB/s",
      timeLeft: "0:01:23",
    });
  });

  it("translates a thrown Error into a failure result with the message preserved", async () => {
    verifySabnzbdConnectionMock.mockRejectedValue(new Error("HTTP 502 from SABnzbd"));

    const result = await verifySabnzbd(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "HTTP 502 from SABnzbd",
    });
  });

  it("never includes the API key in the failure message", async () => {
    verifySabnzbdConnectionMock.mockRejectedValue(new Error("HTTP 401"));

    const result = await verifySabnzbd(buildInput({ secret: "sab-leak-key-xyz" }));

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("sab-leak-key-xyz");
  });

  it("translates a non-Error throw into a stable generic failure message", async () => {
    verifySabnzbdConnectionMock.mockImplementation(async () => {
      throw { apiKey: "sab-leak-key" };
    });

    const result = await verifySabnzbd(buildInput({ secret: "sab-leak-key" }));

    expect(result).toEqual({
      ok: false,
      message: "Connection verification failed unexpectedly.",
    });
    expect(JSON.stringify(result)).not.toContain("sab-leak-key");
  });
});
