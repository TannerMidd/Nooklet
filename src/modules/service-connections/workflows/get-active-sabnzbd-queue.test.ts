import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));

vi.mock("@/lib/integrations/sabnzbd", () => ({
  listSabnzbdQueue: vi.fn(),
}));

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

import { listSabnzbdQueue } from "@/lib/integrations/sabnzbd";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

import { getActiveSabnzbdQueue } from "./get-active-sabnzbd-queue";

const mockedListSabnzbdQueue = vi.mocked(listSabnzbdQueue);
const mockedFindServiceConnectionByType = vi.mocked(findServiceConnectionByType);

describe("getActiveSabnzbdQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disconnected when SABnzbd is not configured", async () => {
    mockedFindServiceConnectionByType.mockResolvedValue(null);

    await expect(getActiveSabnzbdQueue("user-1")).resolves.toEqual({
      connectionStatus: "disconnected",
      statusMessage: "Connect SABnzbd to track active request progress.",
      snapshot: null,
    });
  });

  it("returns the active queue snapshot when SABnzbd is verified", async () => {
    mockedFindServiceConnectionByType.mockResolvedValue({
      connection: {
        id: "sab-1",
        serviceType: "sabnzbd",
        ownershipScope: "user",
        ownerUserId: "user-1",
        displayName: "SABnzbd",
        baseUrl: "http://sab.local",
        status: "verified",
        statusMessage: "verified",
        metadataJson: null,
        lastVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      secret: {
        connectionId: "sab-1",
        encryptedValue: "encrypted-sab",
        maskedValue: "***",
        updatedAt: new Date(),
      },
      metadata: null,
    } as never);
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Downloading",
      paused: false,
      speed: "12.5 M",
      kbPerSec: 12850.4,
      timeLeft: "0:10:00",
      activeQueueCount: 1,
      totalQueueCount: 1,
      items: [
        {
          id: "SABnzbd_nzo_1",
          title: "Show.Name.S01E01",
          status: "Downloading",
          progressPercent: 50,
          timeLeft: "0:05:00",
          category: "tv",
          priority: "Normal",
          labels: [],
          sizeLabel: "10 GB",
          sizeLeftLabel: "5 GB",
          totalMb: 10240,
          remainingMb: 5120,
        },
      ],
    });

    await expect(getActiveSabnzbdQueue("user-1")).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "1 active SABnzbd request.",
      snapshot: expect.objectContaining({
        activeQueueCount: 1,
        queueStatus: "Downloading",
      }),
    });
  });
});