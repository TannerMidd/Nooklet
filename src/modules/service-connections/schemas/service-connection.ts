import { z } from "zod";

export const serviceConnectionTypeSchema = z.enum(["ai-provider", "sonarr", "radarr", "tautulli", "plex", "sabnzbd", "tmdb"]);
export const serviceConnectionIntentSchema = z.enum(["save", "verify", "disconnect"]);

const apiKeySchema = z.string().trim().max(1024).optional().transform((value) => value ?? "");

export const aiProviderConnectionSchema = z.object({
  serviceType: z.literal("ai-provider"),
  baseUrl: z.string().trim().url("Enter a valid base URL."),
  apiKey: apiKeySchema,
  model: z.string().trim().min(1, "Enter a model identifier.").max(200),
});

export const apiKeyServiceConnectionSchema = z.object({
  serviceType: z.enum(["sonarr", "radarr", "tautulli", "plex", "sabnzbd", "tmdb"]),
  baseUrl: z.string().trim().url("Enter a valid base URL."),
  apiKey: apiKeySchema,
});

export type ServiceConnectionIntent = z.infer<typeof serviceConnectionIntentSchema>;
export type ServiceConnectionTypeInput = z.infer<typeof serviceConnectionTypeSchema>;
export type AiProviderConnectionInput = z.infer<typeof aiProviderConnectionSchema>;
export type ApiKeyServiceConnectionInput = z.infer<typeof apiKeyServiceConnectionSchema>;
