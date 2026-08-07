"use client";

import {
    CalendarDays,
    Check,
    DatabaseZap,
    Download,
    HardDrive,
    Search,
    Star,
    X,
} from "lucide-react";
import Image from "next/image";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { requestSearchTitleAction } from "@/app/(workspace)/search/actions";
import {
    initialRequestSearchTitleActionState,
    type RequestSearchTitleActionState,
    type SearchResultView,
    type TitleSearchActionState,
    type TitleSearchResultView,
} from "@/app/(workspace)/search/action-state";
import { QueueResultButton } from "@/app/(workspace)/search/queue-result-button";
import {
    TitleRequestControls,
    type LibraryOption,
    type QualityProfileOption,
} from "@/components/media-library/title-request-controls";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { segmentedItemClass, segmentedTrack } from "@/components/ui/segmented-control";
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

function StatusBanner({
    state,
}: {
    state: TitleSearchActionState | RequestSearchTitleActionState;
}) {
    if (state.status === "idle" || !state.message) {
        return null;
    }

    return (
        <InlineAlert
            variant={
                state.status === "success"
                    ? "success"
                    : state.status === "warning"
                      ? "warning"
                      : "error"
            }
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
    const label =
        state.outcome === "queued"
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
                    <li
                        key={result.id}
                        className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] p-3"
                    >
                        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                                <p className="break-words text-sm font-medium text-foreground">
                                    {result.title}
                                </p>
                                <div className="flex flex-wrap gap-2 text-xs text-muted">
                                    <span className="rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
                                        {result.protocol === "newznab"
                                            ? "Usenet"
                                            : result.protocol === "torznab"
                                              ? "Torrent"
                                              : "Unknown protocol"}
                                    </span>
                                    {result.qualityLabel ? (
                                        <span className="rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
                                            {result.qualityLabel}
                                        </span>
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
                                        <DatabaseZap aria-hidden="true" size={13} />S{" "}
                                        {result.seeders ?? "?"} / L {result.leechers ?? "?"}
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
    const [state, formAction] = useActionState(
        requestSearchTitleAction,
        initialRequestSearchTitleActionState,
    );
    const [downloadNow, setDownloadNow] = useState(true);

    return (
        <div className="space-y-3">
            <form
                action={formAction}
                className="space-y-3 rounded-lg border border-cream/[0.08] bg-cream/[0.03] p-3"
            >
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

function resultKey(title: TitleSearchResultView) {
    return `${title.mediaType}-${title.tmdbId}`;
}

/** Poster tile from the redesign: artwork, rating badge, and a request cue. */
function TitleResultCard({
    title,
    selected,
    onSelect,
}: {
    title: TitleSearchResultView;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <li>
            <button
                type="button"
                onClick={onSelect}
                aria-pressed={selected}
                className="flex w-full flex-col gap-2.5 text-left transition duration-200 hover:-translate-y-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
                <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-lg border border-cream/[0.10] bg-panel shadow-[0_18px_34px_-24px_rgba(0,0,0,0.8)]">
                    {title.posterUrl ? (
                        <Image
                            src={title.posterUrl}
                            alt=""
                            fill
                            unoptimized
                            sizes="(min-width: 640px) 11rem, 45vw"
                            className="object-cover"
                        />
                    ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs text-muted">
                            No artwork
                        </span>
                    )}
                    {title.voteAverage !== null ? (
                        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-background/[0.75] px-2 py-[3px] text-[11px] font-semibold text-foreground">
                            <Star aria-hidden="true" className="h-2.5 w-2.5 fill-current" />
                            {title.voteAverage.toFixed(1)}
                        </span>
                    ) : null}
                </span>
                <span className="block min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">
                        {title.title}
                    </span>
                    <span className="mt-[3px] block text-xs text-muted">
                        {[title.year, title.mediaType === "tv" ? "TV" : "Movie"]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                    <span className="mt-[7px] block text-[12.5px] font-semibold text-accent">
                        {selected ? "Selected ↓" : "Request →"}
                    </span>
                </span>
            </button>
        </li>
    );
}

function TitleResults({
    state,
    selectedKey,
    onSelect,
}: {
    state: TitleSearchActionState;
    selectedKey: string | null;
    onSelect: (title: TitleSearchResultView) => void;
}) {
    if (state.status === "idle") {
        return <EmptyState message="No title search has run yet." />;
    }

    if (state.results.length === 0) {
        return <EmptyState message="No title matches found." />;
    }

    return (
        <section className="flex flex-col gap-4.5">
            <div className="flex items-baseline justify-between gap-4 border-b border-cream/[0.07] pb-3">
                <h2 className="font-heading text-2xl text-foreground">Results</h2>
                <p className="text-[12.5px] text-muted">
                    {state.results.length}{" "}
                    {state.results[0]?.mediaType === "tv" ? "series" : "movies"} · best match first
                </p>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-x-4 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(148px,1fr))]">
                {state.results.map((title) => (
                    <TitleResultCard
                        key={resultKey(title)}
                        title={title}
                        selected={selectedKey === resultKey(title)}
                        onSelect={() => onSelect(title)}
                    />
                ))}
            </ul>
        </section>
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
    const [selectedTitle, setSelectedTitle] = useState<TitleSearchResultView | null>(null);

    return (
        <div className="space-y-6">
            <form action="/search" method="get" className="space-y-3">
                <input type="hidden" name="type" value={mediaType} />
                <div className="flex max-w-3xl flex-col gap-3 rounded-3xl border border-cream/[0.09] bg-cream/[0.03] p-2 pl-5 sm:flex-row sm:items-center">
                    <Search
                        aria-hidden="true"
                        className="hidden h-[18px] w-[18px] shrink-0 text-muted sm:block"
                    />
                    <input
                        name="q"
                        defaultValue={initialQuery}
                        required
                        aria-label="Search for a movie or TV show"
                        placeholder="Search for a movie or show…"
                        className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted/70"
                    />
                    <div className="flex shrink-0 items-center gap-2">
                        <div className={segmentedTrack} role="group" aria-label="Media type">
                            <button
                                type="button"
                                aria-pressed={mediaType === "movie"}
                                onClick={() => setMediaType("movie")}
                                className={segmentedItemClass(mediaType === "movie")}
                            >
                                Movies
                            </button>
                            <button
                                type="button"
                                aria-pressed={mediaType === "tv"}
                                onClick={() => setMediaType("tv")}
                                className={segmentedItemClass(mediaType === "tv")}
                            >
                                TV
                            </button>
                        </div>
                        <SearchSubmitButton />
                    </div>
                </div>
                <StatusBanner state={initialState} />
                <p className="max-w-3xl text-[13px] leading-[22px] text-muted">
                    Search finds the title first. Request & download then adds it to your catalog,
                    searches indexers, and queues the best match; Add to library only skips the
                    search and download.
                </p>
            </form>

            <TitleResults
                state={initialState}
                selectedKey={selectedTitle ? resultKey(selectedTitle) : null}
                onSelect={(title) =>
                    setSelectedTitle((current) =>
                        current && resultKey(current) === resultKey(title) ? null : title,
                    )
                }
            />

            {/* The redesign floats the request controls in a tray over the results
          instead of expanding each card. Below `lg` it sits inline, where a
          fixed bar would cover most of the viewport. */}
            {selectedTitle ? (
                <>
                    <div aria-hidden="true" className="hidden lg:block lg:h-32" />
                    <section
                        aria-label={`Request ${selectedTitle.title}`}
                        className="nk-pop rounded-2xl border border-cream/[0.14] bg-[rgb(23,21,19)] p-4 shadow-[0_22px_44px_-18px_rgba(0,0,0,0.95)] lg:fixed lg:bottom-6 lg:left-56 lg:right-0 lg:z-[60] lg:mx-auto lg:max-h-[60vh] lg:w-[min(1040px,calc(100vw-6rem))] lg:overflow-y-auto"
                    >
                        <div className="mb-3 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-accent">
                                    Request
                                </p>
                                <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                                    {selectedTitle.title}
                                    {selectedTitle.year ? ` (${selectedTitle.year})` : ""}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedTitle(null)}
                                aria-label="Cancel request"
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-cream/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                                <X aria-hidden="true" size={16} />
                            </button>
                        </div>
                        <RequestTitleForm
                            key={resultKey(selectedTitle)}
                            title={selectedTitle}
                            libraries={libraries}
                            qualityProfiles={qualityProfiles}
                            pathOptions={pathOptions}
                        />
                    </section>
                </>
            ) : null}
        </div>
    );
}
