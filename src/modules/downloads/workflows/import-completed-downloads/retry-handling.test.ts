import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  countBudgetConsumingReleaseAttemptsForItem: vi.fn(),
  listDownloadRequestReleaseExclusionsForItem: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
  attachDownloadRequestToFulfillment: vi.fn(),
  findDownloadFulfillmentById: vi.fn(),
  updateDownloadFulfillment: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment", () => ({
  createSeasonFulfillment: vi.fn(),
  markFulfillmentEpisodeFailedAndRetry: vi.fn(),
  markFulfillmentEpisodeSucceeded: vi.fn(),
  markSeasonPackFailedAndRecover: vi.fn(),
  reconcileSeasonCoverage: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  findTvEpisodeByIdForUser: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-library-item-releases", () => ({
  searchLibraryItemReleasesWorkflow: vi.fn(),
}));

import {
  countBudgetConsumingReleaseAttemptsForItem,
  listDownloadRequestReleaseExclusionsForItem,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import {
  attachDownloadRequestToFulfillment,
  findDownloadFulfillmentById,
  updateDownloadFulfillment,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
  createSeasonFulfillment,
  markSeasonPackFailedAndRecover,
  reconcileSeasonCoverage,
} from "@/modules/downloads/workflows/season-fulfillment";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import {
  noMediaFilesFoundMessage,
  noPrimaryMediaFilesFoundMessage,
} from "./file-inspection";
import { retryFailedCompletedDownloads } from "./retry-handling";

const listAttemptedReleasesMock = vi.mocked(listDownloadRequestReleaseExclusionsForItem);
const countConsumingAttemptsMock = vi.mocked(countBudgetConsumingReleaseAttemptsForItem);
const updateRequestStatusMock = vi.mocked(updateDownloadRequestStatus);
const attachToFulfillmentMock = vi.mocked(attachDownloadRequestToFulfillment);
const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const updateFulfillmentMock = vi.mocked(updateDownloadFulfillment);
const createSeasonFulfillmentMock = vi.mocked(createSeasonFulfillment);
const recoverSeasonPackMock = vi.mocked(markSeasonPackFailedAndRecover);
const reconcileSeasonCoverageMock = vi.mocked(reconcileSeasonCoverage);
const searchLibraryItemReleasesMock = vi.mocked(searchLibraryItemReleasesWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
  listAttemptedReleasesMock.mockResolvedValue({
    resultIds: ["cbd43b73-6987-4652-91df-e8aa2bfa5761"],
    releaseKeys: ["title:star trek 2009 1080p bdrip aac 7 1 x265 10bit markii"],
  });
  countConsumingAttemptsMock.mockResolvedValue(1);
  searchLibraryItemReleasesMock.mockResolvedValue({
    queuedDownload: { queued: true },
  } as never);
  findFulfillmentMock.mockResolvedValue(null);
  reconcileSeasonCoverageMock.mockResolvedValue(null);
});

describe("retryFailedCompletedDownloads", () => {
  it("re-searches and queues the next release after a downloader failure", async () => {
    const result = await retryFailedCompletedDownloads("user1", [
      {
        kind: "failed",
        message: "The built-in downloader reported that the download failed.",
        source: {
          kind: "failed",
          message: "The built-in downloader reported that the download failed.",
          source: {
            kind: "failed",
            message: "The built-in downloader reported that the download failed.",
            match: {
              request: {
                mediaTitleId: "b411e2d6-3a82-4d8a-bb18-053bb6e44b29",
                episodeId: null,
                targetLibraryPathId: "f8496196-4656-48f5-bc51-90a544c89e2a",
              },
              historyItem: { statusKind: "failed" },
            },
          },
        },
      } as never,
    ]);

    expect(result).toEqual({ attemptedCount: 1, queuedCount: 1, failedCount: 0 });
    expect(listAttemptedReleasesMock).toHaveBeenCalledWith({
      userId: "user1",
      mediaTitleId: "b411e2d6-3a82-4d8a-bb18-053bb6e44b29",
      episodeId: null,
    });
    expect(searchLibraryItemReleasesMock).toHaveBeenCalledWith("user1", {
      titleId: "b411e2d6-3a82-4d8a-bb18-053bb6e44b29",
      targetLibraryPathId: "f8496196-4656-48f5-bc51-90a544c89e2a",
      excludedResultIds: ["cbd43b73-6987-4652-91df-e8aa2bfa5761"],
      excludedReleaseKeys: ["title:star trek 2009 1080p bdrip aac 7 1 x265 10bit markii"],
    });
  });

  it("only retries once for duplicate failed attempts of the same item", async () => {
    const failedDownload = {
      kind: "failed",
      message: "The built-in downloader reported that the download failed.",
      source: {
        kind: "failed",
        message: "The built-in downloader reported that the download failed.",
        source: {
          kind: "failed",
          message: "The built-in downloader reported that the download failed.",
          match: {
            request: {
              mediaTitleId: "b411e2d6-3a82-4d8a-bb18-053bb6e44b29",
              episodeId: null,
              targetLibraryPathId: "f8496196-4656-48f5-bc51-90a544c89e2a",
            },
            historyItem: { statusKind: "failed" },
          },
        },
      },
    } as never;

    const result = await retryFailedCompletedDownloads("user1", [failedDownload, failedDownload]);

    expect(result).toEqual({ attemptedCount: 1, queuedCount: 1, failedCount: 0 });
    expect(searchLibraryItemReleasesMock).toHaveBeenCalledTimes(1);
  });

  it("stops auto-retry once budget-consuming attempts reach the cap", async () => {
    countConsumingAttemptsMock.mockResolvedValue(3);

    const result = await retryFailedCompletedDownloads("user1", [
      {
        kind: "failed",
        message: "The download failed.",
        source: {
          kind: "failed",
          message: "The download failed.",
          source: {
            kind: "failed",
            match: {
              request: {
                id: "req-1",
                mediaTitleId: "b411e2d6-3a82-4d8a-bb18-053bb6e44b29",
                episodeId: null,
                targetLibraryPathId: "f8496196-4656-48f5-bc51-90a544c89e2a",
              },
              historyItem: { statusKind: "failed", downloadedBytes: 1024 },
            },
          },
        },
      } as never,
    ]);

    expect(result).toEqual({ attemptedCount: 0, queuedCount: 0, failedCount: 0 });
    expect(searchLibraryItemReleasesMock).not.toHaveBeenCalled();
    expect(updateRequestStatusMock).toHaveBeenCalledWith(expect.objectContaining({
      statusMessage: expect.stringContaining("Auto-retry stopped after 3 failed download attempts"),
    }));
  });

  it("keeps cycling to new releases when prior attempts were zero-transfer abandons", async () => {
    // Five releases already excluded, but none consumed the budget: every
    // attempt was a dead post the engine rejected before downloading.
    countConsumingAttemptsMock.mockResolvedValue(0);
    listAttemptedReleasesMock.mockResolvedValue({
      resultIds: ["r1", "r2", "r3", "r4", "r5"],
      releaseKeys: [],
    });

    const result = await retryFailedCompletedDownloads("user1", [
      {
        kind: "failed",
        message: "The download failed.",
        source: {
          kind: "failed",
          message: "The download failed.",
          source: {
            kind: "failed",
            match: {
              request: {
                id: "req-1",
                mediaTitleId: "b411e2d6-3a82-4d8a-bb18-053bb6e44b29",
                episodeId: null,
                targetLibraryPathId: "f8496196-4656-48f5-bc51-90a544c89e2a",
              },
              historyItem: { statusKind: "failed", downloadedBytes: 0 },
            },
          },
        },
      } as never,
    ]);

    expect(result).toEqual({ attemptedCount: 1, queuedCount: 1, failedCount: 0 });
    expect(searchLibraryItemReleasesMock).toHaveBeenCalledWith("user1", expect.objectContaining({
      excludedResultIds: ["r1", "r2", "r3", "r4", "r5"],
    }));
  });

  it("does not retry a failed duplicate when the same item imported successfully", async () => {
    const mediaTitleId = "b411e2d6-3a82-4d8a-bb18-053bb6e44b29";
    const failedDuplicate = {
      kind: "failed",
      message: "The built-in downloader reported that the download failed.",
      source: {
        kind: "failed",
        message: "The built-in downloader reported that the download failed.",
        source: {
          kind: "failed",
          message: "The built-in downloader reported that the download failed.",
          match: {
            request: {
              mediaTitleId,
              episodeId: null,
              targetLibraryPathId: "f8496196-4656-48f5-bc51-90a544c89e2a",
            },
            historyItem: { statusKind: "failed" },
          },
        },
      },
    } as never;
    const successfulImport = {
      kind: "organized",
      source: {
        source: {
          match: {
            request: {
              mediaTitleId,
              episodeId: null,
            },
          },
        },
      },
      destinationRootPath: "F:/Media/Movies/Star Trek (2009)",
      files: [{ sourcePath: "F:/Downloads/Star Trek.mkv", destinationPath: "F:/Media/Movies/Star Trek (2009).mkv" }],
    } as never;

    const result = await retryFailedCompletedDownloads("user1", [successfulImport, failedDuplicate]);

    expect(result).toEqual({ attemptedCount: 0, queuedCount: 0, failedCount: 0 });
    expect(searchLibraryItemReleasesMock).not.toHaveBeenCalled();
  });

  it("does not retry filesystem organization failures", async () => {
    const result = await retryFailedCompletedDownloads("user1", [
      {
        kind: "failed",
        message: "EPERM: operation not permitted",
        source: {
          kind: "ready",
          source: {
            match: {
              request: {
                mediaTitleId: "b411e2d6-3a82-4d8a-bb18-053bb6e44b29",
              },
              historyItem: { statusKind: "completed" },
            },
          },
        },
      } as never,
    ]);

    expect(result).toEqual({ attemptedCount: 0, queuedCount: 0, failedCount: 0 });
    expect(searchLibraryItemReleasesMock).not.toHaveBeenCalled();
  });

  it("re-searches after a completed download contains no media files", async () => {
    const result = await retryFailedCompletedDownloads("user1", [
      {
        kind: "failed",
        message: noMediaFilesFoundMessage,
        source: {
          kind: "failed",
          message: noMediaFilesFoundMessage,
          source: {
            kind: "importable",
            match: {
              request: {
                mediaTitleId: "b411e2d6-3a82-4d8a-bb18-053bb6e44b29",
                episodeId: "21ee43bc-d10a-467f-b0ac-923dc81418c7",
                targetLibraryPathId: "f8496196-4656-48f5-bc51-90a544c89e2a",
              },
              historyItem: { statusKind: "completed" },
            },
          },
        },
      } as never,
    ]);

    expect(result).toEqual({ attemptedCount: 1, queuedCount: 1, failedCount: 0 });
    expect(searchLibraryItemReleasesMock).toHaveBeenCalledWith("user1", expect.objectContaining({
      episodeId: "21ee43bc-d10a-467f-b0ac-923dc81418c7",
    }));
  });

  it("recovers a completed season pack that contains only samples or extras", async () => {
    const fulfillment = {
      id: "fulfillment-season1",
      mediaTitleId: "title1",
      seasonId: "season1",
      status: "active",
      strategy: "season_pack",
    };
    const recoveredFulfillment = {
      ...fulfillment,
      strategy: "episodes",
      statusMessage: "Using individual episodes: 2 active.",
    };
    findFulfillmentMock
      .mockResolvedValueOnce(fulfillment as never)
      .mockResolvedValueOnce(recoveredFulfillment as never);
    recoverSeasonPackMock.mockResolvedValue({
      fulfillment: recoveredFulfillment,
      releaseSearch: {
        queuedDownload: {
          queued: false,
          reason: "no_matching_release",
          message: "No alternate season pack matched.",
        },
      },
      fallback: {
        fulfillmentId: fulfillment.id,
        queuedCount: 2,
        activeCount: 0,
        message: recoveredFulfillment.statusMessage,
      },
    } as never);

    const result = await retryFailedCompletedDownloads("user1", [{
      kind: "failed",
      message: noPrimaryMediaFilesFoundMessage,
      source: {
        kind: "failed",
        message: noPrimaryMediaFilesFoundMessage,
        source: {
          kind: "importable",
          match: {
            request: {
              id: "request-season1",
              mediaTitleId: "title1",
              seasonId: "season1",
              episodeId: null,
              fulfillmentId: fulfillment.id,
              requestedTitle: "The Show S01",
              targetLibraryPathId: "path1",
            },
            historyItem: {
              statusKind: "completed",
              failMessage: null,
            },
          },
        },
      },
    } as never]);

    expect(recoverSeasonPackMock).toHaveBeenCalledWith({
      userId: "user1",
      fulfillmentId: fulfillment.id,
      failureMessage: noPrimaryMediaFilesFoundMessage,
    });
    expect(result).toEqual({ attemptedCount: 1, queuedCount: 2, failedCount: 0 });
  });

  it("does not retry completed history items that failed destination resolution", async () => {
    const result = await retryFailedCompletedDownloads("user1", [
      {
        kind: "failed",
        message: "No destination library folder was selected for this download.",
        source: {
          kind: "failed",
          message: "No destination library folder was selected for this download.",
          source: {
            kind: "failed",
            message: "No destination library folder was selected for this download.",
            match: {
              request: {
                mediaTitleId: "b411e2d6-3a82-4d8a-bb18-053bb6e44b29",
                episodeId: null,
                targetLibraryPathId: null,
              },
              historyItem: { statusKind: "completed" },
            },
          },
        },
      } as never,
    ]);

    expect(result).toEqual({ attemptedCount: 0, queuedCount: 0, failedCount: 0 });
    expect(searchLibraryItemReleasesMock).not.toHaveBeenCalled();
  });

  it("does not duplicate persistence-owned season blocking when infrastructure fails", async () => {
    findFulfillmentMock.mockResolvedValue({
      id: "fulfillment-season1",
      mediaTitleId: "title1",
      seasonId: "season1",
      status: "active",
      strategy: "episodes",
    } as never);

    const result = await retryFailedCompletedDownloads("user1", [{
      kind: "failed",
      message: "No Usenet server is configured.",
      source: {
        kind: "failed",
        message: "No Usenet server is configured.",
        source: {
          kind: "failed",
          message: "No Usenet server is configured.",
          match: {
            request: {
              id: "request-episode1",
              mediaTitleId: "title1",
              seasonId: "season1",
              episodeId: "episode1",
              fulfillmentId: "fulfillment-season1",
              targetLibraryPathId: "path1",
            },
            historyItem: {
              statusKind: "failed",
              failMessage: "No Usenet server is configured.",
            },
          },
        },
      },
    } as never]);

    expect(result).toEqual({ attemptedCount: 0, queuedCount: 0, failedCount: 0 });
    expect(findFulfillmentMock).not.toHaveBeenCalled();
    expect(searchLibraryItemReleasesMock).not.toHaveBeenCalled();
  });

  it("honors a structured infrastructure kind even when the message is provider-specific", async () => {
    findFulfillmentMock.mockResolvedValue({
      id: "fulfillment-season1",
      mediaTitleId: "title1",
      seasonId: "season1",
      status: "active",
      strategy: "season_pack",
    } as never);

    const result = await retryFailedCompletedDownloads("user1", [{
      kind: "failed",
      message: "Provider rejected the operation.",
      source: {
        kind: "failed",
        message: "Provider rejected the operation.",
        source: {
          kind: "failed",
          message: "Provider rejected the operation.",
          match: {
            request: {
              id: "request-season1",
              mediaTitleId: "title1",
              seasonId: "season1",
              episodeId: null,
              fulfillmentId: "fulfillment-season1",
            },
            historyItem: {
              statusKind: "failed",
              failMessage: "Provider rejected the operation.",
              failureKind: "infrastructure",
            },
          },
        },
      },
    } as never]);

    expect(result).toEqual({ attemptedCount: 0, queuedCount: 0, failedCount: 0 });
    expect(findFulfillmentMock).not.toHaveBeenCalled();
    expect(recoverSeasonPackMock).not.toHaveBeenCalled();
    expect(searchLibraryItemReleasesMock).not.toHaveBeenCalled();
  });

  it("creates a durable plan for a failed season pack and counts queued episode fallback children", async () => {
    const fulfillment = {
      id: "fulfillment-season1",
      mediaTitleId: "title1",
      seasonId: "season1",
      status: "active",
      strategy: "season_pack",
      packAttemptCount: 0,
      packAttemptLimit: 3,
      statusMessage: "Searching for a complete season pack.",
    };
    const recoveredFulfillment = {
      ...fulfillment,
      status: "active",
      strategy: "episodes",
      packAttemptCount: 3,
      statusMessage: "Using individual episodes: 2 active.",
    };
    createSeasonFulfillmentMock.mockResolvedValue(fulfillment as never);
    findFulfillmentMock
      .mockResolvedValueOnce(fulfillment as never)
      .mockResolvedValueOnce(recoveredFulfillment as never);
    recoverSeasonPackMock.mockResolvedValue({
      fulfillment: recoveredFulfillment,
      releaseSearch: {
        queuedDownload: {
          queued: false,
          reason: "no_matching_release",
          message: "No alternate season pack matched.",
        },
      },
      fallback: {
        fulfillmentId: "fulfillment-season1",
        queuedCount: 2,
        activeCount: 0,
        message: "Using individual episodes: 2 active.",
      },
    } as never);

    const result = await retryFailedCompletedDownloads("user1", [{
      kind: "failed",
      message: "The built-in downloader reported that the download failed.",
      source: {
        kind: "failed",
        message: "The built-in downloader reported that the download failed.",
        source: {
          kind: "failed",
          message: "The built-in downloader reported that the download failed.",
          match: {
            request: {
              id: "request-season1",
              mediaTitleId: "title1",
              episodeId: null,
              seasonId: "season1",
              fulfillmentId: null,
              requestedTitle: "The Show S01",
              targetLibraryPathId: "path1",
            },
            historyItem: {
              statusKind: "failed",
              failMessage: "PAR2 verification failed.",
            },
          },
        },
      },
    } as never]);

    expect(createSeasonFulfillmentMock).toHaveBeenCalledWith({
      userId: "user1",
      mediaTitleId: "title1",
      seasonId: "season1",
      requestedTitle: "The Show S01",
      targetLibraryPathId: "path1",
    });
    expect(attachToFulfillmentMock).toHaveBeenCalledWith({
      userId: "user1",
      fulfillmentId: "fulfillment-season1",
      requestId: "request-season1",
      attemptStrategy: "season_pack",
      attemptNumber: 1,
    });
    expect(updateFulfillmentMock).toHaveBeenCalledWith({
      userId: "user1",
      fulfillmentId: "fulfillment-season1",
      packAttemptCount: 1,
    });
    expect(recoverSeasonPackMock).toHaveBeenCalledWith({
      userId: "user1",
      fulfillmentId: "fulfillment-season1",
      failureMessage: "PAR2 verification failed.",
    });
    expect(listAttemptedReleasesMock).not.toHaveBeenCalled();
    expect(searchLibraryItemReleasesMock).not.toHaveBeenCalled();
    expect(result).toEqual({ attemptedCount: 1, queuedCount: 2, failedCount: 0 });
  });
});
