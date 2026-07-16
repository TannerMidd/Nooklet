import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/workflows/queue-indexer-result", () => {
  class MockQueueIndexerResultWorkflowError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly capacity: {
        availableBytes: number;
        filesystemCapacityBytes: number;
        requiredBytes: number;
        activeReservationBytes: number;
        activeRemainingBytes: number;
        activeDownloadedBytes: number;
      } | null = null,
    ) {
      super(message);
      this.name = "QueueIndexerResultWorkflowError";
    }
  }

  return {
    queueIndexerResultWorkflow: vi.fn(),
    QueueIndexerResultWorkflowError: MockQueueIndexerResultWorkflowError,
  };
});

import {
  queueIndexerResultWorkflow,
  QueueIndexerResultWorkflowError,
} from "@/modules/downloads/workflows/queue-indexer-result";

import {
  queueLibraryItemRelease,
  selectLibraryItemReleaseCandidates,
} from "./release-queueing";

const queueMock = vi.mocked(queueIndexerResultWorkflow);

function result(overrides: {
  id: string;
  title: string;
  qualityLabel?: string | null;
  seeders?: number | null;
  indexerGuid?: string;
}) {
  return {
    id: overrides.id,
    mediaType: "tv",
    title: overrides.title,
    qualityLabel: overrides.qualityLabel ?? null,
    sizeBytes: null,
    publishedAt: null,
    seeders: overrides.seeders ?? null,
    leechers: null,
    grabs: null,
    indexerGuid: overrides.indexerGuid ?? `indexer1:${overrides.id}`,
    normalizedTitle: overrides.title.toLowerCase(),
  } as never;
}

const item = {
  title: {
    id: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
    title: "Severance",
    libraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
    qualityProfile: "hd-1080p",
  },
  targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
  episode: {
    id: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
    seasonNumber: 1,
    episodeNumber: 2,
  },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectLibraryItemReleaseCandidates", () => {
  it("filters to the title quality profile and sorts by health", () => {
    const candidates = selectLibraryItemReleaseCandidates(item, [
      result({ id: "720", title: "Severance S01E02 720p", seeders: 100 }),
      result({ id: "1080-low", title: "Severance S01E02 1080p", seeders: 5 }),
      result({ id: "1080-high", title: "Severance S01E02 1080p", seeders: 20 }),
    ]);

    expect(candidates.map((candidate) => candidate.id)).toEqual(["1080-high", "1080-low"]);
  });

  it("excludes previously attempted result ids", () => {
    const candidates = selectLibraryItemReleaseCandidates(
      item,
      [
        result({ id: "1080-low", title: "Severance S01E02 1080p", seeders: 5 }),
        result({ id: "1080-high", title: "Severance S01E02 1080p", seeders: 20 }),
      ],
      { excludedResultIds: ["1080-high"] },
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["1080-low"]);
  });

  it("excludes previously attempted stable release identities", () => {
    const candidates = selectLibraryItemReleaseCandidates(
      item,
      [
        result({ id: "new-row-for-bad-release", title: "Severance S01E02 1080p", seeders: 20 }),
        result({ id: "different-release", title: "Severance S01E02 1080p PROPER", seeders: 10 }),
      ],
      { excludedReleaseKeys: ["title:severance s01e02 1080p"] },
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["different-release"]);
  });
});



describe("queueLibraryItemRelease", () => {
  it("queues the best matching episode release with title and episode metadata", async () => {
    queueMock.mockResolvedValue({ downloadRequest: { id: "download1" } } as never);

    const queued = await queueLibraryItemRelease("u1", item, {
      searched: true,
      query: "Severance S01E02",
      searchRun: { id: "run1", status: "succeeded" },
      results: [
        result({ id: "1080-low", title: "Severance S01E02 1080p", seeders: 5 }),
        result({ id: "1080-high", title: "Severance S01E02 1080p", seeders: 20 }),
      ],
    } as never);

    expect(queueMock).toHaveBeenCalledWith("u1", {
      resultId: "1080-high",
      mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
      episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
      requestedTitle: "Severance S01E02",
      targetLibraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
      targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
    }, {
      fulfillmentId: null,
      attemptStrategy: null,
      attemptNumber: null,
      workLease: null,
    });
    expect(queued).toMatchObject({ queued: true, selectedResultId: "1080-high" });
  });

  it("queues a season pack with season linkage for season searches", async () => {
    queueMock.mockResolvedValue({ downloadRequest: { id: "download1" } } as never);

    const seasonItem = {
      title: {
        id: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
        title: "Severance",
        libraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
        qualityProfile: "hd-1080p",
      },
      targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
      season: { id: "5f8a4c11-4c04-45db-92cb-33a05c96e70f", seasonNumber: 1 },
      episode: null,
    } as never;

    const queued = await queueLibraryItemRelease("u1", seasonItem, {
      searched: true,
      query: "Severance S01",
      searchRun: { id: "run1", status: "succeeded" },
      results: [
        result({ id: "episode-only", title: "Severance S01E02 1080p", seeders: 50 }),
        result({ id: "season-pack", title: "Severance S01 Complete 1080p", seeders: 20 }),
      ],
    } as never);

    expect(queueMock).toHaveBeenCalledWith("u1", {
      resultId: "season-pack",
      mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
      seasonId: "5f8a4c11-4c04-45db-92cb-33a05c96e70f",
      requestedTitle: "Severance S01",
      targetLibraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
      targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
    }, {
      fulfillmentId: null,
      attemptStrategy: null,
      attemptNumber: null,
      workLease: null,
    });
    expect(queued).toMatchObject({ queued: true, selectedResultId: "season-pack" });
  });

  it("skips excluded release ids before queueing", async () => {
    queueMock.mockResolvedValue({ downloadRequest: { id: "download1" } } as never);

    const queued = await queueLibraryItemRelease(
      "u1",
      item,
      {
        searched: true,
        query: "Severance S01E02",
        searchRun: { id: "run1", status: "succeeded" },
        results: [
          result({ id: "1080-low", title: "Severance S01E02 1080p", seeders: 5 }),
          result({ id: "1080-high", title: "Severance S01E02 1080p", seeders: 20 }),
        ],
      } as never,
      { excludedResultIds: ["1080-high"] },
    );

    expect(queueMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ resultId: "1080-low" }),
      expect.objectContaining({ fulfillmentId: null }),
    );
    expect(queued).toMatchObject({ queued: true, selectedResultId: "1080-low" });
  });

  it("tries the next matching release when a stored search result expires", async () => {
    queueMock
      .mockRejectedValueOnce(new QueueIndexerResultWorkflowError("result_not_found", "Search result expired."))
      .mockResolvedValueOnce({ downloadRequest: { id: "download2" } } as never);

    const queued = await queueLibraryItemRelease("u1", item, {
      searched: true,
      query: "Severance S01E02",
      searchRun: { id: "run1", status: "succeeded" },
      results: [
        result({ id: "first", title: "Severance S01E02 1080p", seeders: 20 }),
        result({ id: "second", title: "Severance S01E02 1080p", seeders: 10 }),
      ],
    } as never);

    expect(queueMock).toHaveBeenCalledTimes(2);
    expect(queued).toMatchObject({
      queued: true,
      selectedResultId: "second",
      rejectedResultIds: [],
    });
  });

  it("skips an oversized episode release and queues the next candidate", async () => {
    queueMock
      .mockRejectedValueOnce(new QueueIndexerResultWorkflowError(
        "download_capacity_exceeded",
        "The first episode release is too large for this workspace.",
        {
          availableBytes: 10_000,
          filesystemCapacityBytes: 20_000,
          requiredBytes: 30_000,
          activeReservationBytes: 5_000,
          activeRemainingBytes: 2_000,
          activeDownloadedBytes: 1_000,
        },
      ))
      .mockResolvedValueOnce({ downloadRequest: { id: "download2" } } as never);

    const queued = await queueLibraryItemRelease("u1", item, {
      searched: true,
      query: "Severance S01E02",
      searchRun: { id: "run1", status: "succeeded" },
      results: [
        result({ id: "first", title: "Severance S01E02 1080p", seeders: 20 }),
        result({ id: "second", title: "Severance S01E02 1080p", seeders: 10 }),
      ],
    } as never);

    expect(queueMock).toHaveBeenCalledTimes(2);
    expect(queued).toMatchObject({
      queued: true,
      selectedResultId: "second",
      rejectedResultIds: ["first"],
    });
  });

  it("does not try another release when SABnzbd enqueueing is uncertain", async () => {
    queueMock.mockRejectedValue(
      new QueueIndexerResultWorkflowError("sabnzbd_enqueue_failed", "SABnzbd could not queue the selected release."),
    );

    const queued = await queueLibraryItemRelease("u1", item, {
      searched: true,
      query: "Severance S01E02",
      searchRun: { id: "run1", status: "succeeded" },
      results: [
        result({ id: "first", title: "Severance S01E02 1080p", seeders: 20 }),
        result({ id: "second", title: "Severance S01E02 1080p", seeders: 10 }),
      ],
    } as never);

    expect(queueMock).toHaveBeenCalledTimes(1);
    expect(queued).toMatchObject({
      queued: false,
      reason: "queue_failed",
      message: "SABnzbd could not queue the selected release.",
      rejectedResultIds: [],
    });
  });

  it("does not try another release when the item already has an active download", async () => {
    queueMock.mockRejectedValue(
      new QueueIndexerResultWorkflowError(
        "active_download_exists",
        "This library item already has an active download in progress.",
      ),
    );

    const queued = await queueLibraryItemRelease("u1", item, {
      searched: true,
      query: "Severance S01E02",
      searchRun: { id: "run1", status: "succeeded" },
      results: [
        result({ id: "first", title: "Severance S01E02 1080p", seeders: 20 }),
        result({ id: "second", title: "Severance S01E02 1080p", seeders: 10 }),
      ],
    } as never);

    expect(queueMock).toHaveBeenCalledTimes(1);
    expect(queued).toMatchObject({
      queued: false,
      reason: "queue_failed",
      message: "This library item already has an active download in progress.",
      rejectedResultIds: [],
    });
  });
});
