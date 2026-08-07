import { findJobByTarget } from "@/modules/jobs/public";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
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
  const jobOwnerUserId = await resolveInstanceConfigurationOwnerId(userId);
  const job = await findJobByTarget(
    jobOwnerUserId,
    "media-library-scan",
    "media-library",
    "all",
  );

  return {
    enabled: job?.isEnabled ?? false,
    intervalMinutes: job?.scheduleMinutes ?? defaultLibraryScanIntervalMinutes,
    nextRunAt: job?.nextRunAt ?? null,
    lastRunAt: job?.lastCompletedAt ?? null,
    lastStatus: job?.lastStatus ?? null,
    lastError: job?.lastError ?? null,
  };
}
