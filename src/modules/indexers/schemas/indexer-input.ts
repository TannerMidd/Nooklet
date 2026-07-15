import { z } from "zod";

import {
  indexerProtocols,
  recommendationMediaTypes,
} from "@/lib/database/schema";

const indexerUrlSchema = z
  .string()
  .trim()
  .min(1, "Provide an indexer URL.")
  .max(2048, "Indexer URL must be 2048 characters or fewer.")
  .url("Provide a valid indexer URL.")
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "Indexer URL must start with http:// or https://.",
  });

export const indexerCategoryInputSchema = z.object({
  mediaType: z.enum(recommendationMediaTypes),
  categoryId: z
    .string()
    .trim()
    .min(1, "Provide a category ID."),
  label: z
    .string()
    .trim()
    .max(80, "Category label must be 80 characters or fewer.")
    .optional(),
});

const optionalApiKeySchema = z
  .string()
  .trim()
  .min(1, "Provide an indexer API key.")
  .max(512, "Indexer API key must be 512 characters or fewer.");

const indexerSettingsInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Provide an indexer name.")
    .max(80, "Indexer name must be 80 characters or fewer."),
  protocol: z.enum(indexerProtocols),
  baseUrl: indexerUrlSchema,
  apiPath: z
    .string()
    .trim()
    .min(1, "Provide an API path.")
    .max(128, "API path must be 128 characters or fewer.")
    .regex(/^\/(?!\/)/, "API path must start with one /.")
    .default("/api"),
  isEnabled: z.boolean().default(true),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  categories: z
    .array(indexerCategoryInputSchema)
    .min(1, "Add at least one movie or TV category."),
});

export const addIndexerInputSchema = indexerSettingsInputSchema.extend({
  apiKey: optionalApiKeySchema,
});

export const updateIndexerInputSchema = indexerSettingsInputSchema.extend({
  id: z.string().trim().min(1, "Choose an indexer to edit."),
  apiKey: optionalApiKeySchema.optional(),
});

export const testIndexerInputSchema = z.object({
  id: z.string().trim().min(1, "Choose an indexer to test."),
});

export type AddIndexerInput = z.infer<typeof addIndexerInputSchema>;
export type UpdateIndexerInput = z.infer<typeof updateIndexerInputSchema>;
export type TestIndexerInput = z.infer<typeof testIndexerInputSchema>;
