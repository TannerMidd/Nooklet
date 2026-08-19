import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/(workspace)/library/youtube/actions", () => ({
    cancelYouTubeDownloadAction: vi.fn(),
    configureYouTubeRequestAction: vi.fn(),
    removeYouTubeSourceAction: vi.fn(),
    retryAllYouTubeDownloadsAction: vi.fn(),
    retryYouTubeDownloadAction: vi.fn(),
    retryYouTubeSourceInitializationAction: vi.fn(),
    runYouTubeSourceSyncAction: vi.fn(),
    setYouTubeSourcePausedAction: vi.fn(),
    updateYouTubeSourceAction: vi.fn(),
}));
vi.mock("@/modules/youtube/public", () => {
    class YouTubeDomainError extends Error {
        constructor(
            message: string,
            public readonly code: string,
        ) {
            super(message);
        }
    }
    class YtDlpAdapterError extends Error {
        constructor(
            message: string,
            public readonly kind: string,
        ) {
            super(message);
        }
    }

    return {
        YouTubeDomainError,
        YtDlpAdapterError,
        discoverPublicYouTubeChannel: vi.fn(),
        enumeratePublicYouTubeSource: vi.fn(),
        getYouTubeRequestOptions: vi.fn(),
        listYouTubeSources: vi.fn(),
        listYouTubeVideos: vi.fn(),
        probePublicYouTubeVideo: vi.fn(),
        resolvePublicYouTubeUrl: vi.fn(),
        searchPublicYouTube: vi.fn(),
    };
});

import {
    discoverPublicYouTubeChannel,
    enumeratePublicYouTubeSource,
    resolvePublicYouTubeUrl,
    searchPublicYouTube,
    YouTubeDomainError,
} from "@/modules/youtube/public";

import { discoverYouTube } from "./page";

const resolveUrlMock = vi.mocked(resolvePublicYouTubeUrl);
const discoverChannelMock = vi.mocked(discoverPublicYouTubeChannel);
const enumerateMock = vi.mocked(enumeratePublicYouTubeSource);
const searchMock = vi.mocked(searchPublicYouTube);

const channelEnumeration: import("@/modules/youtube/public").YouTubeEnumerationDTO = {
    complete: true,
    source: {
        kind: "channel_videos",
        youtubeSourceId: "@nooklet",
        canonicalUrl: "https://www.youtube.com/@nooklet/videos",
        title: "Nooklet",
        channelId: "UC1234567890123456789012",
        channelTitle: "Nooklet",
        thumbnailUrl: null,
    },
    videos: [],
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("YouTube page discovery", () => {
    it("loads a channel's regular Videos feed and public playlists together", async () => {
        resolveUrlMock.mockReturnValue({
            kind: "channel_videos",
            sourceId: "@nooklet",
            canonicalUrl: "https://www.youtube.com/@nooklet/videos",
        });
        discoverChannelMock.mockResolvedValue({
            enumeration: channelEnumeration,
            publicPlaylists: [
                {
                    kind: "playlist",
                    youtubeSourceId: "PL1234567890abc",
                    canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890abc",
                    title: "Release notes",
                    channelId: "UC1234567890123456789012",
                    channelTitle: "Nooklet",
                    thumbnailUrl: null,
                },
            ],
            playlistDiscoveryError: null,
        });

        const result = await discoverYouTube("https://youtube.com/@nooklet", "user-1");

        expect(discoverChannelMock).toHaveBeenCalledWith(
            "user-1",
            "https://www.youtube.com/@nooklet/videos",
            { playlistLimit: 50 },
        );
        expect(result).toMatchObject({
            kind: "source",
            enumeration: channelEnumeration,
            publicPlaylists: [
                {
                    youtubeSourceId: "PL1234567890abc",
                    canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890abc",
                },
            ],
            playlistDiscoveryError: null,
        });
    });

    it("keeps the regular feed usable when public-playlist discovery fails", async () => {
        resolveUrlMock.mockReturnValue({
            kind: "channel_videos",
            sourceId: "@nooklet",
            canonicalUrl: "https://www.youtube.com/@nooklet/videos",
        });
        discoverChannelMock.mockResolvedValue({
            enumeration: channelEnumeration,
            publicPlaylists: [],
            playlistDiscoveryError: new Error("raw extractor detail"),
        });

        const result = await discoverYouTube("https://youtube.com/@nooklet", "user-1");

        expect(result).toMatchObject({
            kind: "source",
            enumeration: channelEnumeration,
            publicPlaylists: [],
            playlistDiscoveryError:
                "Nooklet could not read that YouTube request. Try a supported public URL or a more specific search.",
        });
    });

    it("opens an exact playlist without querying the channel playlists tab", async () => {
        resolveUrlMock.mockReturnValue({
            kind: "playlist",
            sourceId: "PL1234567890abc",
            canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890abc",
        });
        enumerateMock.mockResolvedValue({
            ...channelEnumeration,
            source: {
                ...channelEnumeration.source,
                kind: "playlist",
                youtubeSourceId: "PL1234567890abc",
                canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890abc",
                title: "Release notes",
            },
        } as never);

        const result = await discoverYouTube(
            "https://www.youtube.com/playlist?list=PL1234567890abc",
            "user-1",
        );

        expect(result).toMatchObject({
            kind: "source",
            enumeration: { source: { kind: "playlist", youtubeSourceId: "PL1234567890abc" } },
            publicPlaylists: [],
        });
        expect(discoverChannelMock).not.toHaveBeenCalled();
        expect(enumerateMock).toHaveBeenCalledWith(
            "user-1",
            "https://www.youtube.com/playlist?list=PL1234567890abc",
        );
    });

    it("uses the signed-in user's search rate bucket", async () => {
        searchMock.mockResolvedValue([]);

        await discoverYouTube("Nooklet", "user-1");

        expect(searchMock).toHaveBeenCalledWith("Nooklet", { limit: 16, userId: "user-1" });
    });

    it("preserves the friendly discovery rate-limit message", async () => {
        searchMock.mockRejectedValue(
            new YouTubeDomainError(
                "Too many YouTube discovery requests. Try again in 1 minute.",
                "rate_limited",
            ),
        );

        await expect(discoverYouTube("Nooklet", "user-1")).resolves.toEqual({
            kind: "error",
            message: "Too many YouTube discovery requests. Try again in 1 minute.",
        });
    });
});
