import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { StatusDot } from "@/components/ui/status-dot";
import { LibraryScanButton } from "@/app/(workspace)/library/library-scan-button";
import { LibraryTitleDialog } from "@/app/(workspace)/library/library-title-dialog";
import { getLibraryLastScannedAt } from "@/modules/media-library/queries/get-library-last-scanned-at";
import { getMediaLibraryMovieTitleDetails } from "@/modules/media-library/queries/get-media-library-movie-title-details";
import { getMediaLibraryTvTitleSummary } from "@/modules/media-library/queries/get-media-library-tv-title-summary";
import { getMediaTitleCurrentLibraryPathId } from "@/modules/media-library/queries/get-media-title-current-library-path";
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

  const pageLinkClass =
    "relative inline-flex h-8 items-center justify-center rounded-full border border-cream/[0.14] px-3.5 text-xs font-semibold text-foreground transition hover:bg-cream/[0.06]";
  const pageDisabledClass =
    "inline-flex h-8 items-center justify-center rounded-full border border-cream/10 px-3.5 text-xs font-semibold text-muted opacity-50";

  return (
    <div className="flex flex-col gap-3 px-5 py-3.5 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
      <p>
        {rangeLabel} / page {pagination.page} of {pagination.pageCount}
      </p>
      <div className="flex gap-2">
        {pagination.hasPreviousPage ? (
          <Link href={buildLibraryPageHref(mediaType, query, pagination.page - 1)} className={pageLinkClass}>
            <LinkPendingOverlay />
            Previous
          </Link>
        ) : (
          <span className={pageDisabledClass}>Previous</span>
        )}
        {pagination.hasNextPage ? (
          <Link href={buildLibraryPageHref(mediaType, query, pagination.page + 1)} className={pageLinkClass}>
            <LinkPendingOverlay />
            Next
          </Link>
        ) : (
          <span className={pageDisabledClass}>Next</span>
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
        className="relative grid gap-3 px-5 py-3 text-sm transition hover:bg-cream/[0.03] md:grid-cols-[minmax(0,1.8fr)_minmax(140px,0.8fr)_130px_120px_130px] md:items-center"
      >
        <LinkPendingOverlay />
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {title.title}{title.year ? ` (${title.year})` : ""}
          </p>
          <p className="truncate text-xs text-muted md:hidden">
            {title.libraryName ?? "Unassigned"} / {getMediaQualityProfileLabel(title.qualityProfile)} / {fileLabel}
          </p>
        </div>
        <p className="hidden truncate text-muted md:block">{title.libraryName ?? "Unassigned"}</p>
        <p className="hidden text-[13px] text-muted md:block">{getMediaQualityProfileLabel(title.qualityProfile)}</p>
        <div className="hidden md:block">
          <StatusDot
            tone={title.status === "missing" ? "active" : "ok"}
            label={title.status === "missing" ? "Missing" : "Available"}
          />
        </div>
        <div className="hidden text-[13px] text-muted md:block">
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
  const lastScannedAt = await getLibraryLastScannedAt(session.user.id, mediaType);

  const selectedTvTitle = detailsTitleId && mediaType === "tv"
    ? await getMediaLibraryTvTitleSummary(session.user.id, detailsTitleId)
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
  const currentLibraryPathId = hasSelectedTitle && detailsTitleId
    ? await getMediaTitleCurrentLibraryPathId({ userId: session.user.id, titleId: detailsTitleId })
    : null;
  const currentPage = library.pagination.page;
  const closeDetailsHref = buildLibraryPageHref(mediaType, query, currentPage);

  return (
    <div className="nk-enter space-y-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/library"
            className="relative mb-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition hover:text-foreground"
          >
            <LinkPendingOverlay />
            <ArrowLeft aria-hidden="true" size={14} />
            Library
          </Link>
          <h1 className="font-heading text-[40px] leading-[1.05] text-foreground">
            {mediaTypeLabel(mediaType)}
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            {titleCountLabel(mediaType, library.totals.titles)} / {library.totals.files} files /{" "}
            {library.totals.monitored} monitored / {library.totals.missing} missing
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3.5">
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Last synced</p>
            <p className="mt-0.5 text-[13px] font-semibold text-foreground">
              {lastScannedAt ? lastScannedAt.toLocaleString() : "Never"}
            </p>
          </div>
          <LibraryScanButton />
        </div>
      </header>

      <form
        className="flex max-w-[440px] items-center gap-3 rounded-xl border border-cream/[0.09] bg-cream/[0.03] px-4"
        action={mediaType === "tv" ? "/library/tv" : "/library/movies"}
      >
        <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-muted" />
        <input
          name="q"
          defaultValue={query ?? ""}
          placeholder={mediaType === "tv" ? "Filter series by title…" : "Filter movies by title…"}
          className="h-[42px] min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted/70"
        />
        <Button type="submit" variant="ghost" size="sm" className="shrink-0 text-accent">
          Filter
        </Button>
      </form>

      {library.titles.length === 0 ? (
        <EmptyState message="No titles found." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-cream/[0.08] bg-cream/[0.03]">
          <div className="hidden border-b border-cream/[0.07] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(140px,0.8fr)_130px_120px_130px] md:gap-3">
            <span>Title</span>
            <span>Library</span>
            <span>Profile</span>
            <span>Status</span>
            <span>Files</span>
          </div>
          <ul className="divide-y divide-cream/[0.05]">
            {library.titles.map((title) => (
              <TitleRow key={title.id} title={title} mediaType={mediaType} query={query} page={currentPage} />
            ))}
          </ul>
          <div className="border-t border-cream/[0.05]">
            <PaginationControls mediaType={mediaType} query={query} pagination={library.pagination} />
          </div>
        </div>
      )}

      {selectedTvTitle ? (
        <LibraryTitleDialog
          mediaType="tv"
          title={selectedTvTitle}
          closeHref={closeDetailsHref}
          qualityProfiles={qualityProfiles}
          targetPathOptions={targetPathOptions}
          currentLibraryPathId={currentLibraryPathId}
        />
      ) : null}
      {selectedMovieTitle ? (
        <LibraryTitleDialog
          mediaType="movie"
          title={selectedMovieTitle}
          closeHref={closeDetailsHref}
          qualityProfiles={qualityProfiles}
          targetPathOptions={targetPathOptions}
          currentLibraryPathId={currentLibraryPathId}
        />
      ) : null}
    </div>
  );
}
