import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  listDownloadRequestReleaseExclusionsForItem: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-library-item-releases", () => ({
  searchLibraryItemReleasesWorkflow: vi.fn(),
}));

import { listDownloadRequestReleaseExclusionsForItem } from "@/modules/downloads/repositories/download-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import { noMediaFilesFoundMessage } from "./file-inspection";
import { retryFailedCompletedDownloads } from "./retry-handling";

const listAttemptedReleasesMock = vi.mocked(listDownloadRequestReleaseExclusionsForItem);
const searchLibraryItemReleasesMock = vi.mocked(searchLibraryItemReleasesWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
  listAttemptedReleasesMock.mockResolvedValue({
    resultIds: ["cbd43b73-6987-4652-91df-e8aa2bfa5761"],
    releaseKeys: ["title:star trek 2009 1080p bdrip aac 7 1 x265 10bit markii"],
  });
  searchLibraryItemReleasesMock.mockResolvedValue({
    queuedDownload: { queued: true },
  } as never);
});

describe("retryFailedCompletedDownloads", () => {
  it("re-searches and queues the next release after a SABnzbd failure", async () => {
    const result = await retryFailedCompletedDownloads("user1", [
      {
        kind: "failed",
        message: "SABnzbd reported that the download failed.",
        source: {
          kind: "failed",
          message: "SABnzbd reported that the download failed.",
          source: {
            kind: "failed",
            message: "SABnzbd reported that the download failed.",
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
      episodeId: undefined,
      targetLibraryPathId: "f8496196-4656-48f5-bc51-90a544c89e2a",
      excludedResultIds: ["cbd43b73-6987-4652-91df-e8aa2bfa5761"],
      excludedReleaseKeys: ["title:star trek 2009 1080p bdrip aac 7 1 x265 10bit markii"],
    });
  });

  it("only retries once for duplicate failed attempts of the same item", async () => {
    const failedDownload = {
      kind: "failed",
      message: "SABnzbd reported that the download failed.",
      source: {
        kind: "failed",
        message: "SABnzbd reported that the download failed.",
        source: {
          kind: "failed",
          message: "SABnzbd reported that the download failed.",
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

  it("does not retry a failed duplicate when the same item imported successfully", async () => {
    const mediaTitleId = "b411e2d6-3a82-4d8a-bb18-053bb6e44b29";
    const failedDuplicate = {
      kind: "failed",
      message: "SABnzbd reported that the download failed.",
      source: {
        kind: "failed",
        message: "SABnzbd reported that the download failed.",
        source: {
          kind: "failed",
          message: "SABnzbd reported that the download failed.",
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
});
