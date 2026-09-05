import { z } from "zod";

import { inspectCredentialBearingUrl } from "@/lib/security/credential-url";

export const serviceConnectionTypeSchema = z.enum([
    "ai-provider",
    "tautulli",
    "plex",
    "usenet-server",
    "tmdb",
    "tvdb",
    "trakt",
    "youtube",
]);
export const serviceConnectionIntentSchema = z.enum(["save", "test-save", "verify", "disconnect"]);

const apiKeySchema = z
    .string()
    .trim()
    .max(1024)
    .optional()
    .transform((value) => value ?? "");

const baseUrlSchema = z
    .string()
    .trim()
    .max(2048)
    .url("Enter a valid base URL.")
    .superRefine((value, context) => {
        const inspection = inspectCredentialBearingUrl(value);

        if (inspection.issue && inspection.issue !== "invalid") {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Base URLs must not contain embedded credentials.",
            });
        }
    });

export const aiProviderConnectionSchema = z.object({
    serviceType: z.literal("ai-provider"),
    baseUrl: baseUrlSchema,
    apiKey: apiKeySchema,
    model: z.string().trim().min(1, "Enter a model identifier.").max(200),
});

export const apiKeyServiceConnectionSchema = z.object({
    serviceType: z.enum(["tautulli", "plex", "usenet-server", "tmdb", "tvdb", "trakt"]),
    baseUrl: baseUrlSchema,
    apiKey: apiKeySchema,
});

export type ServiceConnectionIntent = z.infer<typeof serviceConnectionIntentSchema>;
export type ServiceConnectionTypeInput = z.infer<typeof serviceConnectionTypeSchema>;
export type AiProviderConnectionInput = z.infer<typeof aiProviderConnectionSchema>;
export type ApiKeyServiceConnectionInput = z.infer<typeof apiKeyServiceConnectionSchema>;
