import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  completeDownloadImportRun: vi.fn(),
  createDownloadImportRun: vi.fn(),
  recordDownloadImportedFile: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  setTvEpisodeHasFile: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-terminal-scheduling", () => ({
  scheduleSeasonFulfillmentAfterRequest: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
  acquireSeasonFulfillmentWorkLease: vi.fn(),
  releaseSeasonFulfillmentWorkLease: vi.fn(),
}));

import {
  createDownloadImportRun,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import { scheduleSeasonFulfillmentAfterRequest } from "@/modules/downloads/workflows/season-fulfillment-terminal-scheduling";
import {
  acquireSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { noPrimaryMediaFilesFoundMessage } from "./file-inspection";
import { persistCompletedDownloadImports } from "./persistence";

const scheduleMock = vi.mocked(scheduleSeasonFulfillmentAfterRequest);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);
const acquireWorkMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseWorkMock = vi.mocked(releaseSeasonFulfillmentWorkLease);
const workLease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "season-fulfillment:fulfillment-1:work",
  expiresAt: new Date("2026-07-15T18:15:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createDownloadImportRun).mockResolvedValue({ id: "import-1" } as never);
  acquireWorkMock.mockResolvedValue(workLease);
  releaseWorkMock.mockResolvedValue(true);
});

describe("completed import recovery ordering", () => {
  it("makes season recovery durable before terminalizing the physical request", async () => {
    await persistCompletedDownloadImports("user-1", [{
      kind: "failed",
      message: "PAR2 verification failed.",
      source: {
        kind: "failed",
        message: "PAR2 verification failed.",
        source: {
          kind: "failed",
          message: "PAR2 verification failed.",
          match: {
            request: {
              id: "request-1",
              mediaTitleId: "title-1",
              seasonId: "season-1",
              episodeId: null,
              fulfillmentId: "fulfillment-1",
              requestedTitle: "Severance S01",
              targetLibraryPathId: "path-1",
            },
            queueItem: { id: "queue-1" },
            historyItem: {
              id: "history-1",
              title: "Severance S01",
              statusKind: "failed",
              failMessage: "PAR2 verification failed.",
              completedAt: new Date(),
              storagePath: null,
            },
          },
        },
      },
    } as never]);

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(updateRequestMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock.mock.invocationCallOrder[0])
      .toBeLessThan(updateRequestMock.mock.invocationCallOrder[0]);
    expect(scheduleMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ fulfillmentId: "fulfillment-1" }),
      expect.objectContaining({ status: "failed" }),
      { workLease },
    );
    expect(releaseWorkMock).toHaveBeenCalledWith(workLease);
  });

  it("classifies a sample-or-extras-only season pack as retryable content", async () => {
    await persistCompletedDownloadImports("user-1", [{
      kind: "failed",
      message: noPrimaryMediaFilesFoundMessage,
      source: {
        kind: "failed",
        message: noPrimaryMediaFilesFoundMessage,
        source: {
          kind: "importable",
          sourceRootPath: "F:/Downloads/Severance.S01",
          match: {
            request: {
              id: "request-1",
              mediaTitleId: "title-1",
              seasonId: "season-1",
              episodeId: null,
              fulfillmentId: "fulfillment-1",
              requestedTitle: "Severance S01",
              targetLibraryPathId: "path-1",
            },
            queueItem: { id: "queue-1" },
            historyItem: {
              id: "history-1",
              title: "Severance S01",
              statusKind: "completed",
              failMessage: null,
              completedAt: new Date(),
              storagePath: "F:/Downloads/Severance.S01",
            },
          },
        },
      },
    } as never]);

    expect(scheduleMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ fulfillmentId: "fulfillment-1" }),
      expect.objectContaining({
        status: "failed",
        retryableContentFailure: true,
      }),
      { workLease },
    );
  });
});
