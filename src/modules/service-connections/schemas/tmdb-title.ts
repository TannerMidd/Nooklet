import { z } from "zod";

import {
  type TmdbCastMember,
  type TmdbSimilarTitle,
  type TmdbTitleDetails,
  type TmdbVideo,
  type TmdbWatchProvider,
  type TmdbWatchProviders,
} from "@/modules/service-connections/adapters/tmdb";

const mediaTypeSchema = z.enum(["tv", "movie"]);
const videoTypeSchema = z.enum(["Trailer", "Teaser", "Featurette", "Clip"]);
const watchProviderCategorySchema = z.enum(["flatrate", "rent", "buy"]);

export const tmdbVideoSchema = z.object({
  key: z.string().min(1),
  site: z.literal("YouTube"),
  type: videoTypeSchema,
  name: z.string().default(""),
  official: z.boolean().default(false),
  publishedAt: z.string().nullable().default(null),
}) satisfies z.ZodType<TmdbVideo>;

export const tmdbCastMemberSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  character: z.string().nullable().default(null),
  profileUrl: z.string().nullable().default(null),
  order: z.number().int().default(0),
}) satisfies z.ZodType<TmdbCastMember>;

export const tmdbWatchProviderSchema = z.object({
  providerId: z.number().int(),
  providerName: z.string().min(1),
  logoUrl: z.string().nullable().default(null),
  category: watchProviderCategorySchema,
  displayPriority: z.number().int().default(0),
}) satisfies z.ZodType<TmdbWatchProvider>;

export const tmdbWatchProvidersSchema = z.object({
  countryCode: z.string().min(1),
  link: z.string().nullable().default(null),
  providers: z.array(tmdbWatchProviderSchema).min(1),
}) satisfies z.ZodType<TmdbWatchProviders>;

export const tmdbSimilarTitleSchema = z.object({
  tmdbId: z.number().int(),
  mediaType: mediaTypeSchema,
  title: z.string().min(1),
  year: z.number().int().nullable().default(null),
  posterUrl: z.string().nullable().default(null),
  voteAverage: z.number().nullable().default(null),
}) satisfies z.ZodType<TmdbSimilarTitle>;

export const tmdbTitleDetailsSchema = z.object({
  source: z.literal("tmdb"),
  tmdbId: z.number().int().positive(),
  mediaType: mediaTypeSchema,
  title: z.string().min(1),
  originalTitle: z.string().nullable().default(null),
  overview: z.string().nullable().default(null),
  tagline: z.string().nullable().default(null),
  year: z.number().int().nullable().default(null),
  releaseDate: z.string().nullable().default(null),
  originalLanguage: z.string().nullable().default(null),
  posterUrl: z.string().nullable().default(null),
  backdropUrl: z.string().nullable().default(null),
  genres: z.array(z.string()).default([]),
  runtimeMinutes: z.number().int().nullable().default(null),
  seasonCount: z.number().int().nullable().default(null),
  status: z.string().nullable().default(null),
  voteAverage: z.number().nullable().default(null),
  voteCount: z.number().int().nullable().default(null),
  homepage: z.string().nullable().default(null),
  imdbId: z.string().nullable().default(null),
  tvdbId: z.number().int().nullable().default(null),
  videos: z.array(tmdbVideoSchema).catch([]).default([]),
  cast: z.array(tmdbCastMemberSchema).catch([]).default([]),
  watchProviders: tmdbWatchProvidersSchema.nullable().catch(null).default(null),
  similarTitles: z.array(tmdbSimilarTitleSchema).catch([]).default([]),
}) satisfies z.ZodType<TmdbTitleDetails>;
