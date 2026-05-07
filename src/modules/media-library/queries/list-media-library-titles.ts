import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaFiles,
  mediaLibraries,
  mediaTitles,
  type MediaTitleStatus,
  type MediaQualityProfile,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type MediaLibraryTitleSummary = {
  id: string;
  libraryId: string | null;
  libraryName: string | null;
  mediaType: RecommendationMediaType;
  title: string;
  year: number | null;
  status: MediaTitleStatus;
  monitored: boolean;
  qualityProfile: MediaQualityProfile;
  overview: string | null;
  posterUrl: string | null;
  fileCount: number;
  qualityLabels: string[];
  lastFileModifiedAt: Date | null;
};

export type MediaLibraryTitleList = {
  mediaType: RecommendationMediaType;
  titles: MediaLibraryTitleSummary[];
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    firstItem: number;
    lastItem: number;
  };
  totals: {
    titles: number;
    files: number;
    monitored: number;
    missing: number;
  };
};

export type ListMediaLibraryTitlesInput = {
  query?: string | null;
  page?: number | null;
  pageSize?: number | null;
};

export const mediaLibraryTitlePageSize = 100;
const maxMediaLibraryTitlePageSize = 100;

function normalizeTitleQuery(query?: string | null) {
  return query?.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function resolvePositiveInteger(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function buildTitleFilters(userId: string, mediaType: RecommendationMediaType, normalizedQuery: string) {
  const filters: SQL[] = [
    eq(mediaTitles.userId, userId),
    eq(mediaTitles.mediaType, mediaType),
  ];

  if (normalizedQuery) {
    filters.push(sql`${mediaTitles.sortTitle} like ${`%${escapeLikePattern(normalizedQuery)}%`} escape '\\'`);
  }

  return and(...filters);
}

export async function listMediaLibraryTitles(
  userId: string,
  mediaType: RecommendationMediaType,
  input: ListMediaLibraryTitlesInput = {},
): Promise<MediaLibraryTitleList> {
  const database = ensureDatabaseReady();
  const normalizedQuery = normalizeTitleQuery(input.query);
  const pageSize = Math.min(
    resolvePositiveInteger(input.pageSize, mediaLibraryTitlePageSize),
    maxMediaLibraryTitlePageSize,
  );
  const requestedPage = resolvePositiveInteger(input.page, 1);
  const titleFilters = buildTitleFilters(userId, mediaType, normalizedQuery);
  const totals = database
    .select({
      titles: count(mediaTitles.id),
      monitored: sql<number>`coalesce(sum(case when ${mediaTitles.monitored} then 1 else 0 end), 0)`,
      missing: sql<number>`coalesce(sum(case when ${mediaTitles.status} = 'missing' then 1 else 0 end), 0)`,
    })
    .from(mediaTitles)
    .where(titleFilters)
    .get() ?? { titles: 0, monitored: 0, missing: 0 };
  const pageCount = Math.max(1, Math.ceil(totals.titles / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * pageSize;
  const titles = database
    .select({ title: mediaTitles, library: mediaLibraries })
    .from(mediaTitles)
    .leftJoin(mediaLibraries, eq(mediaLibraries.id, mediaTitles.libraryId))
    .where(titleFilters)
    .orderBy(asc(mediaTitles.sortTitle), asc(mediaTitles.id))
    .limit(pageSize)
    .offset(offset)
    .all();
  const filesTotal = database
    .select({ files: count(mediaFiles.id) })
    .from(mediaFiles)
    .innerJoin(mediaTitles, eq(mediaTitles.id, mediaFiles.titleId))
    .where(and(eq(mediaFiles.userId, userId), eq(mediaFiles.mediaType, mediaType), titleFilters))
    .get()?.files ?? 0;
  const titleIds = titles.map(({ title }) => title.id);
  const fileStats = titleIds.length === 0
    ? []
    : database
        .select({
          titleId: mediaFiles.titleId,
          fileCount: count(mediaFiles.id),
          qualityLabels: sql<string | null>`group_concat(distinct ${mediaFiles.qualityLabel})`,
          lastModifiedAtMs: sql<number | null>`max(${mediaFiles.modifiedAt})`,
        })
        .from(mediaFiles)
        .where(and(
          eq(mediaFiles.userId, userId),
          eq(mediaFiles.mediaType, mediaType),
          inArray(mediaFiles.titleId, titleIds),
        ))
        .groupBy(mediaFiles.titleId)
        .all();
  const fileStatsByTitle = new Map<string, { count: number; qualities: string[]; lastModifiedAt: Date | null }>();

  for (const stats of fileStats) {
    fileStatsByTitle.set(stats.titleId, {
      count: stats.fileCount,
      qualities: stats.qualityLabels?.split(",").filter(Boolean).sort() ?? [],
      lastModifiedAt: typeof stats.lastModifiedAtMs === "number" ? new Date(stats.lastModifiedAtMs) : null,
    });
  }

  const summaries = titles
    .map(({ title, library }) => {
      const stats = fileStatsByTitle.get(title.id);

      return {
        id: title.id,
        libraryId: title.libraryId,
        libraryName: library?.name ?? null,
        mediaType: title.mediaType,
        title: title.title,
        year: title.year,
        status: title.status,
        monitored: title.monitored,
        qualityProfile: title.qualityProfile,
        overview: title.overview,
        posterUrl: title.posterUrl,
        fileCount: stats?.count ?? 0,
        qualityLabels: stats?.qualities ?? [],
        lastFileModifiedAt: stats?.lastModifiedAt ?? null,
      } satisfies MediaLibraryTitleSummary;
    });
  const firstItem = summaries.length === 0 ? 0 : offset + 1;
  const lastItem = offset + summaries.length;

  return {
    mediaType,
    titles: summaries,
    pagination: {
      page,
      pageSize,
      pageCount,
      hasNextPage: page < pageCount,
      hasPreviousPage: page > 1,
      firstItem,
      lastItem,
    },
    totals: {
      titles: totals.titles,
      files: filesTotal,
      monitored: totals.monitored,
      missing: totals.missing,
    },
  };
}
