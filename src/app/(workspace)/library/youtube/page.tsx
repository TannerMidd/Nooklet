import type { Metadata } from "next";
import { Search } from "lucide-react";

import {
    YouTubeSearchContent,
    YouTubeSourcesContent,
    YouTubeVideosContent,
    type YouTubeDiscoveryState,
} from "@/app/(workspace)/library/youtube/library-content";
import {
    parseYouTubeLibrarySearchParams,
    youtubeLibraryHref,
    type YouTubeLibrarySearchParamsInput,
} from "@/app/(workspace)/library/youtube/search-params";
import { auth } from "@/auth";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedLinks } from "@/components/ui/segmented-control";
import {
    discoverPublicYouTubeChannel,
    enumeratePublicYouTubeSource,
    getYouTubeRequestOptions,
    listYouTubeSources,
    listYouTubeVideos,
    probePublicYouTubeVideo,
    resolvePublicYouTubeUrl,
    searchPublicYouTube,
    YouTubeDomainError,
    YtDlpAdapterError,
} from "@/modules/youtube/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "YouTube library" };

type YouTubeLibraryPageProps = {
    searchParams?: Promise<YouTubeLibrarySearchParamsInput>;
};

function looksLikeUrl(value: string) {
    return /^(?:https?:\/\/|www\.|youtube\.com|youtu\.be)/i.test(value.trim());
}

function discoveryError(error: unknown) {
    if (error instanceof YouTubeDomainError && error.code === "rate_limited") {
        return error.message;
    }

    if (error instanceof YtDlpAdapterError) {
        if (error.kind === "authentication_required") {
            return error.message;
        }

        if (error.kind === "invalid_url") {
            return "That URL is not a supported public YouTube video, playlist, or channel URL. You can still search using plain text.";
        }

        if (error.kind === "private" || error.kind === "removed" || error.kind === "unavailable") {
            return "That YouTube item is not publicly available.";
        }

        if (error.kind === "rate_limited") {
            return "YouTube temporarily limited this server. Try again later.";
        }

        if (error.kind === "network") {
            return "Nooklet could not connect to YouTube. Check the server connection, then try again.";
        }

        if (error.kind === "timeout") {
            return "YouTube did not respond before the request timed out. Large channels can take longer; try again later.";
        }

        if (
            error.kind === "tool_failure" ||
            error.kind === "malformed_output" ||
            error.kind === "output_too_large"
        ) {
            return "YouTube discovery failed on the server. An administrator should check Health and recent logs.";
        }

        if (error.kind === "tool_missing") {
            return "YouTube discovery is not ready on this server. An administrator can review tool diagnostics in Health.";
        }
    }

    return "Nooklet could not read that YouTube request. Try a supported public URL or a more specific search.";
}

export async function discoverYouTube(
    query: string,
    userId: string,
): Promise<YouTubeDiscoveryState> {
    if (!query) {
        return { kind: "empty" };
    }

    if (looksLikeUrl(query)) {
        try {
            const normalized = /^(?:youtube\.com|youtu\.be|www\.)/i.test(query)
                ? `https://${query}`
                : query;
            const classified = resolvePublicYouTubeUrl(normalized);

            if (classified.kind === "video") {
                return {
                    kind: "video",
                    video: await probePublicYouTubeVideo(userId, classified.canonicalUrl),
                };
            }

            if (classified.kind === "channel_videos") {
                const discovery = await discoverPublicYouTubeChannel(
                    userId,
                    classified.canonicalUrl,
                    { playlistLimit: 50 },
                );

                return {
                    kind: "source",
                    enumeration: discovery.enumeration,
                    publicPlaylists: discovery.publicPlaylists,
                    playlistDiscoveryError: discovery.playlistDiscoveryError
                        ? discoveryError(discovery.playlistDiscoveryError)
                        : null,
                };
            }

            return {
                kind: "source",
                enumeration: await enumeratePublicYouTubeSource(userId, classified.canonicalUrl),
                publicPlaylists: [],
                playlistDiscoveryError: null,
            };
        } catch (error) {
            return { kind: "error", message: discoveryError(error) };
        }
    }

    try {
        return {
            kind: "results",
            query,
            results: await searchPublicYouTube(query, { limit: 16, userId }),
        };
    } catch (error) {
        return { kind: "error", message: discoveryError(error) };
    }
}

export default async function YouTubeLibraryPage({ searchParams }: YouTubeLibraryPageProps) {
    const session = await auth();

    if (!session?.user?.id) {
        return null;
    }

    const params = parseYouTubeLibrarySearchParams(await searchParams);
    const [options, sources, baseVideos, discovery] = await Promise.all([
        getYouTubeRequestOptions(session.user.id),
        listYouTubeSources(session.user.id),
        listYouTubeVideos(session.user.id),
        params.view === "search"
            ? discoverYouTube(params.q, session.user.id)
            : Promise.resolve({ kind: "empty" } as const),
    ]);
    const membershipLists =
        params.view === "videos"
            ? await Promise.all(
                  sources.map((source) =>
                      listYouTubeVideos(session.user.id, { sourceId: source.id }),
                  ),
              )
            : [];
    const membershipByVideoId = new Map(
        membershipLists
            .flat()
            .sort((left, right) => Number(left.remotePresent) - Number(right.remotePresent))
            .map((video) => [video.id, video]),
    );
    const videos = baseVideos.map((video) => {
        const membership = membershipByVideoId.get(video.id);

        return membership
            ? {
                  ...video,
                  sourceId: membership.sourceId,
                  remotePresent: membership.remotePresent,
              }
            : video;
    });
    const tabs = [
        { value: "search", label: "Search" },
        { value: "sources", label: `Monitored sources ${sources.length}` },
        { value: "videos", label: `Videos ${videos.length}` },
    ] as const;

    return (
        <div className="nk-enter space-y-7">
            <PageHeader
                eyebrow="Public videos · no account connection required"
                title="YouTube"
                description="Download individual public videos or monitor a channel’s regular Videos feed and public playlists. New eligible videos are queued after the source baseline is complete."
            />

            <SegmentedLinks
                label="YouTube library views"
                className="max-w-full flex-wrap"
                options={tabs.map((tab) => ({
                    key: tab.value,
                    href: youtubeLibraryHref(tab.value),
                    active: params.view === tab.value,
                    label: tab.label,
                }))}
            />

            {params.view === "search" ? (
                <section className="space-y-5" aria-labelledby="youtube-search-heading">
                    <div>
                        <h2
                            id="youtube-search-heading"
                            className="font-heading text-2xl text-foreground"
                        >
                            Find a channel, playlist, or video
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-muted">
                            Text search is best-effort. Pasting a public YouTube URL is the reliable
                            fallback.
                        </p>
                    </div>
                    <form
                        action="/library/youtube"
                        className="flex max-w-3xl flex-col gap-2 sm:flex-row"
                    >
                        <input type="hidden" name="view" value="search" />
                        <label htmlFor="youtube-query" className="sr-only">
                            Search YouTube or paste a public URL
                        </label>
                        <Input
                            id="youtube-query"
                            name="q"
                            defaultValue={params.q}
                            maxLength={500}
                            placeholder="Channel or video title, or a YouTube URL"
                            className="min-w-0 flex-1"
                        />
                        <button
                            type="submit"
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            <Search aria-hidden="true" className="h-4 w-4" /> Search
                        </button>
                    </form>
                    <YouTubeSearchContent state={discovery} options={options} />
                </section>
            ) : params.view === "sources" ? (
                <section className="space-y-4" aria-labelledby="youtube-sources-heading">
                    <div>
                        <h2
                            id="youtube-sources-heading"
                            className="font-heading text-2xl text-foreground"
                        >
                            Monitored sources
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-muted">
                            Pausing stops scheduled discovery. Removing a monitor never deletes
                            downloaded files.
                        </p>
                    </div>
                    <YouTubeSourcesContent sources={sources} options={options} />
                </section>
            ) : (
                <section className="space-y-4" aria-labelledby="youtube-videos-heading">
                    <div>
                        <h2
                            id="youtube-videos-heading"
                            className="font-heading text-2xl text-foreground"
                        >
                            Videos
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-muted">
                            Nooklet-managed records remain authoritative even when a video leaves a
                            remote playlist.
                        </p>
                    </div>
                    <YouTubeVideosContent videos={videos} />
                </section>
            )}
        </div>
    );
}
