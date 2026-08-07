import {
    findTvEpisodeByIdForUser,
    updateTvEpisodeMonitoring,
    type TvEpisodeWithTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";
import {
    type UpdateTvEpisodeMonitoringInput,
    updateTvEpisodeMonitoringInputSchema,
} from "@/modules/media-library/schemas/tv-episode-preferences";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export class UpdateTvEpisodeMonitoringCommandError extends Error {
    constructor(
        message: string,
        public readonly code: "episode_not_found",
    ) {
        super(message);
        this.name = "UpdateTvEpisodeMonitoringCommandError";
    }
}

export async function updateTvEpisodeMonitoringCommand(
    userId: string,
    input: UpdateTvEpisodeMonitoringInput,
): Promise<TvEpisodeWithTitleRecord> {
    const parsed = updateTvEpisodeMonitoringInputSchema.parse(input);
    const existingEpisode = await findTvEpisodeByIdForUser(userId, parsed.episodeId);

    if (!existingEpisode) {
        throw new UpdateTvEpisodeMonitoringCommandError(
            "Episode was not found.",
            "episode_not_found",
        );
    }

    const updatedEpisode = await updateTvEpisodeMonitoring({
        userId,
        episodeId: parsed.episodeId,
        monitored: parsed.monitored,
    });

    if (!updatedEpisode) {
        throw new UpdateTvEpisodeMonitoringCommandError(
            "Episode was not found.",
            "episode_not_found",
        );
    }

    await recordAuditEvent({
        actorUserId: userId,
        eventType: "media-library.tv-episode.monitoring.updated",
        subjectType: "tv-episode",
        subjectId: updatedEpisode.episode.id,
        payload: {
            titleId: updatedEpisode.title.id,
            seasonNumber: updatedEpisode.episode.seasonNumber,
            episodeNumber: updatedEpisode.episode.episodeNumber,
            monitored: parsed.monitored,
            previousMonitored: existingEpisode.episode.monitored,
        },
    });

    return updatedEpisode;
}
