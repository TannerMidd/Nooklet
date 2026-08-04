import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import Image from "next/image";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { SegmentedLinks } from "@/components/ui/segmented-control";
import { StatusDot } from "@/components/ui/status-dot";
import { LibraryScanButton } from "@/app/(workspace)/library/library-scan-button";
import { LibraryTitleDialog } from "@/app/(workspace)/library/library-title-dialog";
import { getLibraryLastScannedAt } from "@/modules/media-library/queries/get-library-last-scanned-at";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
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
import { type MediaTitleStatus } from "@/lib/database/schema";

type LibraryBrowseState = {
  status?: MediaTitleStatus | null;
  monitored?: boolean | null;
  libraryId?: string | "unassigned" | null;
  sort?: "title" | "recent" | "year" | "status";
  view?: "list" | "grid";
};

const titleStatusPresentation = {
  available: { label: "Available", tone: "ok" },
  requested: { label: "Requested", tone: "active" },
  missing: { label: "Missing", tone: "error" },
} as const satisfies Record<MediaTitleStatus, { label: string; tone: "ok" | "active" | "error" | "neutral" }>;

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
  browse: LibraryBrowseState = {},
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

  if (browse.status) params.set("status", browse.status);
  if (typeof browse.monitored === "boolean") params.set("monitored", browse.monitored ? "yes" : "no");
  if (browse.libraryId) params.set("library", browse.libraryId);
  if (browse.sort && browse.sort !== "title") params.set("sort", browse.sort);
  if (browse.view === "grid") params.set("view", "grid");

  const queryString = params.toString();
  const pathname = mediaType === "tv" ? "/library/tv" : "/library/movies";

  return queryString ? `${pathname}?${queryString}` : pathname;
}

function PaginationControls({
  mediaType,
  query,
  pagination,
  browse,
}: {
  mediaType: RecommendationMediaType;
  query?: string | null;
  pagination: Awaited<ReturnType<typeof listMediaLibraryTitles>>["pagination"];
  browse: LibraryBrowseState;
}) {
  const rangeLabel = pagination.firstItem === 0
    ? "No titles"
    : `Showing ${pagination.firstItem}-${pagination.lastItem}`;

  const pageLinkClass =
    "relative inline-flex min-h-11 items-center justify-center rounded-full border border-cream/[0.14] px-4 text-xs font-semibold text-foreground transition hover:bg-cream/[0.06]";
  const pageDisabledClass =
    "inline-flex min-h-11 items-center justify-center rounded-full border border-cream/10 px-4 text-xs font-semibold text-muted opacity-50";

  return (
    <div className="flex flex-col gap-3 px-5 py-3.5 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
      <p>
        {rangeLabel} / page {pagination.page} of {pagination.pageCount}
      </p>
      <div className="flex gap-2">
        {pagination.hasPreviousPage ? (
          <Link href={buildLibraryPageHref(mediaType, query, pagination.page - 1, null, browse)} className={pageLinkClass}>
            <LinkPendingOverlay />
            Previous
          </Link>
        ) : (
          <span className={pageDisabledClass}>Previous</span>
        )}
        {pagination.hasNextPage ? (
          <Link href={buildLibraryPageHref(mediaType, query, pagination.page + 1, null, browse)} className={pageLinkClass}>
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
  browse,
}: {
  title: MediaLibraryTitleSummary;
  mediaType: RecommendationMediaType;
  query?: string | null;
  page: number;
  browse: LibraryBrowseState;
}) {
  const titleHref = buildLibraryPageHref(mediaType, query, page, title.id, browse);
  const fileLabel = `${title.fileCount} file${title.fileCount === 1 ? "" : "s"}`;
  const updatedLabel = title.lastFileModifiedAt?.toLocaleDateString() ?? "No files yet";
  const status = titleStatusPresentation[title.status];

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
            tone={status.tone}
            label={status.label}
          />
        </div>
        <div className="hidden text-[13px] text-muted md:block">
          <p>{fileLabel}</p>
          <p className="text-xs">{updatedLabel}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted md:hidden">
          <span>{status.label}</span>
          <span>{title.monitored ? "Monitored" : "Unmonitored"}</span>
          <span>{updatedLabel}</span>
        </div>
      </Link>
    </li>
  );
}

function TitleCard({
  title,
  mediaType,
  query,
  page,
  browse,
}: {
  title: MediaLibraryTitleSummary;
  mediaType: RecommendationMediaType;
  query?: string | null;
  page: number;
  browse: LibraryBrowseState;
}) {
  const status = titleStatusPresentation[title.status];

  return (
    <li>
      <Link
        href={buildLibraryPageHref(mediaType, query, page, title.id, browse)}
        scroll={false}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-cream/[0.08] bg-cream/[0.03] transition hover:-translate-y-0.5 hover:border-cream/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <LinkPendingOverlay />
        <div className="relative aspect-[2/3] overflow-hidden bg-panel">
          {title.posterUrl ? (
            <Image
              src={title.posterUrl}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 1280px) 13rem, 40vw"
              className="object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <span className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">No artwork</span>
          )}
          <span className="absolute left-2.5 top-2.5 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur">
            {status.label}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="line-clamp-2 font-semibold text-foreground">{title.title}{title.year ? ` (${title.year})` : ""}</p>
          <p className="mt-1 text-xs text-muted">{title.libraryName ?? "Unassigned"}</p>
          <p className="mt-auto pt-3 text-xs text-muted">
            {title.fileCount} file{title.fileCount === 1 ? "" : "s"} · {title.monitored ? "Monitored" : "Unmonitored"}
          </p>
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
  status,
  monitored,
  libraryId,
  sort = "title",
  view = "list",
}: {
  mediaType: RecommendationMediaType;
  query?: string | null;
  page?: number | null;
  detailsTitleId?: string | null;
  status?: MediaTitleStatus | null;
  monitored?: boolean | null;
  libraryId?: string | "unassigned" | null;
  sort?: "title" | "recent" | "year" | "status";
  view?: "list" | "grid";
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const browse = { status, monitored, libraryId, sort, view } satisfies LibraryBrowseState;
  const [library, lastScannedAt, libraryOverview] = await Promise.all([
    listMediaLibraryTitles(session.user.id, mediaType, { query, page, status, monitored, libraryId, sort }),
    getLibraryLastScannedAt(session.user.id, mediaType),
    listLibraryOverview(session.user.id),
  ]);
  const libraryOptions = libraryOverview.libraries.filter((item) => item.mediaType === mediaType);

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
  const closeDetailsHref = buildLibraryPageHref(mediaType, query, currentPage, null, browse);
  const hasFilters = Boolean(
    query?.trim()
    || status
    || typeof monitored === "boolean"
    || libraryId
    || sort !== "title"
    || view !== "list"
  );

  return (
    <div className="nk-enter space-y-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/library"
            className="relative -ml-2 mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-muted transition hover:text-foreground"
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
            {library.totals.available} available / {library.totals.requested} requested /{" "}
            {library.totals.missing} missing / {library.totals.monitored} monitored
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
        className="grid gap-3 rounded-2xl border border-cream/[0.08] bg-cream/[0.025] p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.6fr)_repeat(4,minmax(130px,0.7fr))_auto]"
        action={mediaType === "tv" ? "/library/tv" : "/library/movies"}
      >
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3">
          <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-muted" />
          <span className="sr-only">Title</span>
          <input name="q" defaultValue={query ?? ""} placeholder={mediaType === "tv" ? "Series title" : "Movie title"} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted/70" />
        </label>
        <label className="sr-only" htmlFor="library-status">Availability</label>
        <select id="library-status" name="status" defaultValue={status ?? ""} className="min-h-11 rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3 text-sm text-foreground">
          <option value="">Any status</option>
          <option value="available">Available</option>
          <option value="requested">Requested</option>
          <option value="missing">Missing</option>
        </select>
        <label className="sr-only" htmlFor="library-monitoring">Monitoring</label>
        <select id="library-monitoring" name="monitored" defaultValue={typeof monitored === "boolean" ? monitored ? "yes" : "no" : ""} className="min-h-11 rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3 text-sm text-foreground">
          <option value="">Any monitoring</option>
          <option value="yes">Monitored</option>
          <option value="no">Unmonitored</option>
        </select>
        <label className="sr-only" htmlFor="library-destination">Library</label>
        <select id="library-destination" name="library" defaultValue={libraryId ?? ""} className="min-h-11 rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3 text-sm text-foreground">
          <option value="">Any library</option>
          <option value="unassigned">Unassigned</option>
          {libraryOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="library-sort">Sort</label>
        <select id="library-sort" name="sort" defaultValue={sort} className="min-h-11 rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3 text-sm text-foreground">
          <option value="title">Title A–Z</option>
          <option value="recent">Recently changed</option>
          <option value="year">Newest year</option>
          <option value="status">Availability</option>
        </select>
        <input type="hidden" name="view" value={view} />
        <Button type="submit" variant="secondary" className="shrink-0">Apply</Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedLinks
          label="Library layout"
          options={[
            {
              href: buildLibraryPageHref(mediaType, query, 1, null, { ...browse, view: "list" }),
              label: "List",
              active: view === "list",
            },
            {
              href: buildLibraryPageHref(mediaType, query, 1, null, { ...browse, view: "grid" }),
              label: "Grid",
              active: view === "grid",
            },
          ]}
        />
        {hasFilters ? (
          <Link href={mediaType === "tv" ? "/library/tv" : "/library/movies"} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-accent">Clear filters</Link>
        ) : null}
      </div>

      {library.titles.length === 0 ? (
        <EmptyState
          message={hasFilters ? "No titles match those filters." : "No titles found."}
          action={hasFilters ? <Link href={mediaType === "tv" ? "/library/tv" : "/library/movies"} className="font-semibold text-accent">Clear filters</Link> : undefined}
        />
      ) : view === "grid" ? (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {library.titles.map((title) => (
              <TitleCard key={title.id} title={title} mediaType={mediaType} query={query} page={currentPage} browse={browse} />
            ))}
          </ul>
          <PaginationControls mediaType={mediaType} query={query} pagination={library.pagination} browse={browse} />
        </>
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
              <TitleRow key={title.id} title={title} mediaType={mediaType} query={query} page={currentPage} browse={browse} />
            ))}
          </ul>
          <div className="border-t border-cream/[0.05]">
            <PaginationControls mediaType={mediaType} query={query} pagination={library.pagination} browse={browse} />
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
