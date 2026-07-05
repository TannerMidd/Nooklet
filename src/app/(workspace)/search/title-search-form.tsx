"use client";

import { CalendarDays, DatabaseZap, Download, HardDrive, Search } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  requestSearchTitleAction,
  searchTitlesAction,
} from "@/app/(workspace)/search/actions";
import {
  initialRequestSearchTitleActionState,
  initialTitleSearchActionState,
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

type TitleSearchFormProps = {
  libraries: LibraryOption[];
  qualityProfiles: readonly QualityProfileOption[];
  pathOptions: MediaLibraryPathOption[];
};

function StatusBanner({ state }: { state: TitleSearchActionState | RequestSearchTitleActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <InlineAlert variant={state.status === "success" ? "info" : "error"} className="py-2 text-foreground">
      {state.message}
    </InlineAlert>
  );
}

function SearchSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      <Search aria-hidden="true" size={17} />
      {pending ? "Searching..." : "Search titles"}
    </Button>
  );
}

function AddTitleButton() {
  const { pending } = useFormStatus();

  return (
    <div className="space-y-2">
      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending ? <Spinner /> : <Download aria-hidden="true" size={17} />}
        {pending ? "Adding..." : "Add to Nooklet"}
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
      <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
        {title.mediaType === "tv" ? "TV" : "Movie"}
      </span>
      {title.year ? (
        <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">{title.year}</span>
      ) : null}
      {title.voteAverage !== null ? (
        <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
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
    <div className="space-y-3 rounded-lg border border-line/70 bg-background/15 p-3">
      <p className="text-sm font-medium text-foreground">Release candidates</p>
      <ul className="space-y-2">
        {results.map((result) => (
          <li key={result.id} className="rounded-lg border border-line/60 bg-panel-strong/60 p-3">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="break-words text-sm font-medium text-foreground">{result.title}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  {result.qualityLabel ? (
                    <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">{result.qualityLabel}</span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                    <HardDrive aria-hidden="true" size={13} />
                    {formatBytes(result.sizeBytes)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                    <CalendarDays aria-hidden="true" size={13} />
                    {formatPublishedAt(result.publishedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                    <DatabaseZap aria-hidden="true" size={13} />
                    S {result.seeders ?? "?"} / L {result.leechers ?? "?"}
                  </span>
                </div>
              </div>
              <QueueResultButton
                resultId={result.id}
                mediaTitleId={mediaTitleId}
                seasonId={seasonId}
                episodeId={episodeId}
                targetLibraryPathId={targetLibraryPathId}
              />
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

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3 rounded-lg border border-line/70 bg-background/15 p-3">
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
        />
        <AddTitleButton />
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
    <li className="rounded-lg border border-line/70 bg-panel-strong/60 p-4">
      <div className="grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)]">
        <RecommendationPoster title={title.title} posterUrl={title.posterUrl} />
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <TitleMeta title={title} />
            <p className="break-words font-heading text-xl leading-tight text-foreground">
              {title.title}{title.year ? ` (${title.year})` : ""}
            </p>
            {title.overview ? <p className="line-clamp-3 text-sm leading-6 text-muted">{title.overview}</p> : null}
          </div>
          <RequestTitleForm
            title={title}
            libraries={libraries}
            qualityProfiles={qualityProfiles}
            pathOptions={pathOptions}
          />
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
}: TitleSearchFormProps & { state: TitleSearchActionState }) {
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

export function TitleSearchForm({ libraries, qualityProfiles, pathOptions }: TitleSearchFormProps) {
  const [state, formAction] = useActionState(searchTitlesAction, initialTitleSearchActionState);

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        <StatusBanner state={state} />
        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Media type</span>
            <select
              name="mediaType"
              defaultValue="movie"
              className="min-h-11 w-full rounded-lg border border-line/75 bg-background/25 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
            >
              <option value="movie">Movies</option>
              <option value="tv">TV shows</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Title</span>
            <Input name="query" placeholder="Arrival" required />
          </label>
          <SearchSubmitButton />
        </div>
      </form>

      <TitleResults state={state} libraries={libraries} qualityProfiles={qualityProfiles} pathOptions={pathOptions} />
    </div>
  );
}
