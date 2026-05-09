import {
  findTvSeasonByIdForUser,
  updateTvSeasonMonitoring,
  type TvSeasonWithTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";
import {
  type UpdateTvSeasonMonitoringInput,
  updateTvSeasonMonitoringInputSchema,
} from "@/modules/media-library/schemas/tv-season-preferences";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export class UpdateTvSeasonMonitoringCommandError extends Error {
  constructor(
    message: string,
    public readonly code: "season_not_found",
  ) {
    super(message);
    this.name = "UpdateTvSeasonMonitoringCommandError";
  }
}

export async function updateTvSeasonMonitoringCommand(
  userId: string,
  input: UpdateTvSeasonMonitoringInput,
): Promise<TvSeasonWithTitleRecord> {
  const parsed = updateTvSeasonMonitoringInputSchema.parse(input);
  const existingSeason = await findTvSeasonByIdForUser(userId, parsed.seasonId);

  if (!existingSeason) {
    throw new UpdateTvSeasonMonitoringCommandError("Season was not found.", "season_not_found");
  }

  const updatedSeason = await updateTvSeasonMonitoring({
    userId,
    seasonId: parsed.seasonId,
    monitored: parsed.monitored,
  });

  if (!updatedSeason) {
    throw new UpdateTvSeasonMonitoringCommandError("Season was not found.", "season_not_found");
  }

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "media-library.tv-season.monitoring.updated",
    subjectType: "tv-season",
    subjectId: updatedSeason.season.id,
    payload: {
      titleId: updatedSeason.title.id,
      seasonNumber: updatedSeason.season.seasonNumber,
      monitored: parsed.monitored,
      previousMonitored: existingSeason.season.monitored,
    },
  });

  return updatedSeason;
}
