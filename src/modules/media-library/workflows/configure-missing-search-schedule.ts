import { saveRecurringJob } from "@/modules/jobs/repositories/job-repository";
import {
  type MissingSearchScheduleInput,
  missingSearchScheduleInputSchema,
} from "@/modules/media-library/schemas/missing-search-schedule";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export type ConfigureMissingSearchScheduleResult = {
  ok: true;
  message: string;
};

export async function configureMissingSearchSchedule(
  userId: string,
  input: MissingSearchScheduleInput,
): Promise<ConfigureMissingSearchScheduleResult> {
  const parsed = missingSearchScheduleInputSchema.parse(input);

  await saveRecurringJob({
    userId,
    jobType: "missing-content-search",
    targetType: "media-library",
    targetKey: "all",
    scheduleMinutes: parsed.intervalMinutes,
    isEnabled: parsed.enabled,
  });

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "media-library.missing-search.schedule.updated",
    subjectType: "media-library-missing-search-schedule",
    subjectId: "all",
    payload: {
      enabled: parsed.enabled,
      intervalMinutes: parsed.intervalMinutes,
    },
  });

  return {
    ok: true,
    message: parsed.enabled
      ? `Missing-content search enabled every ${parsed.intervalMinutes} minutes.`
      : "Missing-content auto-search disabled.",
  };
}
