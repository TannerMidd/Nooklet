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

import { queueReleaseCandidates } from "./queue-attempts";

const queueMock = vi.mocked(queueIndexerResultWorkflow);

const context = {
  mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
  requestedTitle: "Severance S01E02",
  targetLibraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
  targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queueReleaseCandidates", () => {
  it("queues the first candidate and links season and episode when provided", async () => {
    queueMock.mockResolvedValue({ downloadRequest: { id: "download1" } } as never);

    const outcome = await queueReleaseCandidates(
      "u1",
      [{ id: "first" }, { id: "second" }],
      {
        ...context,
        seasonId: "3f0a3c4e-92f4-4f0e-8b3b-24f3a34aa001",
        episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
      },
    );

    expect(queueMock).toHaveBeenCalledTimes(1);
    expect(queueMock).toHaveBeenCalledWith("u1", {
      resultId: "first",
      mediaTitleId: context.mediaTitleId,
      requestedTitle: context.requestedTitle,
      targetLibraryId: context.targetLibraryId,
      targetLibraryPathId: context.targetLibraryPathId,
      seasonId: "3f0a3c4e-92f4-4f0e-8b3b-24f3a34aa001",
      episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
    });
    expect(outcome).toMatchObject({ queued: true, selectedResultId: "first" });
  });

  it("omits season and episode linkage when not provided", async () => {
    queueMock.mockResolvedValue({ downloadRequest: { id: "download1" } } as never);

    await queueReleaseCandidates("u1", [{ id: "first" }], context);

    expect(queueMock).toHaveBeenCalledWith("u1", {
      resultId: "first",
      mediaTitleId: context.mediaTitleId,
      requestedTitle: context.requestedTitle,
      targetLibraryId: context.targetLibraryId,
      targetLibraryPathId: context.targetLibraryPathId,
    });
  });

  it("tries the next candidate on retryable errors", async () => {
    queueMock
      .mockRejectedValueOnce(new QueueIndexerResultWorkflowError("result_not_found", "Search result expired."))
      .mockRejectedValueOnce(new QueueIndexerResultWorkflowError("unsupported_protocol", "Torrent releases are not supported yet."))
      .mockResolvedValueOnce({ downloadRequest: { id: "download3" } } as never);

    const outcome = await queueReleaseCandidates(
      "u1",
      [{ id: "first" }, { id: "second" }, { id: "third" }],
      context,
    );

    expect(queueMock).toHaveBeenCalledTimes(3);
    expect(outcome).toMatchObject({
      queued: true,
      selectedResultId: "third",
      rejectedResultIds: ["first", "second"],
    });
  });

  it("stops on non-retryable errors", async () => {
    queueMock.mockRejectedValue(
      new QueueIndexerResultWorkflowError("sabnzbd_enqueue_failed", "SABnzbd could not queue the selected release."),
    );

    const outcome = await queueReleaseCandidates("u1", [{ id: "first" }, { id: "second" }], context);

    expect(queueMock).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      queued: false,
      reason: "queue_failed",
      message: "SABnzbd could not queue the selected release.",
      rejectedResultIds: [],
    });
  });

  it("reports the last error when every candidate fails a retryable check", async () => {
    queueMock.mockRejectedValue(
      new QueueIndexerResultWorkflowError("result_not_found", "Search result expired."),
    );

    const outcome = await queueReleaseCandidates("u1", [{ id: "first" }, { id: "second" }], context);

    expect(queueMock).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({
      queued: false,
      reason: "queue_failed",
      message: "Search result expired.",
      rejectedResultIds: ["first", "second"],
    });
  });
});
