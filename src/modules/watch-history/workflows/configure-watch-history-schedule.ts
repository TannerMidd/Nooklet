import {
  saveRecurringJob,
} from "@/modules/jobs/repositories/job-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { findWatchHistorySourceByType } from "@/modules/watch-history/repositories/watch-history-repository";
import { type WatchHistoryScheduleInput } from "@/modules/watch-history/schemas/watch-history-schedule";

export type ConfigureWatchHistoryScheduleResult =
  | { ok: true; message: string }
  | { ok: false; message: string; field?: "sourceType" | "intervalHours" };

export async function configureWatchHistorySchedule(
  userId: string,
  input: WatchHistoryScheduleInput,
): Promise<ConfigureWatchHistoryScheduleResult> {
  if (input.enabled) {
    const source = await findWatchHistorySourceByType(userId, input.sourceType);

    if (!source) {
      return {
        ok: false,
        message: "Run a manual sync once before enabling auto-sync for this source.",
        field: "sourceType",
      };
    }
  }

  const scheduleMinutes = input.intervalHours * 60;

  await saveRecurringJob({
    userId,
    jobType: "watch-history-sync",
    targetType: "watch-history-source",
    targetKey: input.sourceType,
    scheduleMinutes,
    isEnabled: input.enabled,
  });

  await createAuditEvent({
    actorUserId: userId,
    eventType: "watch-history.schedule.updated",
    subjectType: "watch-history-schedule",
    subjectId: input.sourceType,
    payloadJson: JSON.stringify({
      sourceType: input.sourceType,
      enabled: input.enabled,
      intervalHours: input.intervalHours,
    }),
  });

  return {
    ok: true,
    message: input.enabled
      ? `Auto-sync enabled every ${input.intervalHours} hour${input.intervalHours === 1 ? "" : "s"}.`
      : "Auto-sync disabled.",
  };
}