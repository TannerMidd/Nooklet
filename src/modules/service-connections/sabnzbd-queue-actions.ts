import { z } from "zod";

const sabnzbdQueueItemIdSchema = z.string().trim().min(1, "Queue item id is required.");

export const sabnzbdQueueMoveDirectionSchema = z.enum(["up", "down"]);

export const sabnzbdQueueActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pauseQueue"),
  }),
  z.object({
    type: z.literal("resumeQueue"),
  }),
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

export function getSabnzbdQueueActionKey(action: SabnzbdQueueActionInput) {
  switch (action.type) {
    case "pauseQueue":
    case "resumeQueue":
      return action.type;
    default:
      return `${action.type}:${action.itemId}`;
  }
}

export function formatSabnzbdQueueActionMessage(action: SabnzbdQueueActionInput) {
  switch (action.type) {
    case "pauseQueue":
      return "Paused the download queue.";
    case "resumeQueue":
      return "Resumed the download queue.";
    case "pause":
      return "Paused the download.";
    case "resume":
      return "Resumed the download.";
    case "remove":
      return "Removed the download from the queue.";
    case "move":
      return action.direction === "up"
        ? "Moved the download up."
        : "Moved the download down.";
    case "moveToIndex":
      return "Reordered the download queue.";
  }
}