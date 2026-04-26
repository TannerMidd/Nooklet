import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));

vi.mock("@/lib/integrations/sabnzbd", () => ({
  listSabnzbdQueue: vi.fn(),
  moveSabnzbdQueueItemToPosition: vi.fn(),
  pauseSabnzbdQueue: vi.fn(),
  pauseSabnzbdQueueItem: vi.fn(),
  removeSabnzbdQueueItem: vi.fn(),
  resumeSabnzbdQueue: vi.fn(),
  resumeSabnzbdQueueItem: vi.fn(),
}));

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

import {
  listSabnzbdQueue,
  moveSabnzbdQueueItemToPosition,
  pauseSabnzbdQueue,
  removeSabnzbdQueueItem,
  resumeSabnzbdQueue,
} from "@/lib/integrations/sabnzbd";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

import { applySabnzbdQueueAction } from "./apply-sabnzbd-queue-action";

const mockedListSabnzbdQueue = vi.mocked(listSabnzbdQueue);
const mockedMoveSabnzbdQueueItemToPosition = vi.mocked(moveSabnzbdQueueItemToPosition);
const mockedPauseSabnzbdQueue = vi.mocked(pauseSabnzbdQueue);
const mockedRemoveSabnzbdQueueItem = vi.mocked(removeSabnzbdQueueItem);
const mockedResumeSabnzbdQueue = vi.mocked(resumeSabnzbdQueue);
const mockedFindServiceConnectionByType = vi.mocked(findServiceConnectionByType);

describe("applySabnzbdQueueAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
  });

  it("moves a queue item down and returns the refreshed queue state", async () => {
    mockedListSabnzbdQueue
      .mockResolvedValueOnce({
        version: "4.5.2",
        queueStatus: "Downloading",
        paused: false,
        speed: "12.5 M",
        kbPerSec: 12850.4,
        timeLeft: "0:10:00",
        activeQueueCount: 3,
        totalQueueCount: 3,
        items: [
          {
            id: "item-1",
            title: "First",
            status: "Downloading",
            progressPercent: 10,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-2",
            title: "Second",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-3",
            title: "Third",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        version: "4.5.2",
        queueStatus: "Downloading",
        paused: false,
        speed: "12.5 M",
        kbPerSec: 12850.4,
        timeLeft: "0:10:00",
        activeQueueCount: 3,
        totalQueueCount: 3,
        items: [
          {
            id: "item-2",
            title: "Second",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-1",
            title: "First",
            status: "Downloading",
            progressPercent: 10,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-3",
            title: "Third",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
        ],
      });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "move",
        itemId: "item-1",
        direction: "down",
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Moved the SABnzbd queue item down.",
      snapshot: expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ id: "item-1" })]),
      }),
    });

    expect(mockedMoveSabnzbdQueueItemToPosition).toHaveBeenCalledWith({
      baseUrl: "http://sab.local",
      apiKey: "decrypted:encrypted-sab",
      itemId: "item-1",
      position: 1,
    });
  });

  it("moves a queue item directly to a dragged target index", async () => {
    mockedListSabnzbdQueue
      .mockResolvedValueOnce({
        version: "4.5.2",
        queueStatus: "Downloading",
        paused: false,
        speed: "12.5 M",
        kbPerSec: 12850.4,
        timeLeft: "0:10:00",
        activeQueueCount: 3,
        totalQueueCount: 3,
        items: [
          {
            id: "item-1",
            title: "First",
            status: "Downloading",
            progressPercent: 10,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-2",
            title: "Second",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-3",
            title: "Third",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        version: "4.5.2",
        queueStatus: "Downloading",
        paused: false,
        speed: "12.5 M",
        kbPerSec: 12850.4,
        timeLeft: "0:10:00",
        activeQueueCount: 3,
        totalQueueCount: 3,
        items: [
          {
            id: "item-2",
            title: "Second",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-3",
            title: "Third",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-1",
            title: "First",
            status: "Downloading",
            progressPercent: 10,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
        ],
      });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "moveToIndex",
        itemId: "item-1",
        targetIndex: 2,
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Reordered the SABnzbd queue item.",
      snapshot: expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ id: "item-1" })]),
      }),
    });

    expect(mockedMoveSabnzbdQueueItemToPosition).toHaveBeenCalledWith({
      baseUrl: "http://sab.local",
      apiKey: "decrypted:encrypted-sab",
      itemId: "item-1",
      position: 2,
    });
  });

  it("removes a queue item and returns the refreshed queue state", async () => {
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Downloading",
      paused: false,
      speed: "12.5 M",
      kbPerSec: 12850.4,
      timeLeft: "0:10:00",
      activeQueueCount: 1,
      totalQueueCount: 1,
      items: [],
    });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "remove",
        itemId: "item-2",
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Removed the SABnzbd queue item from SABnzbd.",
      snapshot: expect.objectContaining({
        totalQueueCount: 1,
      }),
    });

    expect(mockedRemoveSabnzbdQueueItem).toHaveBeenCalledWith({
      baseUrl: "http://sab.local",
      apiKey: "decrypted:encrypted-sab",
      itemId: "item-2",
    });
  });

  it("pauses the full queue and returns the refreshed queue state", async () => {
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Paused",
      paused: true,
      speed: "0",
      kbPerSec: 0,
      timeLeft: "0:10:00",
      activeQueueCount: 2,
      totalQueueCount: 2,
      items: [],
    });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "pauseQueue",
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Paused the SABnzbd queue.",
      snapshot: expect.objectContaining({
        paused: true,
      }),
    });

    expect(mockedPauseSabnzbdQueue).toHaveBeenCalledWith({
      baseUrl: "http://sab.local",
      apiKey: "decrypted:encrypted-sab",
    });
  });

  it("resumes the full queue and returns the refreshed queue state", async () => {
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Downloading",
      paused: false,
      speed: "12.5 M",
      kbPerSec: 12850.4,
      timeLeft: "0:10:00",
      activeQueueCount: 2,
      totalQueueCount: 2,
      items: [],
    });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "resumeQueue",
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Resumed the SABnzbd queue.",
      snapshot: expect.objectContaining({
        paused: false,
      }),
    });

    expect(mockedResumeSabnzbdQueue).toHaveBeenCalledWith({
      baseUrl: "http://sab.local",
      apiKey: "decrypted:encrypted-sab",
    });
  });
});