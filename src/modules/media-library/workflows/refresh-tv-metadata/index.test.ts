import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  listMonitoredTvTitlesWithTmdbId: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-request-attempts-repository", () => ({
  acquireMediaRequestAttempt: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/sync-title-episodes", () => ({
  syncTitleEpisodesWorkflow: vi.fn(),
}));
vi.mock("@/modules/users/commands/record-audit-event", () => ({
  recordAuditEvent: vi.fn(),
}));

import { listMonitoredTvTitlesWithTmdbId } from "@/modules/media-library/repositories/media-library-repository";
import { acquireMediaRequestAttempt } from "@/modules/media-library/repositories/media-request-attempts-repository";
import { syncTitleEpisodesWorkflow } from "@/modules/media-library/workflows/sync-title-episodes";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { METADATA_REFRESH_BACKOFF_MS, refreshTvMetadataWorkflow } from "./index";

const listCandidatesMock = vi.mocked(listMonitoredTvTitlesWithTmdbId);
const acquireAttemptMock = vi.mocked(acquireMediaRequestAttempt);
const attemptLease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "metadata-refresh:test",
  expiresAt: new Date("2026-07-15T12:30:00Z"),
};
const syncMock = vi.mocked(syncTitleEpisodesWorkflow);
const auditMock = vi.mocked(recordAuditEvent);

function candidate(id: string, tmdbId: string, monitored = true) {
  return { title: { id, title: `Show ${id}`, monitored }, tmdbId } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  acquireAttemptMock.mockResolvedValue(attemptLease);
});

describe("refreshTvMetadataWorkflow", () => {
  it("refreshes candidates with the refresh policy under the per-title backoff", async () => {
    listCandidatesMock.mockResolvedValue([candidate("t1", "100"), candidate("t2", "200", false)]);
    syncMock.mockResolvedValue({
      ok: true,
      seasonIdByNumber: new Map(),
      episodeIdByNumber: new Map(),
      newEpisodeCount: 2,
    });

    const report = await refreshTvMetadataWorkflow("u1");

    expect(acquireAttemptMock).toHaveBeenCalledWith(
      "u1",
      "metadata-refresh:title:t1",
      METADATA_REFRESH_BACKOFF_MS,
    );
    expect(syncMock).toHaveBeenNthCalledWith(1, "u1", {
      titleId: "t1",
      tmdbId: 100,
      scope: "all",
      policy: { kind: "refresh", titleMonitored: true },
    });
    expect(syncMock).toHaveBeenNthCalledWith(2, "u1", {
      titleId: "t2",
      tmdbId: 200,
      scope: "all",
      policy: { kind: "refresh", titleMonitored: false },
    });
    expect(report).toEqual({ refreshedCount: 2, newEpisodeCount: 4, failedCount: 0 });
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("skips titles still inside the backoff window", async () => {
    listCandidatesMock.mockResolvedValue([candidate("t1", "100"), candidate("t2", "200")]);
    acquireAttemptMock.mockResolvedValueOnce(null).mockResolvedValueOnce(attemptLease);
    syncMock.mockResolvedValue({
      ok: true,
      seasonIdByNumber: new Map(),
      episodeIdByNumber: new Map(),
      newEpisodeCount: 0,
    });

    const report = await refreshTvMetadataWorkflow("u1");

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock).toHaveBeenCalledWith("u1", expect.objectContaining({ titleId: "t2" }));
    expect(report.refreshedCount).toBe(1);
  });

  it("caps the batch at the refresh limit", async () => {
    listCandidatesMock.mockResolvedValue([
      candidate("t1", "100"),
      candidate("t2", "200"),
      candidate("t3", "300"),
      candidate("t4", "400"),
    ]);
    syncMock.mockResolvedValue({
      ok: true,
      seasonIdByNumber: new Map(),
      episodeIdByNumber: new Map(),
      newEpisodeCount: 0,
    });

    const report = await refreshTvMetadataWorkflow("u1");

    expect(syncMock).toHaveBeenCalledTimes(3);
    expect(report.refreshedCount).toBe(3);
  });

  it("stops the run when TMDB is not configured", async () => {
    listCandidatesMock.mockResolvedValue([candidate("t1", "100"), candidate("t2", "200")]);
    syncMock.mockResolvedValue({
      ok: false,
      reason: "tmdb-not-configured",
      message: "Verify a TMDB connection.",
    });

    const report = await refreshTvMetadataWorkflow("u1");

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(report).toEqual({ refreshedCount: 0, newEpisodeCount: 0, failedCount: 0 });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("counts per-title TMDB failures and keeps going", async () => {
    listCandidatesMock.mockResolvedValue([candidate("t1", "100"), candidate("t2", "200")]);
    syncMock
      .mockResolvedValueOnce({ ok: false, reason: "tmdb-error", message: "TMDB hiccup." })
      .mockResolvedValueOnce({
        ok: true,
        seasonIdByNumber: new Map(),
        episodeIdByNumber: new Map(),
        newEpisodeCount: 1,
      });

    const report = await refreshTvMetadataWorkflow("u1");

    expect(report).toEqual({ refreshedCount: 1, newEpisodeCount: 1, failedCount: 1 });
  });
});
