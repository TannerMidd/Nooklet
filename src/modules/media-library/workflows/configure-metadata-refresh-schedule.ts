import { saveRecurringJob } from "@/modules/jobs/repositories/job-repository";
import {
  type MetadataRefreshScheduleInput,
  metadataRefreshScheduleInputSchema,
} from "@/modules/media-library/schemas/metadata-refresh-schedule";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export type ConfigureMetadataRefreshScheduleResult = {
  ok: true;
  message: string;
};

export async function configureMetadataRefreshSchedule(
  userId: string,
  input: MetadataRefreshScheduleInput,
): Promise<ConfigureMetadataRefreshScheduleResult> {
  const parsed = metadataRefreshScheduleInputSchema.parse(input);

  await saveRecurringJob({
    userId,
    jobType: "metadata-refresh",
    targetType: "media-library",
    targetKey: "all",
    scheduleMinutes: parsed.intervalMinutes,
    isEnabled: parsed.enabled,
  });

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "media-library.metadata-refresh.schedule.updated",
    subjectType: "media-library-metadata-refresh-schedule",
    subjectId: "all",
    payload: {
      enabled: parsed.enabled,
      intervalMinutes: parsed.intervalMinutes,
    },
  });

  return {
    ok: true,
    message: parsed.enabled
      ? `Series metadata refresh enabled every ${parsed.intervalMinutes} minutes.`
      : "Series metadata refresh disabled.",
  };
}
