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
        queueVideoUrlMock.mockResolvedValue({ id: "download-1" } as never);

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

    it("creates a baseline monitor with only selected backlog video IDs", async () => {
        const form = configurationForm("source");

        form.set("monitorFuture", "on");
        form.append("videoIds", "dQw4w9WgXcQ");
        createSourceMock.mockResolvedValue({ source: { id: "source-1" } } as never);

        const result = await configureYouTubeRequestAction(initialYouTubeActionState, form);

        expect(createSourceMock).toHaveBeenCalledWith("user-1", {
            url: "https://www.youtube.com/@nooklet/videos",
            libraryPathId: "youtube-path",
            qualityProfile: "mp4-1080p",
            selectedVideoIds: ["dQw4w9WgXcQ"],
        });
        expect(result.status).toBe("success");
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
