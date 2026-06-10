import { findJobByTarget } from "@/modules/jobs/repositories/job-repository";
import { defaultMissingSearchIntervalMinutes } from "@/modules/media-library/schemas/missing-search-schedule";

export type MissingSearchSettings = {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: "idle" | "running" | "succeeded" | "failed" | null;
  lastError: string | null;
};

export async function getMissingSearchSettings(userId: string): Promise<MissingSearchSettings> {
  const job = await findJobByTarget(userId, "missing-content-search", "media-library", "all");

  return {
    enabled: job?.isEnabled ?? false,
    intervalMinutes: job?.scheduleMinutes ?? defaultMissingSearchIntervalMinutes,
    nextRunAt: job?.nextRunAt ?? null,
    lastRunAt: job?.lastCompletedAt ?? null,
    lastStatus: job?.lastStatus ?? null,
    lastError: job?.lastError ?? null,
  };
}
