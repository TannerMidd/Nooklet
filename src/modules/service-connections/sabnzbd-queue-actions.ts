import { z } from "zod";

const sabnzbdQueueItemIdSchema = z.string().trim().min(1, "Queue item id is required.");

export const sabnzbdQueueMoveDirectionSchema = z.enum(["up", "down"]);

export const sabnzbdQueueActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pause"),
    itemId: sabnzbdQueueItemIdSchema,
  }),
  z.object({
    type: z.literal("resume"),
    itemId: sabnzbdQueueItemIdSchema,
  }),
  z.object({
    type: z.literal("remove"),
    itemId: sabnzbdQueueItemIdSchema,
  }),
  z.object({
    type: z.literal("move"),
    itemId: sabnzbdQueueItemIdSchema,
    direction: sabnzbdQueueMoveDirectionSchema,
  }),
  z.object({
    type: z.literal("moveToIndex"),
    itemId: sabnzbdQueueItemIdSchema,
    targetIndex: z.number().int().nonnegative(),
  }),
]);

export type SabnzbdQueueMoveDirection = z.infer<typeof sabnzbdQueueMoveDirectionSchema>;
export type SabnzbdQueueActionInput = z.infer<typeof sabnzbdQueueActionSchema>;

export const sabnzbdQueuePageLimit = 100;

export function formatSabnzbdQueueActionMessage(action: SabnzbdQueueActionInput) {
  switch (action.type) {
    case "pause":
      return "Paused the SABnzbd queue item.";
    case "resume":
      return "Resumed the SABnzbd queue item.";
    case "remove":
      return "Removed the SABnzbd queue item from SABnzbd.";
    case "move":
      return action.direction === "up"
        ? "Moved the SABnzbd queue item up."
        : "Moved the SABnzbd queue item down.";
    case "moveToIndex":
      return "Reordered the SABnzbd queue item.";
  }
}