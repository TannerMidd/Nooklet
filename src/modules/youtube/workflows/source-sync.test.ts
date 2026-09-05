import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    applySuccessfulEnumeration: vi.fn(),
    createInitializingSource: vi.fn(),
    getYouTubeAutomationSettingsWorkflow: vi.fn(),
    listActiveYouTubeSourceRecords: vi.fn(),
    recordYouTubeSourceError: vi.fn(),
    requireYouTubeSourceForUser: vi.fn(),
    resolveYouTubeDestination: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/youtube/repositories/youtube-repository", () => ({
    applySuccessfulEnumeration: mocks.applySuccessfulEnumeration,
    createInitializingSource: mocks.createInitializingSource,
    listActiveYouTubeSourceRecords: mocks.listActiveYouTubeSourceRecords,
    recordYouTubeSourceError: mocks.recordYouTubeSourceError,
    requireYouTubeSourceForUser: mocks.requireYouTubeSourceForUser,
    resolveYouTubeDestination: mocks.resolveYouTubeDestination,
}));
vi.mock("@/modules/youtube/workflows/automation", () => ({
    getYouTubeAutomationSettingsWorkflow: mocks.getYouTubeAutomationSettingsWorkflow,
}));

import type { YtDlpAdapter } from "@/modules/youtube/adapters/yt-dlp";

import {
    createYouTubeSourceWorkflow,
    retryYouTubeSourceInitializationWorkflow,
    syncAllActiveYouTubeSourcesWorkflow,
    syncYouTubeSourceWorkflow,
    YouTubeSourceSyncAggregateError,
} from "./source-sync";

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getYouTubeAutomationSettingsWorkflow.mockReset();
    mocks.resolveYouTubeDestination.mockReset();
    mocks.requireYouTubeSourceForUser.mockReset();
    mocks.listActiveYouTubeSourceRecords.mockReset();
    mocks.listActiveYouTubeSourceRecords.mockResolvedValue([]);
});

describe("shared YouTube source sync", () => {
    const sources = [
        {
            id: "source-good",
            userId: "user-1",
            canonicalUrl: "https://youtube.com/@good/videos",
            libraryPathId: "path-good",
            status: "active",
        },
        {
            id: "source-bad",
            userId: "user-2",
            canonicalUrl: "https://youtube.com/@bad/videos",
            libraryPathId: "path-bad",
            status: "active",
        },
    ];

    it("continues after a failure and throws an aggregate with mixed results", async () => {
        mocks.listActiveYouTubeSourceRecords.mockResolvedValue(sources);
        mocks.requireYouTubeSourceForUser.mockImplementation(async (_userId, sourceId) =>
            sources.find((source) => source.id === sourceId),
        );
        mocks.resolveYouTubeDestination.mockResolvedValue({ path: { id: "path" } });
        mocks.applySuccessfulEnumeration.mockResolvedValue({
            discoveredCount: 2,
            queuedCount: 1,
        });
        const enumerate = vi.fn(async (url: string) => {
            if (url.includes("@bad")) {
                throw new Error("private source detail");
            }

            return { complete: true, source: {}, videos: [] };
        });
        let aggregate: unknown;

        try {
            await syncAllActiveYouTubeSourcesWorkflow({
                adapter: { enumerate } as unknown as YtDlpAdapter,
            });
        } catch (error) {
            aggregate = error;
        }

        expect(enumerate).toHaveBeenCalledTimes(2);
        expect(aggregate).toBeInstanceOf(YouTubeSourceSyncAggregateError);
        expect((aggregate as YouTubeSourceSyncAggregateError).results).toEqual([
            {
                sourceId: "source-good",
                status: "succeeded",
                discoveredCount: 2,
                queuedCount: 1,
            },
            {
                sourceId: "source-bad",
                status: "failed",
                error: "private source detail",
            },
        ]);
        expect((aggregate as Error).message).toMatch(/^1 of 2 YouTube source syncs failed/);
    });

    it("attempts every source before reporting an all-failure aggregate", async () => {
        mocks.listActiveYouTubeSourceRecords.mockResolvedValue(sources);
        mocks.requireYouTubeSourceForUser.mockImplementation(async (_userId, sourceId) =>
            sources.find((source) => source.id === sourceId),
        );
        mocks.resolveYouTubeDestination.mockResolvedValue({ path: { id: "path" } });
        const enumerate = vi.fn(async () => {
            throw new Error("unavailable");
        });

        await expect(
            syncAllActiveYouTubeSourcesWorkflow({
                adapter: { enumerate } as unknown as YtDlpAdapter,
            }),
        ).rejects.toMatchObject({
            message: expect.stringMatching(/^2 of 2 YouTube source syncs failed/),
            results: expect.arrayContaining([
                expect.objectContaining({ sourceId: "source-good", status: "failed" }),
                expect.objectContaining({ sourceId: "source-bad", status: "failed" }),
            ]),
        });
        expect(enumerate).toHaveBeenCalledTimes(2);
    });
});

describe("YouTube source sync destination fencing", () => {
    it("does not enumerate when the configured destination is no longer active", async () => {
        const enumerate = vi.fn();

        mocks.requireYouTubeSourceForUser.mockResolvedValue({
            id: "source-1",
            userId: "user-1",
            canonicalUrl: "https://youtube.com/@nooklet/videos",
            libraryPathId: "path-1",
            status: "active",
        });
        mocks.resolveYouTubeDestination.mockRejectedValue(new Error("destination disabled"));

        await expect(
            syncYouTubeSourceWorkflow("user-1", "source-1", {
                adapter: { enumerate } as unknown as YtDlpAdapter,
            }),
        ).rejects.toThrow("destination disabled");
        expect(enumerate).not.toHaveBeenCalled();
        expect(mocks.applySuccessfulEnumeration).not.toHaveBeenCalled();
    });

    it("rechecks the destination after enumeration before membership or queue writes", async () => {
        const enumeration = { complete: true, source: {}, videos: [] };
        const enumerate = vi.fn(async () => enumeration);

        mocks.requireYouTubeSourceForUser.mockResolvedValue({
            id: "source-2",
            userId: "user-1",
            canonicalUrl: "https://youtube.com/@nooklet/videos",
            libraryPathId: "path-2",
            status: "active",
        });
        mocks.resolveYouTubeDestination
            .mockResolvedValueOnce({ path: { id: "path-2" } })
            .mockRejectedValueOnce(new Error("destination changed"));

        await expect(
            syncYouTubeSourceWorkflow("user-1", "source-2", {
                adapter: { enumerate } as unknown as YtDlpAdapter,
            }),
        ).rejects.toThrow("destination changed");
        expect(enumerate).toHaveBeenCalledOnce();
        expect(mocks.resolveYouTubeDestination).toHaveBeenCalledTimes(2);
        expect(mocks.applySuccessfulEnumeration).not.toHaveBeenCalled();
    });
});

describe("YouTube source initialization selections", () => {
    it("records a visible source error when recurring-job bootstrap fails", async () => {
        const source = {
            id: "source-bootstrap-failure",
            userId: "user-1",
            canonicalUrl: "https://youtube.com/@nooklet/videos",
            libraryPathId: "path-1",
            status: "initializing",
        };

        mocks.createInitializingSource.mockResolvedValue(source);
        mocks.getYouTubeAutomationSettingsWorkflow.mockRejectedValue(
            new Error("scheduler unavailable"),
        );

        await expect(
            createYouTubeSourceWorkflow(
                "user-1",
                {
                    url: source.canonicalUrl,
                    libraryPathId: source.libraryPathId,
                    qualityProfile: "mp4-1080p",
                },
                { adapter: { enumerate: vi.fn() } as unknown as YtDlpAdapter },
            ),
        ).rejects.toThrow("scheduler unavailable");

        expect(mocks.recordYouTubeSourceError).toHaveBeenCalledWith(
            "user-1",
            source.id,
            "scheduler unavailable",
        );
    });

    it("retries shared recurring-job bootstrap before syncing an errored source", async () => {
        const source = {
            id: "source-retry-bootstrap",
            userId: "user-1",
            canonicalUrl: "https://youtube.com/@nooklet/videos",
            libraryPathId: "path-1",
            status: "initializing",
        };
        const recurringJob = { id: "youtube-recurring-job" };
        let saveAttempts = 0;

        mocks.createInitializingSource.mockResolvedValue(source);
        mocks.getYouTubeAutomationSettingsWorkflow.mockImplementation(async () => {
            saveAttempts += 1;

            if (saveAttempts === 1) {
                throw new Error("saveRecurringJob failed");
            }

            return recurringJob;
        });
        mocks.requireYouTubeSourceForUser.mockResolvedValue(source);
        mocks.resolveYouTubeDestination.mockResolvedValue({ path: { id: "path-1" } });
        mocks.applySuccessfulEnumeration.mockResolvedValue({
            baseline: true,
            discoveredCount: 0,
            queuedCount: 0,
            removedCount: 0,
        });
        const adapter = {
            enumerate: vi.fn(async () => ({ complete: true, source: {}, videos: [] })),
        };

        await expect(
            createYouTubeSourceWorkflow(
                "user-1",
                {
                    url: source.canonicalUrl,
                    libraryPathId: source.libraryPathId,
                    qualityProfile: "mp4-1080p",
                },
                { adapter: adapter as unknown as YtDlpAdapter },
            ),
        ).rejects.toThrow("saveRecurringJob failed");

        await expect(
            retryYouTubeSourceInitializationWorkflow("user-1", source.id, {
                adapter: adapter as unknown as YtDlpAdapter,
            }),
        ).resolves.toMatchObject({ queuedCount: 0 });

        expect(saveAttempts).toBe(2);
        expect(recurringJob).toEqual({ id: "youtube-recurring-job" });
        expect(adapter.enumerate).toHaveBeenCalledOnce();
        expect(mocks.recordYouTubeSourceError).toHaveBeenCalledWith(
            "user-1",
            source.id,
            "saveRecurringJob failed",
        );
        expect(mocks.applySuccessfulEnumeration).toHaveBeenCalledOnce();
    });

    it("persists selection intent before enumeration and never probes arbitrary client IDs", async () => {
        const enumeration = {
            complete: true,
            source: {
                kind: "channel_videos",
                youtubeSourceId: "UC1234567890123456789012",
                canonicalUrl: "https://www.youtube.com/channel/UC1234567890123456789012/videos",
                title: "Nooklet",
                channelId: "UC1234567890123456789012",
                channelTitle: "Nooklet",
                thumbnailUrl: null,
            },
            videos: [],
        } as const;
        const enumerate = vi.fn(async () => enumeration);
        const probe = vi.fn();
        const source = {
            id: "source-initial",
            userId: "user-1",
            canonicalUrl: enumeration.source.canonicalUrl,
            libraryPathId: "path-1",
            status: "initializing",
        };

        mocks.createInitializingSource.mockResolvedValue(source);
        mocks.requireYouTubeSourceForUser.mockResolvedValue(source);
        mocks.resolveYouTubeDestination.mockResolvedValue({ path: { id: "path-1" } });
        mocks.applySuccessfulEnumeration.mockResolvedValue({
            baseline: true,
            discoveredCount: 0,
            queuedCount: 0,
            removedCount: 0,
        });

        await createYouTubeSourceWorkflow(
            "user-1",
            {
                url: enumeration.source.canonicalUrl,
                libraryPathId: "path-1",
                qualityProfile: "mp4-1080p",
                selectedVideoIds: ["dQw4w9WgXcQ"],
            },
            { adapter: { enumerate, probe } as unknown as YtDlpAdapter },
        );

        expect(mocks.createInitializingSource).toHaveBeenCalledWith(
            expect.objectContaining({ selectedVideoIds: ["dQw4w9WgXcQ"] }),
        );
        expect(enumerate).toHaveBeenCalledWith(enumeration.source.canonicalUrl);
        expect(probe).not.toHaveBeenCalled();
        expect(mocks.applySuccessfulEnumeration).toHaveBeenCalledWith({ source, enumeration });
    });
});
