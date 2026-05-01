import { z } from "zod";

export const libraryManagerServiceTypeSchema = z.enum(["sonarr", "radarr"]);

export const arrIndexerProtocolSchema = z.enum(["torrent", "usenet"]);

/**
 * Field value coming from the indexer-editor form. Schema-driven fields
 * round-trip whatever value the upstream schema provided, so we accept
 * the broad set Sonarr/Radarr actually emit.
 */
export const arrIndexerFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number()])),
]);

export const arrIndexerFieldInputSchema = z.object({
  name: z.string().trim().min(1, "Field name is required."),
  value: arrIndexerFieldValueSchema,
});

export const arrIndexerWriteSchema = z.object({
  serviceType: libraryManagerServiceTypeSchema,
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "Indexer name is required."),
  implementation: z.string().trim().min(1),
  implementationName: z.string().trim().min(1),
  configContract: z.string().trim().min(1),
  protocol: arrIndexerProtocolSchema,
  priority: z.coerce.number().int().min(1).max(50).default(25),
  enableRss: z.coerce.boolean().default(true),
  enableAutomaticSearch: z.coerce.boolean().default(true),
  enableInteractiveSearch: z.coerce.boolean().default(true),
  tags: z.array(z.coerce.number().int().nonnegative()).default([]),
  fields: z.array(arrIndexerFieldInputSchema).default([]),
  returnTo: z.string().trim().min(1),
});

export type ArrIndexerWriteInput = z.infer<typeof arrIndexerWriteSchema>;
export type ArrIndexerFieldInput = z.infer<typeof arrIndexerFieldInputSchema>;
