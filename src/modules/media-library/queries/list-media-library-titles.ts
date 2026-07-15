import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

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
    available: number;
    requested: number;
    missing: number;
  };
};

export type ListMediaLibraryTitlesInput = {
  query?: string | null;
  page?: number | null;
  pageSize?: number | null;
  status?: MediaTitleStatus | null;
  monitored?: boolean | null;
  libraryId?: string | "unassigned" | null;
  sort?: "title" | "recent" | "year" | "status" | null;
};

export const mediaLibraryTitlePageSize = 50;
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

function mediaFileExists(userId: string, mediaType: RecommendationMediaType) {
  return sql`exists (
    select 1
    from ${mediaFiles}
    where ${mediaFiles.userId} = ${userId}
      and ${mediaFiles.titleId} = ${mediaTitles.id}
      and ${mediaFiles.mediaType} = ${mediaType}
  )`;
}

function buildTitleFilters(
  userId: string,
  mediaType: RecommendationMediaType,
  normalizedQuery: string,
  input: ListMediaLibraryTitlesInput,
) {
  const filters: SQL[] = [
    eq(mediaTitles.userId, userId),
    eq(mediaTitles.mediaType, mediaType),
  ];

  if (normalizedQuery) {
    filters.push(sql`${mediaTitles.sortTitle} like ${`%${escapeLikePattern(normalizedQuery)}%`} escape '\\'`);
  }

  const hasMediaFile = mediaFileExists(userId, mediaType);
  if (input.status === "available") filters.push(hasMediaFile);
  if (input.status === "requested") {
    filters.push(sql`not ${hasMediaFile} and ${mediaTitles.status} = 'requested'`);
  }
  if (input.status === "missing") {
    filters.push(sql`not ${hasMediaFile} and ${mediaTitles.status} <> 'requested'`);
  }
  if (typeof input.monitored === "boolean") filters.push(eq(mediaTitles.monitored, input.monitored));
  if (input.libraryId === "unassigned") filters.push(isNull(mediaTitles.libraryId));
  else if (input.libraryId) filters.push(eq(mediaTitles.libraryId, input.libraryId));

  return and(...filters);
}

function titleOrder(input: ListMediaLibraryTitlesInput, hasMediaFile: SQL) {
  if (input.sort === "recent") return [desc(mediaTitles.updatedAt), asc(mediaTitles.sortTitle), asc(mediaTitles.id)];
  if (input.sort === "year") return [desc(mediaTitles.year), asc(mediaTitles.sortTitle), asc(mediaTitles.id)];
  if (input.sort === "status") {
    return [
      asc(sql`case when ${hasMediaFile} then 0 when ${mediaTitles.status} = 'requested' then 1 else 2 end`),
      asc(mediaTitles.sortTitle),
      asc(mediaTitles.id),
    ];
  }
  return [asc(mediaTitles.sortTitle), asc(mediaTitles.id)];
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
  const titleFilters = buildTitleFilters(userId, mediaType, normalizedQuery, input);
  const hasMediaFile = mediaFileExists(userId, mediaType);
  const totals = database
    .select({
      titles: count(mediaTitles.id),
      monitored: sql<number>`coalesce(sum(case when ${mediaTitles.monitored} then 1 else 0 end), 0)`,
      available: sql<number>`coalesce(sum(case when ${hasMediaFile} then 1 else 0 end), 0)`,
      requested: sql<number>`coalesce(sum(case when not ${hasMediaFile} and ${mediaTitles.status} = 'requested' then 1 else 0 end), 0)`,
      missing: sql<number>`coalesce(sum(case when not ${hasMediaFile} and ${mediaTitles.status} <> 'requested' then 1 else 0 end), 0)`,
    })
    .from(mediaTitles)
    .where(titleFilters)
    .get() ?? { titles: 0, monitored: 0, available: 0, requested: 0, missing: 0 };
  const pageCount = Math.max(1, Math.ceil(totals.titles / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * pageSize;
  const titles = database
    .select({ title: mediaTitles, library: mediaLibraries })
    .from(mediaTitles)
    .leftJoin(mediaLibraries, eq(mediaLibraries.id, mediaTitles.libraryId))
    .where(titleFilters)
    .orderBy(...titleOrder(input, hasMediaFile))
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
      const fileCount = stats?.count ?? 0;
      const status: MediaTitleStatus = fileCount > 0
        ? "available"
        : title.status === "requested"
          ? "requested"
          : "missing";

      return {
        id: title.id,
        libraryId: title.libraryId,
        libraryName: library?.name ?? null,
        mediaType: title.mediaType,
        title: title.title,
        year: title.year,
        status,
        monitored: title.monitored,
        qualityProfile: title.qualityProfile,
        overview: title.overview,
        posterUrl: title.posterUrl,
        fileCount,
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
      available: totals.available,
      requested: totals.requested,
      missing: totals.missing,
    },
  };
}
