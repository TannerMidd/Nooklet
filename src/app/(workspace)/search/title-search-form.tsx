"use client";

import { CalendarDays, DatabaseZap, Download, HardDrive, ListChecks, Search } from "lucide-react";
import { useActionState, useState } from "react";
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
  TvRequestDialog,
  describeTvSelection,
  type TvSelectionState,
} from "@/components/media-library/tv-request-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { type MediaQualityProfile, type RecommendationMediaType } from "@/lib/database/schema";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

type LibraryOption = {
  id: string;
  name: string;
  mediaType: RecommendationMediaType;
};

type QualityProfileOption = {
  value: MediaQualityProfile;
  label: string;
};

type TitleSearchFormProps = {
  libraries: LibraryOption[];
  qualityProfiles: readonly QualityProfileOption[];
  pathOptions: MediaLibraryPathOption[];
};

function pathOptionLabel(option: MediaLibraryPathOption) {
  return `${option.label} - ${option.path}`;
}

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
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      <Download aria-hidden="true" size={17} />
      {pending ? "Adding..." : "Add & download"}
    </Button>
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
  targetLibraryPathId,
}: {
  results: SearchResultView[];
  mediaTitleId: string | null;
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
  const matchingLibraries = libraries.filter((library) => library.mediaType === title.mediaType);
  const matchingPathOptions = pathOptions.filter((option) => option.mediaType === title.mediaType);
  const initialLibraryId = matchingLibraries[0]?.id ?? "";
  const initialTargetPathId = initialLibraryId
    ? matchingPathOptions.find((option) => option.libraryId === initialLibraryId)?.id ?? ""
    : matchingPathOptions[0]?.id ?? "";
  const [selectedLibraryId, setSelectedLibraryId] = useState(initialLibraryId);
  const [selectedTargetPathId, setSelectedTargetPathId] = useState(initialTargetPathId);
  const [selection, setSelection] = useState<TvSelectionState>({ mode: "all" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const visiblePathOptions = matchingPathOptions.filter((option) => (
    selectedLibraryId ? option.libraryId === selectedLibraryId : true
  ));
  const isTv = title.mediaType === "tv";

  function handleLibraryChange(value: string) {
    setSelectedLibraryId(value);
    const nextPathOptions = matchingPathOptions.filter((option) => (value ? option.libraryId === value : true));
    setSelectedTargetPathId(nextPathOptions[0]?.id ?? "");
  }

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
        <input type="hidden" name="downloadNow" value="on" />
        {isTv ? (
          <>
            <input type="hidden" name="selectionMode" value={selection.mode} />
            {selection.mode === "seasons"
              ? selection.seasons.map((seasonNumber) => (
                  <input
                    key={`season-${seasonNumber}`}
                    type="hidden"
                    name="selectedSeasons"
                    value={seasonNumber}
                  />
                ))
              : null}
            {selection.mode === "episodes" ? (
              <>
                <input type="hidden" name="selectedSeason" value={selection.season} />
                {selection.episodes.map((episodeNumber) => (
                  <input
                    key={`episode-${episodeNumber}`}
                    type="hidden"
                    name="selectedEpisodes"
                    value={episodeNumber}
                  />
                ))}
              </>
            ) : null}
          </>
        ) : null}
        <StatusBanner state={state} />
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Library</span>
            <select
              name="libraryId"
              value={selectedLibraryId}
              onChange={(event) => handleLibraryChange(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-line/75 bg-background/25 px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
            >
              <option value="">Unassigned</option>
              {matchingLibraries.map((library) => (
                <option key={library.id} value={library.id}>{library.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Destination folder</span>
            <select
              name="targetLibraryPathId"
              value={selectedTargetPathId}
              onChange={(event) => setSelectedTargetPathId(event.target.value)}
              disabled={visiblePathOptions.length === 0}
              className="min-h-11 w-full rounded-lg border border-line/75 bg-background/25 px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25 disabled:opacity-60"
            >
              {visiblePathOptions.length === 0 ? (
                <option value="">No active folders</option>
              ) : (
                visiblePathOptions.map((option) => (
                  <option key={option.id} value={option.id}>{pathOptionLabel(option)}</option>
                ))
              )}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Quality profile</span>
            <select
              name="qualityProfile"
              defaultValue="hd-1080p"
              className="min-h-11 w-full rounded-lg border border-line/75 bg-background/25 px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
            >
              {qualityProfiles.map((profile) => (
                <option key={profile.value} value={profile.value}>{profile.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-muted">
          <label className="inline-flex items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-3 py-2">
            <input type="checkbox" name="monitored" defaultChecked className="h-4 w-4 accent-accent" />
            Monitor
          </label>
          {isTv ? (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-3 py-2 text-foreground"
            >
              <ListChecks aria-hidden="true" size={15} />
              {describeTvSelection(selection)}
            </button>
          ) : null}
        </div>
        <AddTitleButton />
      </form>
      {isTv && dialogOpen ? (
        <TvRequestDialog
          tmdbId={title.tmdbId}
          titleLabel={`${title.title}${title.year ? ` (${title.year})` : ""}`}
          initialSelection={selection}
          onConfirm={(next) => {
            setSelection(next);
            setDialogOpen(false);
          }}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
      <ReleaseResults
        results={state.results}
        mediaTitleId={state.titleId}
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
