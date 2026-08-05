import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
  findDownloadFulfillmentById: vi.fn(),
  listDownloadFulfillmentEpisodes: vi.fn(),
  updateDownloadFulfillment: vi.fn(),
  upsertDownloadFulfillmentEpisode: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-adoption", () => ({
  ensureSeasonFulfillmentForRequest: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
  acquireSeasonFulfillmentWorkLease: vi.fn(),
  isSeasonFulfillmentWorkLease: vi.fn(),
  releaseSeasonFulfillmentWorkLease: vi.fn(),
  renewSeasonFulfillmentWorkLease: vi.fn(),
}));

import {
  findDownloadFulfillmentById,
  listDownloadFulfillmentEpisodes,
  updateDownloadFulfillment,
  upsertDownloadFulfillmentEpisode,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import { ensureSeasonFulfillmentForRequest } from "@/modules/downloads/workflows/season-fulfillment-adoption";
import {
  acquireSeasonFulfillmentWorkLease,
  isSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { scheduleSeasonFulfillmentAfterRequest } from "./season-fulfillment-terminal-scheduling";

const ensureMock = vi.mocked(ensureSeasonFulfillmentForRequest);
const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const listEpisodesMock = vi.mocked(listDownloadFulfillmentEpisodes);
const updateMock = vi.mocked(updateDownloadFulfillment);
const upsertEpisodeMock = vi.mocked(upsertDownloadFulfillmentEpisode);
const acquireWorkMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const ownsWorkMock = vi.mocked(isSeasonFulfillmentWorkLease);
const releaseWorkMock = vi.mocked(releaseSeasonFulfillmentWorkLease);
const renewWorkMock = vi.mocked(renewSeasonFulfillmentWorkLease);
const workLease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "season-fulfillment:fulfillment-1:work",
  expiresAt: new Date("2026-07-15T18:15:00.000Z"),
};

const request = {
  id: "request-1",
  mediaTitleId: "title-1",
  seasonId: "season-1",
  episodeId: null,
  fulfillmentId: "fulfillment-1",
  requestedTitle: "Severance S01",
  targetLibraryPathId: "path-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-15T18:00:00.000Z"));
  ensureMock.mockResolvedValue({
    id: "fulfillment-1",
    status: "active",
  } as never);
  findFulfillmentMock.mockResolvedValue({
    id: "fulfillment-1",
    status: "active",
    cancellationRequestedAt: null,
  } as never);
  updateMock.mockResolvedValue({
    id: "fulfillment-1",
    status: "active",
  } as never);
  listEpisodesMock.mockResolvedValue([]);
  acquireWorkMock.mockResolvedValue(workLease);
  renewWorkMock.mockResolvedValue(workLease);
  ownsWorkMock.mockReturnValue(true);
  releaseWorkMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduleSeasonFulfillmentAfterRequest", () => {
  it("persists coverage work before a successful physical request becomes terminal", async () => {
    await scheduleSeasonFulfillmentAfterRequest("user-1", request, {
      status: "succeeded",
      message: "Imported one file; verifying season coverage.",
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      fulfillmentId: "fulfillment-1",
      expectedCancellationRequestedAt: null,
      status: "partial",
      nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
      completedAt: null,
    }));
  });

  it("persists a five-minute recovery checkpoint for a content-specific pack failure", async () => {
    await scheduleSeasonFulfillmentAfterRequest("user-1", request, {
      status: "failed",
      message: "PAR2 verification failed.",
      retryableContentFailure: true,
      failureKind: "content",
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "retry_wait",
      nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
      statusMessage: expect.stringContaining("Automatic season recovery is queued"),
    }));
  });

  it("uses the same restart checkpoint for an episode child", async () => {
    await scheduleSeasonFulfillmentAfterRequest("user-1", {
      ...request,
      episodeId: "episode-1",
    }, {
      status: "failed",
      message: "The article was removed.",
      retryableContentFailure: true,
      failureKind: "content",
    });

    expect(upsertEpisodeMock).toHaveBeenCalledWith(expect.objectContaining({
      episodeId: "episode-1",
      status: "retry_wait",
      nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
    }));
  });

  // `blocked` carries no due timestamp, so listDueDownloadFulfillments never
  // picks the plan up again and only a manual resume recovers it. A dropped
  // connection must not cost a season that.
  it("retries the plan and episode when the downloader fails transiently", async () => {
    await scheduleSeasonFulfillmentAfterRequest("user-1", {
      ...request,
      episodeId: "episode-1",
    }, {
      status: "failed",
      message: "NNTP connection failed.",
      retryableContentFailure: true,
      failureKind: "infrastructure",
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "retry_wait",
      nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
    }));
    expect(upsertEpisodeMock).toHaveBeenCalledWith(expect.objectContaining({
      episodeId: "episode-1",
      status: "retry_wait",
    }));
  });

  it("blocks the plan and episode when the downloader is misconfigured", async () => {
    await scheduleSeasonFulfillmentAfterRequest("user-1", {
      ...request,
      episodeId: "episode-1",
    }, {
      status: "failed",
      message: "No usenet server is configured. Add one under Settings → Connections.",
      retryableContentFailure: true,
      failureKind: "infrastructure",
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "blocked",
      nextAttemptAt: null,
    }));
    expect(upsertEpisodeMock).toHaveBeenCalledWith(expect.objectContaining({
      episodeId: "episode-1",
      status: "blocked",
      nextAttemptAt: null,
    }));
  });

  it("terminalizes a manually cancelled season instead of silently requeueing it", async () => {
    await scheduleSeasonFulfillmentAfterRequest("user-1", request, {
      status: "cancelled",
      message: "Season recovery was paused.",
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "cancelled",
      nextAttemptAt: null,
      cancellationRequestedAt: null,
      completedAt: expect.any(Date),
    }));
  });

  it("does not let a stale failure undo a durable cancellation request", async () => {
    findFulfillmentMock.mockResolvedValue({
      id: "fulfillment-1",
      status: "retry_wait",
      cancellationRequestedAt: new Date("2026-07-15T17:59:00.000Z"),
    } as never);

    await scheduleSeasonFulfillmentAfterRequest("user-1", request, {
      status: "failed",
      message: "The downloader job disappeared.",
      retryableContentFailure: true,
      failureKind: "content",
    });

    expect(acquireWorkMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("acquires the lease before re-reading and mutating terminal state", async () => {
    await scheduleSeasonFulfillmentAfterRequest("user-1", request, {
      status: "succeeded",
      message: "Imported one file; verifying season coverage.",
    });

    expect(acquireWorkMock.mock.invocationCallOrder[0])
      .toBeLessThan(findFulfillmentMock.mock.invocationCallOrder[0] ?? 0);
    expect(findFulfillmentMock.mock.invocationCallOrder[0])
      .toBeLessThan(updateMock.mock.invocationCallOrder[0] ?? 0);
  });

  it("does not mutate when the fresh state became terminal before lease ownership", async () => {
    ensureMock.mockResolvedValue({
      id: "fulfillment-1",
      status: "active",
      cancellationRequestedAt: null,
    } as never);
    findFulfillmentMock.mockResolvedValue({
      id: "fulfillment-1",
      status: "succeeded",
      cancellationRequestedAt: null,
    } as never);

    const result = await scheduleSeasonFulfillmentAfterRequest("user-1", request, {
      status: "failed",
      message: "The downloader job disappeared.",
      retryableContentFailure: true,
      failureKind: "content",
    });

    expect(result).toMatchObject({ status: "succeeded" });
    expect(updateMock).not.toHaveBeenCalled();
    expect(releaseWorkMock).toHaveBeenCalledWith(workLease);
  });

  it("does not downgrade a child when the guarded parent transition lost a race", async () => {
    updateMock.mockResolvedValue(null);

    await scheduleSeasonFulfillmentAfterRequest("user-1", {
      ...request,
      episodeId: "episode-1",
    }, {
      status: "failed",
      message: "The article was removed.",
      retryableContentFailure: true,
      failureKind: "content",
    });

    expect(upsertEpisodeMock).not.toHaveBeenCalled();
  });

  it("preserves an already-imported episode when a stale failure arrives", async () => {
    listEpisodesMock.mockResolvedValue([{
      episodeId: "episode-1",
      status: "succeeded",
    }] as never);

    await scheduleSeasonFulfillmentAfterRequest("user-1", {
      ...request,
      episodeId: "episode-1",
    }, {
      status: "failed",
      message: "The article was removed.",
      retryableContentFailure: true,
      failureKind: "content",
    });

    expect(upsertEpisodeMock).not.toHaveBeenCalled();
  });
});
