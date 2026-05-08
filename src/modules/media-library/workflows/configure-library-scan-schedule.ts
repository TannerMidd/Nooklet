import { saveRecurringJob } from "@/modules/jobs/repositories/job-repository";
import {
  type LibraryScanScheduleInput,
  libraryScanScheduleInputSchema,
} from "@/modules/media-library/schemas/library-scan-schedule";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export type ConfigureLibraryScanScheduleResult = {
  ok: true;
  message: string;
};

export async function configureLibraryScanSchedule(
  userId: string,
  input: LibraryScanScheduleInput,
): Promise<ConfigureLibraryScanScheduleResult> {
  const parsed = libraryScanScheduleInputSchema.parse(input);

  await saveRecurringJob({
    userId,
    jobType: "media-library-scan",
    targetType: "media-library",
    targetKey: "all",
    scheduleMinutes: parsed.intervalMinutes,
    isEnabled: parsed.enabled,
  });

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "media-library.scan.schedule.updated",
    subjectType: "media-library-scan-schedule",
    subjectId: "all",
    payload: {
      enabled: parsed.enabled,
      intervalMinutes: parsed.intervalMinutes,
    },
  });

  return {
    ok: true,
    message: parsed.enabled
      ? `Library scan enabled every ${parsed.intervalMinutes} minutes.`
      : "Library auto-scan disabled.",
  };
}