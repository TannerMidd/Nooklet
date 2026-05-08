import {
  updateMediaLibraryMonitoring,
} from "@/modules/media-library/repositories/media-library-repository";
import {
  type UpdateMediaLibraryMonitoringInput,
  updateMediaLibraryMonitoringInputSchema,
} from "@/modules/media-library/schemas/media-title-preferences";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export type UpdateMediaLibraryMonitoringResult = {
  monitored: boolean;
  titleCount: number;
  seasonCount: number;
  episodeCount: number;
};

export async function updateMediaLibraryMonitoringCommand(
  userId: string,
  input: UpdateMediaLibraryMonitoringInput,
): Promise<UpdateMediaLibraryMonitoringResult> {
  const parsed = updateMediaLibraryMonitoringInputSchema.parse(input);
  const result = await updateMediaLibraryMonitoring({
    userId,
    mediaType: parsed.mediaType === "all" ? undefined : parsed.mediaType,
    monitored: parsed.monitored,
  });

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "media-library.monitoring.bulk-updated",
    subjectType: "media-library",
    subjectId: parsed.mediaType,
    payload: {
      mediaType: parsed.mediaType,
      monitored: parsed.monitored,
      titleCount: result.titleCount,
      seasonCount: result.seasonCount,
      episodeCount: result.episodeCount,
    },
  });

  return { monitored: parsed.monitored, ...result };
}