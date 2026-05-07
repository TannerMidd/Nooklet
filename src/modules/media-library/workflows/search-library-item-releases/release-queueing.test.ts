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
  queueLibraryItemRelease,
  selectLibraryItemReleaseCandidates,
} from "./release-queueing";

const queueMock = vi.mocked(queueIndexerResultWorkflow);

function result(overrides: {
  id: string;
  title: string;
  qualityLabel?: string | null;
  seeders?: number | null;
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
  } as never;
}

const item = {
  title: {
    id: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
    title: "Severance",
    libraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
    qualityProfile: "hd-1080p",
  },
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
    });
    expect(queued).toMatchObject({ queued: true, selectedResultId: "1080-high" });
  });

  it("tries the next matching release when SABnzbd rejects a candidate", async () => {
    queueMock
      .mockRejectedValueOnce(new QueueIndexerResultWorkflowError("sabnzbd_enqueue_failed", "Bad release."))
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
});