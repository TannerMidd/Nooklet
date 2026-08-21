import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createYouTubeSourceWorkflow: vi.fn(),
    retryAllYouTubeDownloads: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/youtube/workflows/source-sync", () => ({
    createYouTubeSourceWorkflow: mocks.createYouTubeSourceWorkflow,
    syncAllActiveYouTubeSourcesWorkflow: vi.fn(),
    syncYouTubeSourceWorkflow: vi.fn(),
}));
vi.mock("@/modules/youtube/repositories/youtube-repository", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/modules/youtube/repositories/youtube-repository")>()),
    retryAllYouTubeDownloads: mocks.retryAllYouTubeDownloads,
}));

import {
    createYtDlpAdapter,
    type YtDlpAdapter,
    type YtDlpProcessExecutor,
} from "@/modules/youtube/adapters/yt-dlp";
import type { YouTubeEnumerationDTO } from "@/modules/youtube/types";

import {
    createYouTubeSource,
    discoverPublicYouTubeChannel,
    probePublicYouTubeVideo,
    queueYouTubeVideoUrl,
    retryAllYouTubeDownloads,
    searchPublicYouTube,
    YouTubeDomainError,
} from "./public";

beforeEach(() => {
    vi.clearAllMocks();
});

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

function channelEnumeration(): YouTubeEnumerationDTO {
    return {
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
}

describe("public YouTube search", () => {
    it("enforces a durable caller rate limit before invoking yt-dlp", async () => {
        const search = vi.fn(async () => []);
        const adapter = { search } as unknown as YtDlpAdapter;
        const userId = `rate-test-${Date.now()}`;

        for (let index = 0; index < 20; index += 1) {
            await expect(searchPublicYouTube("nooklet", { adapter, userId })).resolves.toEqual([]);
        }

        await expect(searchPublicYouTube("nooklet", { adapter, userId })).rejects.toMatchObject({
            code: "rate_limited",
        } satisfies Partial<YouTubeDomainError>);
        expect(search).toHaveBeenCalledTimes(20);
    });
});

describe("public YouTube URL discovery", () => {
    it("blocks repeated video probes before invoking the extractor again", async () => {
        const executor = vi.fn<YtDlpProcessExecutor>().mockResolvedValue({
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({
                id: "dQw4w9WgXcQ",
                title: "Regular upload",
                availability: "public",
            }),
        });
        const adapter = createYtDlpAdapter({ executor, ytDlpPath: "fake-yt-dlp" });
        const userId = `probe-rate-test-${Date.now()}`;
        const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

        for (let index = 0; index < 20; index += 1) {
            await expect(probePublicYouTubeVideo(userId, url, { adapter })).resolves.toMatchObject({
                youtubeVideoId: "dQw4w9WgXcQ",
            });
        }

        await expect(probePublicYouTubeVideo(userId, url, { adapter })).rejects.toMatchObject({
            code: "rate_limited",
        } satisfies Partial<YouTubeDomainError>);
        await expect(
            queueYouTubeVideoUrl(
                userId,
                {
                    url,
                    libraryPathId: "youtube-root",
                    qualityProfile: "mp4-1080p",
                },
                { adapter },
            ),
        ).rejects.toMatchObject({ code: "rate_limited" } satisfies Partial<YouTubeDomainError>);
        expect(executor).toHaveBeenCalledTimes(20);
    });

    it("charges a channel's Videos and playlists lookup as one discovery", async () => {
        const executor = vi.fn<YtDlpProcessExecutor>().mockImplementation(async (_path, args) => ({
            exitCode: 0,
            stderr: "",
            stdout: args.at(-1)?.endsWith("/playlists")
                ? JSON.stringify({ title: "Nooklet playlists", entries: [] })
                : JSON.stringify({
                      id: "UC1234567890123456789012",
                      title: "Nooklet",
                      channel_id: "UC1234567890123456789012",
                      entries: [],
                  }),
        }));
        const adapter = createYtDlpAdapter({ executor, ytDlpPath: "fake-yt-dlp" });
        const userId = `channel-rate-test-${Date.now()}`;
        const url = "https://www.youtube.com/@nooklet/videos";

        for (let index = 0; index < 20; index += 1) {
            await expect(
                discoverPublicYouTubeChannel(userId, url, { adapter }),
            ).resolves.toMatchObject({
                enumeration: { complete: true },
                publicPlaylists: [],
            });
        }

        await expect(discoverPublicYouTubeChannel(userId, url, { adapter })).rejects.toMatchObject({
            code: "rate_limited",
        } satisfies Partial<YouTubeDomainError>);
        expect(executor).toHaveBeenCalledTimes(40);
    });

    it("waits for Videos enumeration before listing public playlists", async () => {
        const pendingEnumeration = createDeferred<YouTubeEnumerationDTO>();
        const enumerate = vi.fn(() => pendingEnumeration.promise);
        const listChannelPlaylists = vi.fn(async () => []);
        const adapter = { enumerate, listChannelPlaylists } as unknown as YtDlpAdapter;
        const discovery = discoverPublicYouTubeChannel(
            `channel-sequence-test-${Date.now()}`,
            "https://www.youtube.com/@nooklet/videos",
            { adapter },
        );

        expect(enumerate).toHaveBeenCalledWith("https://www.youtube.com/@nooklet/videos");
        expect(listChannelPlaylists).not.toHaveBeenCalled();

        pendingEnumeration.resolve(channelEnumeration());

        await expect(discovery).resolves.toMatchObject({
            enumeration: { complete: true },
            publicPlaylists: [],
            playlistDiscoveryError: null,
        });
        expect(listChannelPlaylists).toHaveBeenCalledWith(
            "https://www.youtube.com/@nooklet/videos",
            50,
        );
    });

    it("returns graceful playlist degradation after successful enumeration", async () => {
        const playlistError = new Error("playlist listing unavailable");
        const enumerate = vi.fn(async () => channelEnumeration());
        const listChannelPlaylists = vi.fn(async () => {
            throw playlistError;
        });
        const adapter = { enumerate, listChannelPlaylists } as unknown as YtDlpAdapter;

        await expect(
            discoverPublicYouTubeChannel(
                `playlist-degradation-test-${Date.now()}`,
                "https://www.youtube.com/@nooklet/videos",
                { adapter },
            ),
        ).resolves.toMatchObject({
            enumeration: { complete: true },
            publicPlaylists: [],
            playlistDiscoveryError: playlistError,
        });
    });

    it("does not start playlist discovery when Videos enumeration fails", async () => {
        const enumerationError = new Error("Videos enumeration unavailable");
        const enumerate = vi.fn(async () => {
            throw enumerationError;
        });
        const listChannelPlaylists = vi.fn(async () => []);
        const adapter = { enumerate, listChannelPlaylists } as unknown as YtDlpAdapter;

        await expect(
            discoverPublicYouTubeChannel(
                `channel-enumeration-failure-test-${Date.now()}`,
                "https://www.youtube.com/@nooklet/videos",
                { adapter },
            ),
        ).rejects.toBe(enumerationError);
        expect(listChannelPlaylists).not.toHaveBeenCalled();
    });
});

describe("public YouTube monitor creation", () => {
    it("forwards initial selection intent to the atomic source workflow", async () => {
        mocks.createYouTubeSourceWorkflow.mockResolvedValue({ sourceId: "source-1" });
        const input = {
            url: "https://www.youtube.com/@nooklet/videos",
            libraryPathId: "youtube-root",
            qualityProfile: "mp4-1080p" as const,
            selectedVideoIds: ["dQw4w9WgXcQ"] as const,
        };

        await expect(createYouTubeSource("user-1", input)).resolves.toEqual({
            sourceId: "source-1",
        });
        expect(mocks.createYouTubeSourceWorkflow).toHaveBeenCalledWith("user-1", input);
    });

    it("rate-limits user-triggered initialization before entering the workflow", async () => {
        mocks.createYouTubeSourceWorkflow.mockResolvedValue({ sourceId: "source-1" });
        const userId = `monitor-rate-test-${Date.now()}`;
        const input = {
            url: "https://www.youtube.com/@nooklet/videos",
            libraryPathId: "youtube-root",
            qualityProfile: "mp4-1080p" as const,
            selectedVideoIds: [] as const,
        };

        for (let index = 0; index < 20; index += 1) {
            await createYouTubeSource(userId, input);
        }

        await expect(createYouTubeSource(userId, input)).rejects.toMatchObject({
            code: "rate_limited",
        } satisfies Partial<YouTubeDomainError>);
        expect(mocks.createYouTubeSourceWorkflow).toHaveBeenCalledTimes(20);
    });
});

describe("public YouTube retry controls", () => {
    it("requeues failed rows without starting a downloader in the web process", async () => {
        mocks.retryAllYouTubeDownloads.mockResolvedValue(4);

        await expect(retryAllYouTubeDownloads("user-1")).resolves.toBe(4);
        expect(mocks.retryAllYouTubeDownloads).toHaveBeenCalledWith("user-1");
    });
});
