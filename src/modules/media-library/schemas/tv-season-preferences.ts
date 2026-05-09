import { z } from "zod";

export const updateTvSeasonMonitoringInputSchema = z.object({
  seasonId: z.string().min(1, "Choose a season."),
  monitored: z.boolean(),
});

export type UpdateTvSeasonMonitoringInput = z.infer<typeof updateTvSeasonMonitoringInputSchema>;
