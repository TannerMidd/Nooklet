import { z } from "zod";

import {
  notificationChannelTypes,
  notificationEventTypes,
} from "@/lib/database/schema";

const targetUrlSchema = z
  .string()
  .min(1, "Provide a target URL.")
  .url("Provide a valid URL.")
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "URL must start with http:// or https://.",
  });

export const addNotificationChannelInputSchema = z.object({
  channelType: z.enum(notificationChannelTypes),
  displayName: z
    .string()
    .min(1, "Provide a display name.")
    .max(80, "Display name must be 80 characters or fewer."),
  targetUrl: targetUrlSchema,
  isEnabled: z.boolean().default(true),
  events: z
    .array(z.enum(notificationEventTypes))
    .min(1, "Choose at least one event to notify on."),
});

export type AddNotificationChannelInput = z.infer<typeof addNotificationChannelInputSchema>;

export const updateNotificationChannelInputSchema = z.object({
  id: z.string().min(1),
  displayName: z
    .string()
    .min(1, "Provide a display name.")
    .max(80, "Display name must be 80 characters or fewer.")
    .optional(),
  targetUrl: targetUrlSchema.optional(),
  isEnabled: z.boolean().optional(),
  events: z
    .array(z.enum(notificationEventTypes))
    .min(1, "Choose at least one event to notify on.")
    .optional(),
});

export type UpdateNotificationChannelInput = z.infer<typeof updateNotificationChannelInputSchema>;

export const deleteNotificationChannelInputSchema = z.object({
  id: z.string().min(1),
});

export const testNotificationChannelInputSchema = z.object({
  id: z.string().min(1),
});
