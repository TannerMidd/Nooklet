import { z } from "zod";

const downloadQueueItemIdSchema = z.string().trim().min(1, "Queue item id is required.");

export const downloadQueueMoveDirectionSchema = z.enum(["up", "down"]);

export const downloadQueueActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pauseQueue") }).strict(),
  z.object({ type: z.literal("resumeQueue") }).strict(),
  z.object({ type: z.literal("pause"), itemId: downloadQueueItemIdSchema }).strict(),
  z.object({ type: z.literal("resume"), itemId: downloadQueueItemIdSchema }).strict(),
  z.object({ type: z.literal("remove"), itemId: downloadQueueItemIdSchema }).strict(),
  z.object({
    type: z.literal("move"),
    itemId: downloadQueueItemIdSchema,
    direction: downloadQueueMoveDirectionSchema,
  }).strict(),
  z.object({
    type: z.literal("moveToIndex"),
    itemId: downloadQueueItemIdSchema,
    targetIndex: z.number().int().nonnegative(),
  }).strict(),
]);

export type DownloadQueueMoveDirection = z.infer<typeof downloadQueueMoveDirectionSchema>;
export type DownloadQueueActionInput = z.infer<typeof downloadQueueActionSchema>;

export function getDownloadQueueActionKey(action: DownloadQueueActionInput) {
  switch (action.type) {
    case "pauseQueue":
    case "resumeQueue":
      return action.type;
    default:
      return `${action.type}:${action.itemId}`;
  }
}
