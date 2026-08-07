import { z } from "zod";

export const updateTvEpisodeMonitoringInputSchema = z.object({
    episodeId: z.string().min(1, "Choose an episode."),
    monitored: z.boolean(),
});

export type UpdateTvEpisodeMonitoringInput = z.infer<typeof updateTvEpisodeMonitoringInputSchema>;
