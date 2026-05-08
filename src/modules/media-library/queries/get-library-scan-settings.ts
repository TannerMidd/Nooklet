import { findJobByTarget } from "@/modules/jobs/repositories/job-repository";
import { defaultLibraryScanIntervalMinutes } from "@/modules/media-library/schemas/library-scan-schedule";

export type LibraryScanSettings = {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: "idle" | "running" | "succeeded" | "failed" | null;
  lastError: string | null;
};

export async function getLibraryScanSettings(userId: string): Promise<LibraryScanSettings> {
  const job = await findJobByTarget(userId, "media-library-scan", "media-library", "all");

  return {
    enabled: job?.isEnabled ?? false,
    intervalMinutes: job?.scheduleMinutes ?? defaultLibraryScanIntervalMinutes,
    nextRunAt: job?.nextRunAt ?? null,
    lastRunAt: job?.lastCompletedAt ?? null,
    lastStatus: job?.lastStatus ?? null,
    lastError: job?.lastError ?? null,
  };
}