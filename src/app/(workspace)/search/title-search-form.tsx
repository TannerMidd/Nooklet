"use client";

import { CalendarDays, Check, ChevronDown, DatabaseZap, Download, HardDrive, Search } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  requestSearchTitleAction,
} from "@/app/(workspace)/search/actions";
import {
  initialRequestSearchTitleActionState,
  type RequestSearchTitleActionState,
  type SearchResultView,
  type TitleSearchActionState,
  type TitleSearchResultView,
} from "@/app/(workspace)/search/action-state";
import { QueueResultButton } from "@/app/(workspace)/search/queue-result-button";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import {
  TitleRequestControls,
  type LibraryOption,
  type QualityProfileOption,
} from "@/components/media-library/title-request-controls";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Spinner } from "@/components/ui/spinner";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

type RequestOptionsProps = {
  libraries: LibraryOption[];
  qualityProfiles: readonly QualityProfileOption[];
  pathOptions: MediaLibraryPathOption[];
};

type TitleSearchFormProps = RequestOptionsProps & {
  initialQuery: string;
  initialMediaType: "movie" | "tv";
  initialState: TitleSearchActionState;
};

function StatusBanner({ state }: { state: TitleSearchActionState | RequestSearchTitleActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <InlineAlert
      variant={state.status === "success" ? "success" : state.status === "warning" ? "warning" : "error"}
      className="py-2 text-foreground"
    >
      {state.message}
    </InlineAlert>
  );
}

function SearchSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="shrink-0" disabled={pending}>
      {pending ? "Searching..." : "Search"}
    </Button>
  );
}

function AddTitleButton({
  downloadNow,
  state,
}: {
  downloadNow: boolean;
  state: RequestSearchTitleActionState;
}) {
  const { pending } = useFormStatus();
  const isComplete = state.status === "success" || state.status === "warning";
  const label = state.outcome === "queued"
    ? "Download queued"
    : state.outcome === "catalog_added"
      ? "Added to catalog"
      : isComplete
        ? "Added; download needs attention"
        : downloadNow
          ? "Request & download"
          : "Add to library only";
  const Icon = isComplete ? Check : Download;

  return (
    <div className="space-y-2">
      <Button type="submit" className="w-full sm:w-auto" disabled={pending || isComplete}>
        {pending ? <Spinner /> : <Icon aria-hidden="true" size={17} />}
        {pending ? "Requesting..." : label}
      </Button>
      {pending ? (
        <p className="text-xs text-muted" role="status">
          Syncing metadata and searching indexers — a full series can take a minute.
        </p>
      ) : null}
    </div>
  );
}

function formatBytes(value: number | null) {
  if (value === null) {
    return "Unknown size";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatPublishedAt(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function TitleMeta({ title }: { title: TitleSearchResultView }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted">
      <span className="rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
        {title.mediaType === "tv" ? "TV" : "Movie"}
      </span>
      {title.year ? (
        <span className="rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">{title.year}</span>
      ) : null}
      {title.voteAverage !== null ? (
        <span className="rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
          TMDB {title.voteAverage.toFixed(1)}
        </span>
      ) : null}
    </div>
  );
}

function ReleaseResults({
  results,
  mediaTitleId,
  seasonId,
  episodeId,
  targetLibraryPathId,
}: {
  results: SearchResultView[];
  mediaTitleId: string | null;
  seasonId: string | null;
  episodeId: string | null;
  targetLibraryPathId: string | null;
}) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-cream/[0.08] bg-cream/[0.03] p-3">
      <p className="text-sm font-medium text-foreground">Release candidates</p>
      <ul className="space-y-2">
        {results.map((result) => (
          <li key={result.id} className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] p-3">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="break-words text-sm font-medium text-foreground">{result.title}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  <span className="rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
                    {result.protocol === "newznab" ? "Usenet" : result.protocol === "torznab" ? "Torrent" : "Unknown protocol"}
                  </span>
                  {result.qualityLabel ? (
                    <span className="rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">{result.qualityLabel}</span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
                    <HardDrive aria-hidden="true" size={13} />
                    {formatBytes(result.sizeBytes)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
                    <CalendarDays aria-hidden="true" size={13} />
                    {formatPublishedAt(result.publishedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
                    <DatabaseZap aria-hidden="true" size={13} />
                    S {result.seeders ?? "?"} / L {result.leechers ?? "?"}
                  </span>
                </div>
              </div>
              {result.protocol === "newznab" ? (
                <QueueResultButton
                  resultId={result.id}
                  mediaTitleId={mediaTitleId}
                  seasonId={seasonId}
                  episodeId={episodeId}
                  targetLibraryPathId={targetLibraryPathId}
                />
              ) : (
                <div className="max-w-52 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-xs leading-5 text-muted">
                  Nooklet is Usenet-only. This release cannot be queued.
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestTitleForm({
  title,
  libraries,
  qualityProfiles,
  pathOptions,
}: {
  title: TitleSearchResultView;
  libraries: LibraryOption[];
  qualityProfiles: readonly QualityProfileOption[];
  pathOptions: MediaLibraryPathOption[];
}) {
  const [state, formAction] = useActionState(requestSearchTitleAction, initialRequestSearchTitleActionState);
  const [downloadNow, setDownloadNow] = useState(true);

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3 rounded-lg border border-cream/[0.08] bg-cream/[0.03] p-3">
        <input type="hidden" name="mediaType" value={title.mediaType} />
        <input type="hidden" name="tmdbId" value={title.tmdbId} />
        <input type="hidden" name="title" value={title.title} />
        <input type="hidden" name="year" value={title.year ?? ""} />
        <input type="hidden" name="overview" value={title.overview ?? ""} />
        <input type="hidden" name="posterUrl" value={title.posterUrl ?? ""} />
        <input type="hidden" name="backdropUrl" value={title.backdropUrl ?? ""} />
        <input type="hidden" name="runtimeMinutes" value="" />
        <input type="hidden" name="originalLanguage" value={title.originalLanguage ?? ""} />
        <StatusBanner state={state} />
        <TitleRequestControls
          mediaType={title.mediaType}
          tmdbId={title.tmdbId}
          titleLabel={`${title.title}${title.year ? ` (${title.year})` : ""}`}
          libraries={libraries}
          qualityProfiles={qualityProfiles}
          pathOptions={pathOptions}
          onDownloadNowChange={setDownloadNow}
        />
        <AddTitleButton downloadNow={downloadNow} state={state} />
      </form>
      <ReleaseResults
        results={state.results}
        mediaTitleId={state.titleId}
        seasonId={state.seasonId}
        episodeId={state.episodeId}
        targetLibraryPathId={state.targetLibraryPathId}
      />
    </div>
  );
}

function TitleResultCard({
  title,
  libraries,
  qualityProfiles,
  pathOptions,
}: {
  title: TitleSearchResultView;
  libraries: LibraryOption[];
  qualityProfiles: readonly QualityProfileOption[];
  pathOptions: MediaLibraryPathOption[];
}) {
  return (
    <li className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] p-4">
      <div className="grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)]">
        <RecommendationPoster title={title.title} posterUrl={title.posterUrl} />
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <TitleMeta title={title} />
            <p className="break-words font-heading text-lg leading-tight text-foreground">
              {title.title}{title.year ? ` (${title.year})` : ""}
            </p>
            {title.overview ? <p className="line-clamp-3 text-sm leading-6 text-muted">{title.overview}</p> : null}
          </div>
          <details className="group overflow-hidden rounded-lg border border-cream/[0.08] bg-cream/[0.02]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-foreground transition hover:bg-cream/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
              Review &amp; request
              <ChevronDown
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="border-t border-cream/[0.08] p-3">
              <RequestTitleForm
                title={title}
                libraries={libraries}
                qualityProfiles={qualityProfiles}
                pathOptions={pathOptions}
              />
            </div>
          </details>
        </div>
      </div>
    </li>
  );
}

function TitleResults({
  state,
  libraries,
  qualityProfiles,
  pathOptions,
}: RequestOptionsProps & { state: TitleSearchActionState }) {
  if (state.status === "idle") {
    return <EmptyState message="No title search has run yet." />;
  }

  if (state.results.length === 0) {
    return <EmptyState message="No title matches found." />;
  }

  return (
    <ul className="space-y-3">
      {state.results.map((title) => (
        <TitleResultCard
          key={`${title.mediaType}-${title.tmdbId}`}
          title={title}
          libraries={libraries}
          qualityProfiles={qualityProfiles}
          pathOptions={pathOptions}
        />
      ))}
    </ul>
  );
}

export function TitleSearchForm({
  initialQuery,
  initialMediaType,
  initialState,
  libraries,
  qualityProfiles,
  pathOptions,
}: TitleSearchFormProps) {
  const [mediaType, setMediaType] = useState<"movie" | "tv">(initialMediaType);

  return (
    <div className="space-y-6">
      <form action="/search" method="get" className="space-y-3">
        <input type="hidden" name="type" value={mediaType} />
        <div className="flex max-w-3xl flex-col gap-3 rounded-3xl border border-cream/[0.09] bg-cream/[0.03] p-2 pl-5 sm:flex-row sm:items-center">
          <Search aria-hidden="true" className="hidden h-[18px] w-[18px] shrink-0 text-muted sm:block" />
          <input
            name="q"
            defaultValue={initialQuery}
            required
            aria-label="Search for a movie or TV show"
            placeholder="Search for a movie or show…"
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted/70"
          />
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex rounded-lg bg-cream/[0.05] p-[3px]" role="group" aria-label="Media type">
              <button
                type="button"
                aria-pressed={mediaType === "movie"}
                onClick={() => setMediaType("movie")}
                className={`min-h-11 rounded-md px-4 text-[13px] font-semibold transition ${
                  mediaType === "movie" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                Movies
              </button>
              <button
                type="button"
                aria-pressed={mediaType === "tv"}
                onClick={() => setMediaType("tv")}
                className={`min-h-11 rounded-md px-4 text-[13px] font-semibold transition ${
                  mediaType === "tv" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                TV
              </button>
            </div>
            <SearchSubmitButton />
          </div>
        </div>
        <StatusBanner state={initialState} />
        <p className="max-w-3xl text-[13px] leading-[22px] text-muted">
          Search finds the title first. Request & download then adds it to your catalog, searches
          indexers, and queues the best match; Add to library only skips the search and download.
        </p>
      </form>

      <TitleResults state={initialState} libraries={libraries} qualityProfiles={qualityProfiles} pathOptions={pathOptions} />
    </div>
  );
}
