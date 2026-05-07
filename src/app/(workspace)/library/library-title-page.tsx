import Link from "next/link";

import { auth } from "@/auth";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { MediaTitlePreferencesForm } from "@/app/(workspace)/library/media-title-preferences-form";
import { RemoveMediaTitleForm } from "@/app/(workspace)/library/remove-media-title-form";
import {
  listMediaLibraryTitles,
  type MediaLibraryTitleSummary,
} from "@/modules/media-library/queries/list-media-library-titles";
import {
  listMediaLibraryPathOptions,
  type MediaLibraryPathOption,
} from "@/modules/media-library/queries/list-media-library-path-options";
import {
  getMediaQualityProfileLabel,
  listMediaQualityProfiles,
  type MediaQualityProfileOption,
} from "@/modules/media-library/queries/list-media-quality-profiles";
import { type RecommendationMediaType } from "@/lib/database/schema";

function mediaTypeLabel(mediaType: RecommendationMediaType) {
  return mediaType === "tv" ? "TV library" : "Movie library";
}

function titleCountLabel(mediaType: RecommendationMediaType, count: number) {
  const label = mediaType === "tv" ? "series" : "movie";
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function buildLibraryPageHref(mediaType: RecommendationMediaType, query: string | null | undefined, page: number) {
  const params = new URLSearchParams();
  const trimmedQuery = query?.trim();

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  if (page > 1) {
    params.set("page", String(page));
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

function TitleCard({
  title,
  mediaType,
  qualityProfiles,
  targetPathOptions,
}: {
  title: MediaLibraryTitleSummary;
  mediaType: RecommendationMediaType;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
}) {
  const qualityLabel = title.qualityLabels.length > 0 ? title.qualityLabels.join(" / ") : "No quality tag";
  const titleHref = mediaType === "tv" ? `/library/tv/${title.id}` : null;

  return (
    <li className="rounded-lg border border-line/70 bg-panel-strong/60 p-4">
      <div className="flex gap-4">
        <RecommendationPoster title={title.title} posterUrl={title.posterUrl} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="min-w-0 space-y-1">
            {titleHref ? (
              <Link href={titleHref} className="break-words font-heading text-lg leading-tight text-foreground hover:text-accent">
                {title.title}{title.year ? ` (${title.year})` : ""}
              </Link>
            ) : (
              <p className="break-words font-heading text-lg leading-tight text-foreground">
                {title.title}{title.year ? ` (${title.year})` : ""}
              </p>
            )}
            <p className="text-sm text-muted">
              {title.libraryName ?? "Unassigned"} / {title.fileCount} file{title.fileCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1 capitalize">{title.status}</span>
            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
              {title.monitored ? "Monitored" : "Unmonitored"}
            </span>
            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
              {getMediaQualityProfileLabel(title.qualityProfile)}
            </span>
            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">{qualityLabel}</span>
            {title.lastFileModifiedAt ? (
              <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                {title.lastFileModifiedAt.toLocaleDateString()}
              </span>
            ) : null}
          </div>
          {title.overview ? <p className="line-clamp-2 text-sm leading-6 text-muted">{title.overview}</p> : null}
          <div className="flex flex-wrap items-start gap-2">
            <LibraryItemSearchForm
              titleId={title.id}
              label={mediaType === "tv" ? "Search series" : "Search movie"}
              targetPathOptions={targetPathOptions}
            />
            {titleHref ? (
              <Link
                href={titleHref}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line/75 bg-panel-strong/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-accent/35 hover:bg-panel-raised/70"
              >
                Open series
              </Link>
            ) : null}
            <RemoveMediaTitleForm titleId={title.id} />
          </div>
          <MediaTitlePreferencesForm
            titleId={title.id}
            monitored={title.monitored}
            qualityProfile={title.qualityProfile}
            qualityProfiles={qualityProfiles}
          />
        </div>
      </div>
    </li>
  );
}

export async function LibraryTitlePage({
  mediaType,
  query,
  page,
}: {
  mediaType: RecommendationMediaType;
  query?: string | null;
  page?: number | null;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [library, pathOptions] = await Promise.all([
    listMediaLibraryTitles(session.user.id, mediaType, { query, page }),
    listMediaLibraryPathOptions(session.user.id),
  ]);
  const qualityProfiles = listMediaQualityProfiles();
  const mediaTypePathOptions = pathOptions.filter((option) => option.mediaType === mediaType);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Built-in library"
        title={mediaTypeLabel(mediaType)}
        description={mediaType === "tv" ? "Browse series discovered in local TV folders." : "Browse movies discovered in local movie folders."}
        actions={(
          <Link
            href="/library"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line/75 bg-panel-strong/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/35 hover:bg-panel-raised/70"
          >
            Manage folders
          </Link>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Titles</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{library.totals.titles}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Files</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{library.totals.files}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Monitored</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{library.totals.monitored}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Missing</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{library.totals.missing}</p>
        </div>
      </div>

      <Panel eyebrow="Browse" title={titleCountLabel(mediaType, library.totals.titles)}>
        <form className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" action={mediaType === "tv" ? "/library/tv" : "/library/movies"}>
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
            <ul className="grid gap-3 xl:grid-cols-2">
              {library.titles.map((title) => (
                <TitleCard
                  key={title.id}
                  title={title}
                  mediaType={mediaType}
                  qualityProfiles={qualityProfiles}
                  targetPathOptions={mediaTypePathOptions.filter((option) => (
                    title.libraryId ? option.libraryId === title.libraryId : true
                  ))}
                />
              ))}
            </ul>
            <PaginationControls mediaType={mediaType} query={query} pagination={library.pagination} />
          </div>
        )}
      </Panel>
    </div>
  );
}
