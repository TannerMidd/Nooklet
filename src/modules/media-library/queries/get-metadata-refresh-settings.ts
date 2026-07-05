import { findJobByTarget } from "@/modules/jobs/repositories/job-repository";
import { defaultMetadataRefreshIntervalMinutes } from "@/modules/media-library/schemas/metadata-refresh-schedule";

export type MetadataRefreshSettings = {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: "idle" | "running" | "succeeded" | "failed" | null;
  lastError: string | null;
};

export async function getMetadataRefreshSettings(userId: string): Promise<MetadataRefreshSettings> {
  const job = await findJobByTarget(userId, "metadata-refresh", "media-library", "all");

  return {
    enabled: job?.isEnabled ?? false,
    intervalMinutes: job?.scheduleMinutes ?? defaultMetadataRefreshIntervalMinutes,
    nextRunAt: job?.nextRunAt ?? null,
    lastRunAt: job?.lastCompletedAt ?? null,
    lastStatus: job?.lastStatus ?? null,
    lastError: job?.lastError ?? null,
  };
}
