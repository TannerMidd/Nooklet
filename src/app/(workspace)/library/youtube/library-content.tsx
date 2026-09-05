import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    ListVideo,
    Radio,
    Video,
} from "lucide-react";
import Link from "next/link";

import {
    YouTubeDownloadConfigurationForm,
    YouTubeSourceControls,
    type YouTubeDestinationOption,
    type YouTubeQualityOption,
} from "@/app/(workspace)/library/youtube/action-forms";
import { youtubeLibraryHref } from "@/app/(workspace)/library/youtube/search-params";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Panel } from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/status-dot";
import type {
    YouTubeEnumerationDTO,
    YouTubeRequestOptionsDTO,
    YouTubeSearchResultDTO,
    YouTubeSourceDTO,
    YouTubeSourceSummaryDTO,
    YouTubeVideoPage,
    YouTubeVideoDTO,
    YouTubeVideoPageItemDTO,
} from "@/modules/youtube/public";

type DiscoveryState =
    | { kind: "empty" }
    | { kind: "error"; message: string }
    | { kind: "results"; query: string; results: YouTubeSearchResultDTO[] }
    | { kind: "video"; video: YouTubeVideoDTO }
    | {
          kind: "source";
          enumeration: YouTubeEnumerationDTO;
          publicPlaylists: YouTubeSourceSummaryDTO[];
          playlistDiscoveryError: string | null;
      };

function safeOptions(options: YouTubeRequestOptionsDTO) {
    return {
        destinations: options.destinations.map((destination): YouTubeDestinationOption => ({
            id: destination.id,
            label: destination.label,
            isDefault: destination.isDefault,
        })),
        qualityProfiles: options.qualityProfiles as YouTubeQualityOption[],
    };
}

function formatDate(value: Date | null) {
    return value
        ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value)
        : "Not yet";
}

function formatDuration(seconds: number | null) {
    if (!seconds) {
        return null;
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
        : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function Thumbnail({ url, alt }: { url: string | null; alt: string }) {
    if (!url) {
        return (
            <span className="flex aspect-video w-full items-center justify-center bg-cream/[0.04] text-muted">
                <Video aria-hidden="true" className="h-8 w-8" />
            </span>
        );
    }

    return (
        // YouTube thumbnails are extractor-provided and vary across approved CDN hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" className="aspect-video w-full object-cover" />
    );
}

function StorageRequired() {
    return (
        <EmptyState
            message="Add an active YouTube folder before creating a monitor or starting a download."
            action={
                <Link
                    href="/settings/storage?mediaType=youtube"
                    className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                >
                    Open Storage settings
                </Link>
            }
        />
    );
}

function VideoCard({
    video,
    options,
    configurable = true,
}: {
    video: YouTubeVideoDTO;
    options: YouTubeRequestOptionsDTO;
    configurable?: boolean;
}) {
    return (
        <article className="overflow-hidden rounded-2xl border border-cream/[0.08] bg-cream/[0.025]">
            <Thumbnail url={video.thumbnailUrl} alt="" />
            <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                    <Badge variant="accent">Video</Badge>
                    {!video.eligible ? <Badge variant="wine">Not downloadable</Badge> : null}
                    {formatDuration(video.durationSeconds) ? (
                        <Badge>{formatDuration(video.durationSeconds)}</Badge>
                    ) : null}
                </div>
                <div>
                    <h3 className="font-heading text-lg leading-snug text-foreground">
                        {video.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted">{video.channelTitle ?? "YouTube"}</p>
                </div>
                {video.eligible && configurable ? (
                    options.destinations.length > 0 ? (
                        <details className="rounded-xl border border-cream/[0.08] p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-foreground">
                                Choose destination and quality
                            </summary>
                            <div className="mt-4">
                                <YouTubeDownloadConfigurationForm
                                    targetKind="video"
                                    targetUrl={video.webpageUrl}
                                    videos={[]}
                                    options={safeOptions(options)}
                                />
                            </div>
                        </details>
                    ) : (
                        <StorageRequired />
                    )
                ) : null}
            </div>
        </article>
    );
}

function SourceDiscoveryCard({
    enumeration,
    options,
    publicPlaylists,
    playlistDiscoveryError,
}: {
    enumeration: YouTubeEnumerationDTO;
    options: YouTubeRequestOptionsDTO;
    publicPlaylists: YouTubeSourceSummaryDTO[];
    playlistDiscoveryError: string | null;
}) {
    const source = enumeration.source;
    const eligible = enumeration.videos.filter((video) => video.eligible);

    return (
        <div className="space-y-5">
            <Panel
                eyebrow={
                    source.kind === "channel_videos" ? "Regular Videos feed" : "Public playlist"
                }
                title={source.title}
                description={`${eligible.length} downloadable regular ${eligible.length === 1 ? "video" : "videos"} found. Shorts and live content are not queued.`}
            >
                {!enumeration.complete ? (
                    <InlineAlert variant="warning" className="mb-4">
                        YouTube returned a partial listing. Nooklet will not create a baseline from
                        incomplete results; try again later.
                    </InlineAlert>
                ) : null}
                {enumeration.complete && options.destinations.length > 0 ? (
                    <YouTubeDownloadConfigurationForm
                        targetKind="source"
                        targetUrl={source.canonicalUrl}
                        videos={enumeration.videos}
                        options={safeOptions(options)}
                    />
                ) : enumeration.complete ? (
                    <StorageRequired />
                ) : null}
            </Panel>

            {source.kind === "channel_videos" ? (
                <Panel
                    eyebrow="From this channel"
                    title="Public playlists"
                    description="Open a playlist to choose from its current videos and optionally monitor future additions."
                >
                    {playlistDiscoveryError ? (
                        <InlineAlert variant="warning">
                            Public playlists could not be loaded right now. The regular Videos feed
                            above is still available.
                        </InlineAlert>
                    ) : publicPlaylists.length === 0 ? (
                        <EmptyState message="No supported public playlists were found for this channel." />
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {publicPlaylists.map((playlist) => (
                                <Link
                                    key={playlist.youtubeSourceId}
                                    href={youtubeLibraryHref("search", playlist.canonicalUrl)}
                                    className="relative rounded-xl border border-cream/[0.08] bg-cream/[0.025] p-4 transition hover:border-cream/[0.16] hover:bg-cream/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                >
                                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-cool">
                                        <ListVideo aria-hidden="true" className="h-4 w-4" />{" "}
                                        Playlist
                                    </span>
                                    <span className="mt-2 block font-heading text-lg leading-snug text-foreground">
                                        {playlist.title}
                                    </span>
                                    <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-muted">
                                        View videos{" "}
                                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>
            ) : null}
        </div>
    );
}

export function YouTubeSearchContent({
    state,
    options,
}: {
    state: DiscoveryState;
    options: YouTubeRequestOptionsDTO;
}) {
    if (state.kind === "empty") {
        return (
            <EmptyState message="Search by channel or video title, or paste a public YouTube video, playlist, or channel URL. A pasted channel always monitors its regular Videos feed." />
        );
    }

    if (state.kind === "error") {
        return <InlineAlert variant="error">{state.message}</InlineAlert>;
    }

    if (state.kind === "video") {
        return <VideoCard video={state.video} options={options} />;
    }

    if (state.kind === "source") {
        return (
            <SourceDiscoveryCard
                enumeration={state.enumeration}
                options={options}
                publicPlaylists={state.publicPlaylists}
                playlistDiscoveryError={state.playlistDiscoveryError}
            />
        );
    }

    if (state.results.length === 0) {
        return (
            <EmptyState
                message={`No public YouTube results were found for “${state.query}”. Try a more specific search, or paste a supported URL.`}
            />
        );
    }

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            {state.results.map((result, index) =>
                result.kind === "video" ? (
                    <VideoCard
                        key={`video-${result.video.youtubeVideoId}-${index}`}
                        video={result.video}
                        options={options}
                    />
                ) : (
                    <article
                        key={`source-${result.source.kind}-${result.source.youtubeSourceId}-${index}`}
                        className="flex min-h-52 flex-col justify-between rounded-2xl border border-cream/[0.08] bg-cream/[0.025] p-5"
                    >
                        <div className="space-y-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/[0.12] text-accent">
                                {result.source.kind === "playlist" ? (
                                    <ListVideo aria-hidden="true" className="h-5 w-5" />
                                ) : (
                                    <Radio aria-hidden="true" className="h-5 w-5" />
                                )}
                            </span>
                            <div>
                                <Badge variant="accent-cool">
                                    {result.source.kind === "playlist"
                                        ? "Public playlist"
                                        : "Channel Videos"}
                                </Badge>
                                <h3 className="mt-2 font-heading text-xl text-foreground">
                                    {result.source.title}
                                </h3>
                                {result.source.channelTitle ? (
                                    <p className="mt-1 text-sm text-muted">
                                        {result.source.channelTitle}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        <Link
                            href={youtubeLibraryHref("search", result.source.canonicalUrl)}
                            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-cream/[0.14] px-4 text-sm font-semibold text-foreground hover:bg-cream/[0.06]"
                        >
                            {result.source.kind === "channel_videos"
                                ? "View regular videos and playlists"
                                : "View videos and configure"}{" "}
                            <ExternalLink aria-hidden="true" className="h-4 w-4" />
                        </Link>
                    </article>
                ),
            )}
        </div>
    );
}

const sourceStatusDetails = {
    initializing: { label: "Initializing", tone: "active" as const },
    active: { label: "Active", tone: "ok" as const },
    paused: { label: "Paused", tone: "neutral" as const },
    error: { label: "Needs attention", tone: "error" as const },
};

export function YouTubeSourcesContent({
    sources,
    options,
}: {
    sources: YouTubeSourceDTO[];
    options: YouTubeRequestOptionsDTO;
}) {
    if (sources.length === 0) {
        return (
            <EmptyState
                message="No YouTube sources are monitored yet. Search for a channel or playlist to establish a baseline and watch for new videos."
                action={
                    <Link
                        href={youtubeLibraryHref("search")}
                        className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                    >
                        Search YouTube
                    </Link>
                }
            />
        );
    }

    return (
        <div className="grid gap-4 xl:grid-cols-2">
            {sources.map((source) => {
                const status = sourceStatusDetails[source.status];

                return (
                    <Panel
                        key={source.id}
                        eyebrow={
                            source.kind === "playlist"
                                ? "Playlist monitor"
                                : "Channel Videos monitor"
                        }
                        title={source.title}
                        actions={<StatusDot tone={status.tone} label={status.label} />}
                    >
                        <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-xs uppercase tracking-wide text-muted">
                                    Destination
                                </dt>
                                <dd className="mt-1 text-foreground">{source.destinationLabel}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-wide text-muted">
                                    Quality
                                </dt>
                                <dd className="mt-1 text-foreground">{source.qualityProfile}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-wide text-muted">
                                    Videos
                                </dt>
                                <dd className="mt-1 text-foreground">
                                    {source.presentVideoCount} present · {source.videoCount} seen
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-wide text-muted">
                                    Last sync
                                </dt>
                                <dd className="mt-1 text-foreground">
                                    {formatDate(source.lastSyncedAt)}
                                </dd>
                            </div>
                        </dl>
                        {source.lastError ? (
                            <InlineAlert variant="error" className="mb-4">
                                The last source sync did not complete. Retry initialization or sync
                                again; no videos were marked removed.
                            </InlineAlert>
                        ) : null}
                        <YouTubeSourceControls
                            source={{
                                id: source.id,
                                status: source.status,
                                libraryPathId: source.libraryPathId,
                                qualityProfile: source.qualityProfile,
                                title: source.title,
                                baselineCompleted: source.baselineCompletedAt !== null,
                            }}
                            options={safeOptions(options)}
                        />
                    </Panel>
                );
            })}
        </div>
    );
}

const downloadLabel = {
    queued: "Queued",
    downloading: "Downloading",
    retry_wait: "Retry scheduled",
    importing: "Importing",
    completed: "Imported",
    failed: "Failed",
    cancelled: "Cancelled",
};

function VideosPagination({
    sourceId,
    pagination,
}: {
    sourceId?: string;
    pagination: YouTubeVideoPage["pagination"];
}) {
    if (pagination.pageCount <= 1) {
        return null;
    }

    return (
        <nav
            aria-label="YouTube video pages"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-cream/[0.08] pt-4"
        >
            <p className="text-sm text-muted">
                Showing {pagination.firstItem}–{pagination.lastItem} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
                {pagination.hasPreviousPage ? (
                    <Link
                        href={youtubeLibraryHref("videos", undefined, {
                            sourceId,
                            page: pagination.page - 1,
                        })}
                        prefetch={false}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-cream/[0.14] px-3 text-sm font-semibold text-foreground hover:bg-cream/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Previous
                    </Link>
                ) : null}
                <span className="px-2 text-sm text-muted">
                    Page {pagination.page} of {pagination.pageCount}
                </span>
                {pagination.hasNextPage ? (
                    <Link
                        href={youtubeLibraryHref("videos", undefined, {
                            sourceId,
                            page: pagination.page + 1,
                        })}
                        prefetch={false}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-cream/[0.14] px-3 text-sm font-semibold text-foreground hover:bg-cream/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        Next <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                ) : null}
            </div>
        </nav>
    );
}

export function YouTubeVideosContent({
    videos,
    sourceId,
    pagination,
}: {
    videos: YouTubeVideoPageItemDTO[];
    sourceId?: string;
    pagination?: YouTubeVideoPage["pagination"];
}) {
    if (videos.length === 0) {
        return (
            <EmptyState
                message="No YouTube videos have been discovered or downloaded yet."
                action={
                    <Link
                        href={youtubeLibraryHref("search")}
                        className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                    >
                        Find a video
                    </Link>
                }
            />
        );
    }

    return (
        <>
            <div className="space-y-3">
                {videos.map((video) => (
                    <article
                        key={video.id}
                        className="grid gap-4 rounded-2xl border border-cream/[0.08] bg-cream/[0.025] p-4 sm:grid-cols-[160px_minmax(0,1fr)]"
                    >
                        <div className="overflow-hidden rounded-xl">
                            <Thumbnail url={video.thumbnailUrl} alt="" />
                        </div>
                        <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                {video.downloadStatus ? (
                                    <Badge
                                        variant={
                                            video.downloadStatus === "completed"
                                                ? "accent-cool"
                                                : video.downloadStatus === "failed"
                                                  ? "wine"
                                                  : "accent"
                                        }
                                    >
                                        {downloadLabel[video.downloadStatus]}
                                    </Badge>
                                ) : (
                                    <Badge>Discovered</Badge>
                                )}
                                {video.remotePresent === false ? (
                                    <Badge variant="wine">Removed remotely</Badge>
                                ) : null}
                                {video.sourceId ? (
                                    <Badge>Monitored source</Badge>
                                ) : (
                                    <Badge>Individual video</Badge>
                                )}
                            </div>
                            <h3 className="font-heading text-lg text-foreground">{video.title}</h3>
                            <p className="text-sm text-muted">{video.channelTitle ?? "YouTube"}</p>
                            {video.publishedAt ? (
                                <p className="flex items-center gap-2 text-xs text-muted">
                                    <CalendarDays aria-hidden="true" className="h-4 w-4" />
                                    {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                                        video.publishedAt,
                                    )}
                                </p>
                            ) : null}
                            {video.finalPath ? (
                                <p className="text-xs text-accent-cool">
                                    Imported to the selected YouTube library.
                                </p>
                            ) : null}
                        </div>
                    </article>
                ))}
            </div>
            {pagination ? <VideosPagination sourceId={sourceId} pagination={pagination} /> : null}
        </>
    );
}

export type { DiscoveryState as YouTubeDiscoveryState };
