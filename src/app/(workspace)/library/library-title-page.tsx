import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { LibraryTitleDialog } from "@/app/(workspace)/library/library-title-dialog";
import { getMediaLibraryMovieTitleDetails } from "@/modules/media-library/queries/get-media-library-movie-title-details";
import { getMediaLibraryTvTitleDetails } from "@/modules/media-library/queries/get-media-library-tv-title-details";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import {
  listMediaLibraryTitles,
  type MediaLibraryTitleSummary,
} from "@/modules/media-library/queries/list-media-library-titles";
import {
  getMediaQualityProfileLabel,
  listMediaQualityProfiles,
} from "@/modules/media-library/queries/list-media-quality-profiles";
import { type RecommendationMediaType } from "@/lib/database/schema";

function mediaTypeLabel(mediaType: RecommendationMediaType) {
  return mediaType === "tv" ? "TV library" : "Movie library";
}

function titleCountLabel(mediaType: RecommendationMediaType, count: number) {
  const label = mediaType === "tv" ? "series" : "movie";
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function buildLibraryPageHref(
  mediaType: RecommendationMediaType,
  query: string | null | undefined,
  page: number,
  detailsTitleId?: string | null,
) {
  const params = new URLSearchParams();
  const trimmedQuery = query?.trim();

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  if (detailsTitleId) {
    params.set("details", detailsTitleId);
  }

  const queryString = params.toString();
  const pathname = mediaType === "tv" ? "/library/tv" : "/library/movies";

  return queryString ? `${pathname}?${queryString}` : pathname;
}

function PaginationControls({
  mediaType,
  query,
  pagination,
}: {
  mediaType: RecommendationMediaType;
  query?: string | null;
  pagination: Awaited<ReturnType<typeof listMediaLibraryTitles>>["pagination"];
}) {
  const rangeLabel = pagination.firstItem === 0
    ? "No titles"
    : `Showing ${pagination.firstItem}-${pagination.lastItem}`;

  return (
    <div className="flex flex-col gap-3 border-t border-line/60 pt-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
      <p>
        {rangeLabel} / page {pagination.page} of {pagination.pageCount}
      </p>
      <div className="flex gap-2">
        {pagination.hasPreviousPage ? (
          <Link
            href={buildLibraryPageHref(mediaType, query, pagination.page - 1)}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line/75 bg-panel-strong/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-accent/35 hover:bg-panel-raised/70"
          >
            Previous
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line/50 bg-background/20 px-3 py-2 text-xs font-semibold text-muted opacity-60">
            Previous
          </span>
        )}
        {pagination.hasNextPage ? (
          <Link
            href={buildLibraryPageHref(mediaType, query, pagination.page + 1)}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line/75 bg-panel-strong/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-accent/35 hover:bg-panel-raised/70"
          >
            Next
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line/50 bg-background/20 px-3 py-2 text-xs font-semibold text-muted opacity-60">
            Next
          </span>
        )}
      </div>
    </div>
  );
}

function TitleRow({
  title,
  mediaType,
  query,
  page,
}: {
  title: MediaLibraryTitleSummary;
  mediaType: RecommendationMediaType;
  query?: string | null;
  page: number;
}) {
  const titleHref = buildLibraryPageHref(mediaType, query, page, title.id);
  const fileLabel = `${title.fileCount} file${title.fileCount === 1 ? "" : "s"}`;
  const updatedLabel = title.lastFileModifiedAt?.toLocaleDateString() ?? "No files yet";

  return (
    <li>
      <Link
        href={titleHref}
        scroll={false}
        className="grid gap-3 px-4 py-3 text-sm transition hover:bg-panel-strong/55 md:grid-cols-[minmax(0,1.8fr)_minmax(140px,0.8fr)_120px_120px_120px] md:items-center"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {title.title}{title.year ? ` (${title.year})` : ""}
          </p>
          <p className="truncate text-xs text-muted md:hidden">
            {title.libraryName ?? "Unassigned"} / {getMediaQualityProfileLabel(title.qualityProfile)} / {fileLabel}
          </p>
        </div>
        <p className="hidden truncate text-muted md:block">{title.libraryName ?? "Unassigned"}</p>
        <p className="hidden text-muted md:block">{getMediaQualityProfileLabel(title.qualityProfile)}</p>
        <div className="hidden items-center gap-2 md:flex">
          <span className={title.status === "missing" ? "h-2 w-2 rounded-full bg-amber-400" : "h-2 w-2 rounded-full bg-emerald-400"} />
          <span className="capitalize text-muted">{title.status}</span>
        </div>
        <div className="hidden text-muted md:block">
          <p>{fileLabel}</p>
          <p className="text-xs">{updatedLabel}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted md:hidden">
          <span className="capitalize">{title.status}</span>
          <span>{title.monitored ? "Monitored" : "Unmonitored"}</span>
          <span>{updatedLabel}</span>
        </div>
      </Link>
    </li>
  );
}

function TitleRows({
  titles,
  mediaType,
  query,
  page,
}: {
  titles: MediaLibraryTitleSummary[];
  mediaType: RecommendationMediaType;
  query?: string | null;
  page: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line/70 bg-background/15">
      <div className="hidden border-b border-line/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(140px,0.8fr)_120px_120px_120px]">
        <span>Title</span>
        <span>Library</span>
        <span>Profile</span>
        <span>Status</span>
        <span>Files</span>
      </div>
      <ul className="divide-y divide-line/55">
        {titles.map((title) => (
          <TitleRow key={title.id} title={title} mediaType={mediaType} query={query} page={page} />
        ))}
      </ul>
    </div>
  );
}

function LibrarySummary({
  mediaType,
  totals,
}: {
  mediaType: RecommendationMediaType;
  totals: Awaited<ReturnType<typeof listMediaLibraryTitles>>["totals"];
}) {
  const titleLabel = titleCountLabel(mediaType, totals.titles);

  return (
    <p className="text-sm text-muted">
      {titleLabel} / {totals.files} files / {totals.monitored} monitored / {totals.missing} missing
    </p>
  );
}

export async function LibraryTitlePage({
  mediaType,
  query,
  page,
  detailsTitleId,
}: {
  mediaType: RecommendationMediaType;
  query?: string | null;
  page?: number | null;
  detailsTitleId?: string | null;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const library = await listMediaLibraryTitles(session.user.id, mediaType, { query, page });
  const selectedTvTitle = detailsTitleId && mediaType === "tv"
    ? await getMediaLibraryTvTitleDetails(session.user.id, detailsTitleId)
    : null;
  const selectedMovieTitle = detailsTitleId && mediaType === "movie"
    ? await getMediaLibraryMovieTitleDetails(session.user.id, detailsTitleId)
    : null;
  const selectedLibraryId = selectedTvTitle?.libraryId ?? selectedMovieTitle?.libraryId ?? null;
  const hasSelectedTitle = Boolean(selectedTvTitle ?? selectedMovieTitle);
  const qualityProfiles = hasSelectedTitle ? listMediaQualityProfiles() : [];
  const targetPathOptions = hasSelectedTitle
    ? (await listMediaLibraryPathOptions(session.user.id)).filter((option) => (
        option.mediaType === mediaType && (selectedLibraryId ? option.libraryId === selectedLibraryId : true)
      ))
    : [];
  const currentPage = library.pagination.page;
  const closeDetailsHref = buildLibraryPageHref(mediaType, query, currentPage);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Built-in library"
        title={mediaTypeLabel(mediaType)}
        description={mediaType === "tv" ? "Browse series discovered in local TV folders." : "Browse movies discovered in local movie folders."}
        actions={(
          <Link
            href="/library"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line/75 bg-panel-strong/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/35 hover:bg-panel-raised/70"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            Library home
          </Link>
        )}
      />

      <Panel eyebrow="Browse" title={titleCountLabel(mediaType, library.totals.titles)}>
        <LibrarySummary mediaType={mediaType} totals={library.totals} />
        <form className="mb-5 mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" action={mediaType === "tv" ? "/library/tv" : "/library/movies"}>
          <Input name="q" defaultValue={query ?? ""} placeholder={mediaType === "tv" ? "Filter series" : "Filter movies"} />
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
        {library.titles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line/75 bg-background/20 p-4 text-sm text-muted">
            No titles found.
          </p>
        ) : (
          <div className="space-y-5">
            <PaginationControls mediaType={mediaType} query={query} pagination={library.pagination} />
            <TitleRows titles={library.titles} mediaType={mediaType} query={query} page={currentPage} />
            <PaginationControls mediaType={mediaType} query={query} pagination={library.pagination} />
          </div>
        )}
      </Panel>

      {selectedTvTitle ? (
        <LibraryTitleDialog
          mediaType="tv"
          title={selectedTvTitle}
          closeHref={closeDetailsHref}
          qualityProfiles={qualityProfiles}
          targetPathOptions={targetPathOptions}
        />
      ) : null}
      {selectedMovieTitle ? (
        <LibraryTitleDialog
          mediaType="movie"
          title={selectedMovieTitle}
          closeHref={closeDetailsHref}
          qualityProfiles={qualityProfiles}
          targetPathOptions={targetPathOptions}
        />
      ) : null}
    </div>
  );
}
