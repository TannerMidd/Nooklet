import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/identity-access/workflows/get-protected-action-session", () => ({
    getProtectedActionSession: vi.fn(),
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
        cancelYouTubeDownload: vi.fn(),
        createYouTubeSource: vi.fn(),
        enumeratePublicYouTubeSource: vi.fn(),
        queueYouTubeVideos: vi.fn(),
        queueYouTubeVideoUrl: vi.fn(),
        removeYouTubeSource: vi.fn(),
        retryAllYouTubeDownloads: vi.fn(),
        retryYouTubeDownload: vi.fn(),
        retryYouTubeSourceInitialization: vi.fn(),
        summarizeYouTubeQueueResults: vi.fn((results: Array<{ outcome: string }>) => {
            const summary = {
                totalCount: results.length,
                queuedCount: 0,
                alreadyQueuedCount: 0,
                completedCount: 0,
                failedCount: 0,
                cancelledCount: 0,
            };

            for (const result of results) {
                if (result.outcome === "queued") {
                    summary.queuedCount += 1;
                }

                if (result.outcome === "already_queued") {
                    summary.alreadyQueuedCount += 1;
                }

                if (result.outcome === "completed") {
                    summary.completedCount += 1;
                }

                if (result.outcome === "failed") {
                    summary.failedCount += 1;
                }

                if (result.outcome === "cancelled") {
                    summary.cancelledCount += 1;
                }
            }

            return summary;
        }),
        setYouTubeSourcePaused: vi.fn(),
        syncYouTubeSourceNow: vi.fn(),
        updateYouTubeSource: vi.fn(),
    };
});

import { revalidatePath } from "next/cache";

import { initialYouTubeActionState } from "@/app/(workspace)/library/youtube/action-state";
import {
    configureYouTubeRequestAction,
    removeYouTubeSourceAction,
    retryAllYouTubeDownloadsAction,
} from "@/app/(workspace)/library/youtube/actions";
import { getProtectedActionSession } from "@/modules/identity-access/workflows/get-protected-action-session";
import {
    createYouTubeSource,
    enumeratePublicYouTubeSource,
    queueYouTubeVideos,
    queueYouTubeVideoUrl,
    removeYouTubeSource,
    retryAllYouTubeDownloads,
    YtDlpAdapterError,
} from "@/modules/youtube/public";

const authMock = vi.mocked(getProtectedActionSession);
const createSourceMock = vi.mocked(createYouTubeSource);
const enumerateSourceMock = vi.mocked(enumeratePublicYouTubeSource);
const queueVideosMock = vi.mocked(queueYouTubeVideos);
const queueVideoUrlMock = vi.mocked(queueYouTubeVideoUrl);
const removeSourceMock = vi.mocked(removeYouTubeSource);
const retryAllDownloadsMock = vi.mocked(retryAllYouTubeDownloads);
const revalidateMock = vi.mocked(revalidatePath);

function configurationForm(kind: "video" | "source") {
    const form = new FormData();

    form.set("targetKind", kind);
    form.set(
        "targetUrl",
        kind === "video"
            ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            : "https://www.youtube.com/@nooklet/videos",
    );
    form.set("libraryPathId", "youtube-path");
    form.set("qualityProfile", "mp4-1080p");

    return form;
}

beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } } as never);
});

describe("configureYouTubeRequestAction", () => {
    it("requires a protected user session", async () => {
        authMock.mockResolvedValue(null as never);

        await expect(
            configureYouTubeRequestAction(initialYouTubeActionState, configurationForm("video")),
        ).resolves.toEqual({ status: "error", message: "You need to sign in again." });
        expect(queueVideoUrlMock).not.toHaveBeenCalled();
    });

    it("re-probes an individual URL through the facade before queueing", async () => {
        queueVideoUrlMock.mockResolvedValue({
            id: "download-1",
            inserted: true,
            outcome: "queued",
        } as never);

        const result = await configureYouTubeRequestAction(
            initialYouTubeActionState,
            configurationForm("video"),
        );

        expect(queueVideoUrlMock).toHaveBeenCalledWith("user-1", {
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            libraryPathId: "youtube-path",
            qualityProfile: "mp4-1080p",
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library/youtube");
        expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
        expect(result).toEqual({ status: "success", message: "Video queued for download." });
    });

    it("explains existing failed and completed individual downloads without restarting them", async () => {
        queueVideoUrlMock.mockResolvedValueOnce({
            id: "download-failed",
            inserted: false,
            outcome: "failed",
            status: "failed",
        } as never);

        await expect(
            configureYouTubeRequestAction(initialYouTubeActionState, configurationForm("video")),
        ).resolves.toEqual({
            status: "error",
            message: "Video already failed. Use Retry in YouTube activity to try it again.",
        });

        queueVideoUrlMock.mockResolvedValueOnce({
            id: "download-completed",
            inserted: false,
            outcome: "completed",
            status: "completed",
        } as never);

        await expect(
            configureYouTubeRequestAction(initialYouTubeActionState, configurationForm("video")),
        ).resolves.toEqual({
            status: "success",
            message: "Video was already completed.",
        });
    });

    it("creates a baseline monitor with only selected backlog video IDs", async () => {
        const form = configurationForm("source");

        form.set("monitorFuture", "on");
        form.append("videoIds", "dQw4w9WgXcQ");
        createSourceMock.mockResolvedValue({
            source: { id: "source-1" },
            sync: {
                totalCount: 1,
                queuedCount: 1,
                alreadyQueuedCount: 0,
                completedCount: 0,
                failedCount: 0,
                cancelledCount: 0,
            },
        } as never);

        const result = await configureYouTubeRequestAction(initialYouTubeActionState, form);

        expect(createSourceMock).toHaveBeenCalledWith("user-1", {
            url: "https://www.youtube.com/@nooklet/videos",
            libraryPathId: "youtube-path",
            qualityProfile: "mp4-1080p",
            selectedVideoIds: ["dQw4w9WgXcQ"],
        });
        expect(result.status).toBe("success");
        expect(result.message).toBe("Monitor saved, baseline completed. 1 video queued.");
    });

    it("reports mixed baseline queue outcomes and leaves terminal rows for explicit retry", async () => {
        const form = configurationForm("source");

        form.set("monitorFuture", "on");
        form.append("videoIds", "dQw4w9WgXcQ");
        form.append("videoIds", "aqz-KE-bpKQ");
        createSourceMock.mockResolvedValue({
            source: { id: "source-1" },
            sync: {
                totalCount: 2,
                queuedCount: 0,
                alreadyQueuedCount: 0,
                completedCount: 1,
                failedCount: 1,
                cancelledCount: 0,
            },
        } as never);

        const result = await configureYouTubeRequestAction(initialYouTubeActionState, form);

        expect(result).toEqual({
            status: "error",
            message:
                "Monitor saved, baseline completed. 1 video already completed; 1 video failed; use Retry in YouTube activity to try again.",
        });
    });

    it("does not accept an empty selection when future monitoring is disabled", async () => {
        const result = await configureYouTubeRequestAction(
            initialYouTubeActionState,
            configurationForm("source"),
        );

        expect(result.status).toBe("error");
        expect(result.fieldErrors?.videoIds).toBeTruthy();
        expect(createSourceMock).not.toHaveBeenCalled();
    });

    it("rejects duplicate selected IDs before creating a monitor", async () => {
        const form = configurationForm("source");

        form.set("monitorFuture", "on");
        form.append("videoIds", "dQw4w9WgXcQ");
        form.append("videoIds", "dQw4w9WgXcQ");

        const result = await configureYouTubeRequestAction(initialYouTubeActionState, form);

        expect(result.status).toBe("error");
        expect(result.fieldErrors?.videoIds).toContain("only be included once");
        expect(createSourceMock).not.toHaveBeenCalled();
    });

    it("never queues from an incomplete source enumeration", async () => {
        const form = configurationForm("source");

        form.append("videoIds", "dQw4w9WgXcQ");
        enumerateSourceMock.mockResolvedValue({ complete: false } as never);

        const result = await configureYouTubeRequestAction(initialYouTubeActionState, form);

        expect(result).toEqual({
            status: "error",
            message: "YouTube returned an incomplete source listing. Try again later.",
        });
        expect(queueVideosMock).not.toHaveBeenCalled();
    });

    it("reports that no videos were queued when the atomic batch fails", async () => {
        const form = configurationForm("source");
        const selectedId = "dQw4w9WgXcQ";

        form.append("videoIds", selectedId);
        enumerateSourceMock.mockResolvedValue({
            complete: true,
            videos: [
                {
                    youtubeVideoId: selectedId,
                    title: "Selected video",
                    channelId: null,
                    channelTitle: null,
                    description: null,
                    publishedAt: null,
                    durationSeconds: 30,
                    thumbnailUrl: null,
                    webpageUrl: `https://www.youtube.com/watch?v=${selectedId}`,
                    contentKind: "regular",
                    availability: "public",
                    eligible: true,
                },
            ],
        } as never);
        queueVideosMock.mockRejectedValue(new Error("destination changed"));

        await expect(
            configureYouTubeRequestAction(initialYouTubeActionState, form),
        ).resolves.toEqual({
            status: "error",
            message: "No videos were queued. The YouTube videos could not be queued.",
        });
        expect(revalidateMock).not.toHaveBeenCalled();
    });

    it("summarizes mixed bulk outcomes without silently retrying terminal rows", async () => {
        const form = configurationForm("source");
        const selectedIds = [
            "dQw4w9WgXcQ",
            "aqz-KE-bpKQ",
            "jNQXAC9IVRw",
            "BaW_jenozKc",
            "9bZkp7q19f0",
        ];

        for (const selectedId of selectedIds) {
            form.append("videoIds", selectedId);
        }

        enumerateSourceMock.mockResolvedValue({
            complete: true,
            videos: selectedIds.map((youtubeVideoId) => ({
                youtubeVideoId,
                title: youtubeVideoId,
                channelId: null,
                channelTitle: null,
                description: null,
                publishedAt: null,
                durationSeconds: 30,
                thumbnailUrl: null,
                webpageUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
                contentKind: "regular",
                availability: "public",
                eligible: true,
            })),
        } as never);
        queueVideosMock.mockResolvedValue([
            { inserted: true, outcome: "queued", status: "queued" },
            { inserted: false, outcome: "already_queued", status: "queued" },
            { inserted: false, outcome: "completed", status: "completed" },
            { inserted: false, outcome: "failed", status: "failed" },
            { inserted: false, outcome: "cancelled", status: "cancelled" },
        ] as never);

        await expect(
            configureYouTubeRequestAction(initialYouTubeActionState, form),
        ).resolves.toEqual({
            status: "error",
            message:
                "1 video newly queued; 1 video already queued; 1 video already completed; 1 video failed; use Retry in YouTube activity to try again; 1 video cancelled; use Retry in YouTube activity to try again without creating a monitor.",
        });
        expect(revalidateMock).toHaveBeenCalled();
    });

    it("redacts extractor detail into a stable user-facing error", async () => {
        queueVideoUrlMock.mockRejectedValue(
            new YtDlpAdapterError("failed for https://secret.example/watch", "network" as never),
        );

        const result = await configureYouTubeRequestAction(
            initialYouTubeActionState,
            configurationForm("video"),
        );

        expect(result).toEqual({
            status: "error",
            message: "YouTube could not be reached right now. Try again in a few minutes.",
        });
        expect(result.message).not.toContain("secret.example");
    });
});

describe("retryAllYouTubeDownloadsAction", () => {
    it("derives the account from the protected session and queues the full rerunnable batch", async () => {
        retryAllDownloadsMock.mockResolvedValue(8);

        await expect(
            retryAllYouTubeDownloadsAction(initialYouTubeActionState, new FormData()),
        ).resolves.toEqual({ status: "success", message: "8 downloads queued to run now." });
        expect(retryAllDownloadsMock).toHaveBeenCalledWith("user-1");
        expect(revalidateMock).toHaveBeenCalledWith("/library/youtube");
        expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    });

    it("does not expose bulk retry without an authenticated session", async () => {
        authMock.mockResolvedValue(null as never);

        await expect(
            retryAllYouTubeDownloadsAction(initialYouTubeActionState, new FormData()),
        ).resolves.toEqual({ status: "error", message: "You need to sign in again." });
        expect(retryAllDownloadsMock).not.toHaveBeenCalled();
    });
});

describe("removeYouTubeSourceAction", () => {
    it("removes only the personal monitor and explicitly preserves downloaded files", async () => {
        const form = new FormData();

        form.set("sourceId", "source-1");
        removeSourceMock.mockResolvedValue({ id: "source-1" } as never);

        await expect(removeYouTubeSourceAction(initialYouTubeActionState, form)).resolves.toEqual({
            status: "success",
            message: "Monitor removed. Downloaded files remain in your library.",
        });
        expect(removeSourceMock).toHaveBeenCalledWith("user-1", "source-1");
    });
});
