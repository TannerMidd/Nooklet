import { z } from "zod";

import { mediaQualityProfiles, recommendationMediaTypes } from "@/lib/database/schema";

const optionalTextSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(2_000).nullable().optional(),
);

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().url().nullable().optional(),
);

const optionalNumberSchema = (schema: z.ZodNumber) => z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.coerce.number().pipe(schema).nullable().optional(),
);

const optionalShortTextSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().min(2).max(12).nullable().optional(),
);

export const requestMediaTitleInputSchema = z.object({
  mediaType: z.enum(recommendationMediaTypes),
  libraryId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().uuid().nullable().optional(),
  ),
  targetLibraryPathId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().uuid().nullable().optional(),
  ),
  tmdbId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  title: z.string().trim().min(1, "Enter a title.").max(200),
  year: optionalNumberSchema(z.number().int().min(1800).max(3000)),
  monitored: z.boolean().default(true),
  qualityProfile: z.enum(mediaQualityProfiles).default("hd-1080p"),
  overview: optionalTextSchema,
  posterUrl: optionalUrlSchema,
  backdropUrl: optionalUrlSchema,
  runtimeMinutes: optionalNumberSchema(z.number().int().positive()),
  originalLanguage: optionalShortTextSchema,
});

export type RequestMediaTitleInput = z.infer<typeof requestMediaTitleInputSchema>;
