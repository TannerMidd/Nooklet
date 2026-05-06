import { z } from "zod";

export const queueIndexerResultInputSchema = z.object({
  resultId: z.string().uuid("Select a release and try again."),
});

export type QueueIndexerResultInput = z.infer<typeof queueIndexerResultInputSchema>;

export function validateQueueIndexerResultRequest(input: QueueIndexerResultInput) {
  return queueIndexerResultInputSchema.parse(input);
}
