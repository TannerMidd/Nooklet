import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/workflows/queue-indexer-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/downloads/workflows/queue-indexer-result")>();

  return {
    ...actual,
    queueIndexerResultWorkflow: vi.fn(),
  };
});

import {
  queueIndexerResultWorkflow,
  QueueIndexerResultWorkflowError,
} from "@/modules/downloads/workflows/queue-indexer-result";

import {
  queueRequestedTitleRelease,
  selectRequestedTitleReleaseCandidates,
} from "./release-queueing";

const queueMock = vi.mocked(queueIndexerResultWorkflow);

function result(overrides: {
  id: string;
  title: string;
  qualityLabel?: string | null;
  seeders?: number | null;
  grabs?: number | null;
  publishedAt?: Date | null;
}) {
  return {
    id: overrides.id,
    searchRunId: "run1",
    userId: "u1",
    indexerId: "indexer1",
    mediaType: "movie",
    title: overrides.title,
    normalizedTitle: overrides.title.toLowerCase(),
    indexerGuid: overrides.id,
    qualityLabel: overrides.qualityLabel ?? null,
    releaseGroup: null,
    sizeBytes: null,
    publishedAt: overrides.publishedAt ?? null,
    ageMinutes: null,
    seeders: overrides.seeders ?? null,
    leechers: null,
    grabs: overrides.grabs ?? null,
    createdAt: new Date("2026-05-06T12:00:00Z"),
  } as never;
}

const request = {
  mediaType: "movie",
  libraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
  targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
  title: "Arrival",
  year: 2016,
  monitored: true,
  qualityProfile: "hd-1080p",
  downloadNow: true,
} as const;
const title = {
  id: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
  title: "Arrival",
  libraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectRequestedTitleReleaseCandidates", () => {
  it("keeps releases matching the quality profile and sorts by health", () => {
    const candidates = selectRequestedTitleReleaseCandidates(request, [
      result({ id: "2160", title: "Arrival 2016 2160p", seeders: 50 }),
      result({ id: "1080-low", title: "Arrival 2016 1080p", seeders: 2 }),
      result({ id: "1080-high", title: "Arrival 2016 1080p", seeders: 20 }),
      result({ id: "720", title: "Arrival 2016 720p", seeders: 100 }),
    ]);

    expect(candidates.map((candidate) => candidate.id)).toEqual(["1080-high", "1080-low"]);
  });

  it("uses broad HD indexer categories as 1080p fallback candidates", () => {
    const candidates = selectRequestedTitleReleaseCandidates(request, [
      result({ id: "explicit-720", title: "Arrival 2016 720p WEB-DL", qualityLabel: "Movies HD", seeders: 20 }),
      result({ id: "category-hd", title: "Arrival 2016 BluRay", qualityLabel: "Movies HD", seeders: 10 }),
    ]);

    expect(candidates.map((candidate) => candidate.id)).toEqual(["category-hd"]);
  });
});

describe("queueRequestedTitleRelease", () => {
  it("queues the best matching release with title metadata", async () => {
    queueMock.mockResolvedValue({ downloadRequest: { id: "download1" } } as never);

    const queued = await queueRequestedTitleRelease(userId, request, title, {
      searched: true,
      searchRun: { id: "run1", status: "succeeded" },
      results: [
        result({ id: "1080-low", title: "Arrival 2016 1080p", seeders: 2 }),
        result({ id: "1080-high", title: "Arrival 2016 1080p", seeders: 20 }),
      ],
    } as never);

    expect(queueMock).toHaveBeenCalledWith(userId, {
      resultId: "1080-high",
      mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
      requestedTitle: "Arrival",
      targetLibraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
      targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
    });
    expect(queued).toMatchObject({ queued: true, selectedResultId: "1080-high" });
  });

  it("tries the next matching release when SABnzbd rejects a candidate", async () => {
    queueMock
      .mockRejectedValueOnce(new QueueIndexerResultWorkflowError("sabnzbd_enqueue_failed", "Bad release."))
      .mockResolvedValueOnce({ downloadRequest: { id: "download2" } } as never);

    const queued = await queueRequestedTitleRelease(userId, request, title, {
      searched: true,
      searchRun: { id: "run1", status: "succeeded" },
      results: [
        result({ id: "first", title: "Arrival 2016 1080p", seeders: 20 }),
        result({ id: "second", title: "Arrival 2016 1080p", seeders: 10 }),
      ],
    } as never);

    expect(queueMock).toHaveBeenCalledTimes(2);
    expect(queued).toMatchObject({
      queued: true,
      selectedResultId: "second",
      rejectedResultIds: ["first"],
    });
  });

  it("returns no matching release when quality does not match", async () => {
    const queued = await queueRequestedTitleRelease(userId, request, title, {
      searched: true,
      searchRun: { id: "run1", status: "succeeded" },
      results: [result({ id: "720", title: "Arrival 2016 720p", seeders: 20 })],
    } as never);

    expect(queueMock).not.toHaveBeenCalled();
    expect(queued).toMatchObject({ queued: false, reason: "no_matching_release" });
  });

  it("stops when the download client cannot queue any release", async () => {
    queueMock.mockRejectedValue(
      new QueueIndexerResultWorkflowError("sabnzbd_not_connected", "Connect SABnzbd before queueing releases."),
    );

    const queued = await queueRequestedTitleRelease(userId, request, title, {
      searched: true,
      searchRun: { id: "run1", status: "succeeded" },
      results: [
        result({ id: "first", title: "Arrival 2016 1080p", seeders: 20 }),
        result({ id: "second", title: "Arrival 2016 1080p", seeders: 10 }),
      ],
    } as never);

    expect(queueMock).toHaveBeenCalledTimes(1);
    expect(queued).toMatchObject({
      queued: false,
      reason: "queue_failed",
      message: "Connect SABnzbd before queueing releases.",
      rejectedResultIds: [],
    });
  });
});

const userId = "u1";
