import {
  listMonitoredTvTitlesWithTmdbId,
} from "@/modules/media-library/repositories/media-library-repository";
import { acquireMediaRequestAttempt } from "@/modules/media-library/repositories/media-request-attempts-repository";
import { syncTitleEpisodesWorkflow } from "@/modules/media-library/workflows/sync-title-episodes";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

/**
 * Backoff window per title: once refreshed, a title is not refreshed again
 * until the window expires, so the batch rotates through the library across
 * scheduled runs instead of hammering TMDB for the same shows.
 */
export const METADATA_REFRESH_BACKOFF_MS = 24 * 60 * 60 * 1000;

const REFRESH_CANDIDATE_LIMIT = 50;
const REFRESH_BATCH_LIMIT = 3;

export type TvMetadataRefreshReport = {
  refreshedCount: number;
  newEpisodeCount: number;
  failedCount: number;
};

export async function refreshTvMetadataWorkflow(
  userId: string,
): Promise<TvMetadataRefreshReport> {
  const candidates = await listMonitoredTvTitlesWithTmdbId(userId, REFRESH_CANDIDATE_LIMIT);
  const report: TvMetadataRefreshReport = {
    refreshedCount: 0,
    newEpisodeCount: 0,
    failedCount: 0,
  };
  const refreshedTitles: string[] = [];
  let processed = 0;

  for (const candidate of candidates) {
    if (processed >= REFRESH_BATCH_LIMIT) {
      break;
    }

    const tmdbId = Number.parseInt(candidate.tmdbId, 10);

    if (!Number.isFinite(tmdbId)) {
      continue;
    }

    const acquired = await acquireMediaRequestAttempt(
      userId,
      `metadata-refresh:title:${candidate.title.id}`,
      METADATA_REFRESH_BACKOFF_MS,
    );

    if (!acquired) {
      continue;
    }

    processed += 1;

    const result = await syncTitleEpisodesWorkflow(userId, {
      titleId: candidate.title.id,
      tmdbId,
      scope: "all",
      policy: { kind: "refresh", titleMonitored: candidate.title.monitored },
    });

    if (result.ok) {
      report.refreshedCount += 1;
      report.newEpisodeCount += result.newEpisodeCount;
      refreshedTitles.push(candidate.title.title);
      continue;
    }

    if (result.reason === "tmdb-not-configured") {
      break;
    }

    report.failedCount += 1;
  }

  if (report.refreshedCount > 0 || report.failedCount > 0) {
    await recordAuditEvent({
      actorUserId: userId,
      eventType: "media-library.metadata-refresh.completed",
      subjectType: "media-library-metadata-refresh",
      subjectId: "all",
      payload: {
        refreshedCount: report.refreshedCount,
        newEpisodeCount: report.newEpisodeCount,
        failedCount: report.failedCount,
        refreshedTitles,
      },
    });
  }

  return report;
}
