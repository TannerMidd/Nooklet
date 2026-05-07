import { z } from "zod";

export const queueIndexerResultInputSchema = z.object({
  resultId: z.string().uuid("Select a release and try again."),
  mediaTitleId: z.string().uuid().optional(),
  episodeId: z.string().uuid().optional(),
  requestedTitle: z.string().trim().min(1).max(200).optional(),
  targetLibraryId: z.string().uuid().nullable().optional(),
  targetLibraryPathId: z.string().uuid().nullable().optional(),
});

export type QueueIndexerResultInput = z.infer<typeof queueIndexerResultInputSchema>;

export function validateQueueIndexerResultRequest(input: QueueIndexerResultInput) {
  return queueIndexerResultInputSchema.parse(input);
}
