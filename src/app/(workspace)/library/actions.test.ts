import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));
vi.mock(
    "@/modules/media-library/workflows/request-title-with-release-search",
    async (importOriginal) => {
        const actual =
            await importOriginal<
                typeof import("@/modules/media-library/workflows/request-title-with-release-search")
            >();

        return {
            ...actual,
            requestExistingTitleContentWorkflow: vi.fn(),
        };
    },
);
vi.mock("@/modules/media-library/commands/add-library-path", () => {
    class LibraryPathCommandError extends Error {
        constructor(
            message: string,
            public readonly code: "folder_not_found" | "path_already_exists",
        ) {
            super(message);
            this.name = "LibraryPathCommandError";
        }
    }

    return {
        addLibraryPathCommand: vi.fn(),
        LibraryPathCommandError,
    };
});
vi.mock("@/modules/media-library/commands/remove-library-path", () => {
    class RemoveLibraryPathCommandError extends Error {
        constructor(
            message: string,
            public readonly code: "path_not_found",
        ) {
            super(message);
            this.name = "RemoveLibraryPathCommandError";
        }
    }

    return {
        removeLibraryPathCommand: vi.fn(),
        RemoveLibraryPathCommandError,
    };
});
vi.mock("@/modules/media-library/commands/remove-media-title", () => {
    class RemoveMediaTitleCommandError extends Error {
        constructor(
            message: string,
            public readonly code: "title_not_found" | "active_download",
        ) {
            super(message);
            this.name = "RemoveMediaTitleCommandError";
        }
    }

    return {
        removeMediaTitleCommand: vi.fn(),
        RemoveMediaTitleCommandError,
    };
});
vi.mock("@/modules/media-library/commands/set-default-download-path", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/modules/media-library/commands/set-default-download-path")
    >()),
    setDefaultDownloadPathCommand: vi.fn(),
}));
vi.mock("@/modules/media-library/commands/update-library-path", () => {
    class UpdateLibraryPathCommandError extends Error {
        constructor(
            message: string,
            public readonly code: "folder_not_found" | "path_already_exists" | "path_not_found",
        ) {
            super(message);
            this.name = "UpdateLibraryPathCommandError";
        }
    }

    return {
        updateLibraryPathCommand: vi.fn(),
        UpdateLibraryPathCommandError,
    };
});
vi.mock("@/modules/media-library/commands/update-media-title-preferences", () => {
    class UpdateMediaTitlePreferencesCommandError extends Error {
        constructor(
            message: string,
            public readonly code: "title_not_found",
        ) {
            super(message);
            this.name = "UpdateMediaTitlePreferencesCommandError";
        }
    }

    return {
        updateMediaTitlePreferencesCommand: vi.fn(),
        UpdateMediaTitlePreferencesCommandError,
    };
});
vi.mock("@/modules/media-library/commands/update-media-library-monitoring", () => ({
    updateMediaLibraryMonitoringCommand: vi.fn(),
}));
vi.mock("@/modules/media-library/commands/update-tv-episode-monitoring", () => {
    class UpdateTvEpisodeMonitoringCommandError extends Error {
        constructor(
            message: string,
            public readonly code: "episode_not_found",
        ) {
            super(message);
            this.name = "UpdateTvEpisodeMonitoringCommandError";
        }
    }

    return {
        updateTvEpisodeMonitoringCommand: vi.fn(),
        UpdateTvEpisodeMonitoringCommandError,
    };
});
vi.mock("@/modules/jobs/repositories/job-repository", () => ({
    createImmediateJob: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/configure-library-scan-schedule", () => ({
    configureLibraryScanSchedule: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/configure-missing-search-schedule", () => ({
    configureMissingSearchSchedule: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/configure-metadata-refresh-schedule", () => ({
    configureMetadataRefreshSchedule: vi.fn(),
}));
vi.mock(
    "@/modules/media-library/workflows/search-library-item-releases",
    async (importOriginal) => {
        const actual =
            await importOriginal<
                typeof import("@/modules/media-library/workflows/search-library-item-releases")
            >();

        return {
            ...actual,
            searchLibraryItemReleasesWorkflow: vi.fn(),
        };
    },
);
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
    findMediaTitleByIdForUser: vi.fn(),
    findTvSeasonByIdForUser: vi.fn(),
}));
vi.mock("@/modules/downloads/queries/has-active-download-association", () => ({
    hasActiveDownloadAssociationForTitle: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment", () => ({
    attemptSeasonPack: vi.fn(),
    createSeasonFulfillment: vi.fn(),
    retryOpenSeasonFulfillmentEpisode: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
    addLibraryPathCommand,
    LibraryPathCommandError,
} from "@/modules/media-library/commands/add-library-path";
import {
    removeLibraryPathCommand,
    RemoveLibraryPathCommandError,
} from "@/modules/media-library/commands/remove-library-path";
import {
    removeMediaTitleCommand,
    RemoveMediaTitleCommandError,
} from "@/modules/media-library/commands/remove-media-title";
import { setDefaultDownloadPathCommand } from "@/modules/media-library/commands/set-default-download-path";
import {
    updateLibraryPathCommand,
    UpdateLibraryPathCommandError,
} from "@/modules/media-library/commands/update-library-path";
import {
    updateMediaTitlePreferencesCommand,
    UpdateMediaTitlePreferencesCommandError,
} from "@/modules/media-library/commands/update-media-title-preferences";
import { updateMediaLibraryMonitoringCommand } from "@/modules/media-library/commands/update-media-library-monitoring";
import {
    updateTvEpisodeMonitoringCommand,
    UpdateTvEpisodeMonitoringCommandError,
} from "@/modules/media-library/commands/update-tv-episode-monitoring";
import { createImmediateJob } from "@/modules/jobs/repositories/job-repository";
import { configureLibraryScanSchedule } from "@/modules/media-library/workflows/configure-library-scan-schedule";
import { configureMissingSearchSchedule } from "@/modules/media-library/workflows/configure-missing-search-schedule";
import { configureMetadataRefreshSchedule } from "@/modules/media-library/workflows/configure-metadata-refresh-schedule";
import {
    searchLibraryItemReleasesWorkflow,
    SearchLibraryItemReleasesWorkflowError,
} from "@/modules/media-library/workflows/search-library-item-releases";
import {
    findMediaTitleByIdForUser,
    findTvSeasonByIdForUser,
} from "@/modules/media-library/repositories/media-library-repository";
import { hasActiveDownloadAssociationForTitle } from "@/modules/downloads/queries/has-active-download-association";
import {
    attemptSeasonPack,
    createSeasonFulfillment,
    retryOpenSeasonFulfillmentEpisode,
} from "@/modules/downloads/workflows/season-fulfillment";
import { requestExistingTitleContentWorkflow } from "@/modules/media-library/workflows/request-title-with-release-search";

import {
    addLibraryPathAction,
    removeMediaTitleAction,
    removeLibraryPathAction,
    requestExistingTitleContentAction,
    scanLibraryAction,
    searchLibraryItemReleasesAction,
    setDefaultDownloadPathAction,
    updateLibraryPathAction,
    updateLibraryMonitoringAction,
    updateLibraryScanScheduleAction,
    updateMetadataRefreshScheduleAction,
    updateMediaTitlePreferencesAction,
    updateMissingSearchScheduleAction,
    updateTvEpisodeMonitoringAction,
} from "./actions";
import {
    initialLibraryItemSearchActionState,
    initialLibraryMonitoringActionState,
    initialLibraryScanScheduleActionState,
    initialLibraryPathActionState,
    initialLibraryPathMutationActionState,
    initialDefaultDownloadPathActionState,
    initialMediaTitlePreferenceActionState,
    initialMetadataRefreshScheduleActionState,
    initialMissingSearchScheduleActionState,
    initialRemoveMediaTitleActionState,
    initialRequestExistingTitleContentActionState,
    initialTvEpisodeMonitoringActionState,
} from "./action-state";

const authMock = vi.mocked(auth);
const addLibraryPathMock = vi.mocked(addLibraryPathCommand);
const updateLibraryPathMock = vi.mocked(updateLibraryPathCommand);
const updateLibraryMonitoringMock = vi.mocked(updateMediaLibraryMonitoringCommand);
const updateMediaTitlePreferencesMock = vi.mocked(updateMediaTitlePreferencesCommand);
const updateTvEpisodeMonitoringMock = vi.mocked(updateTvEpisodeMonitoringCommand);
const removeLibraryPathMock = vi.mocked(removeLibraryPathCommand);
const removeMediaTitleMock = vi.mocked(removeMediaTitleCommand);
const findMediaTitleMock = vi.mocked(findMediaTitleByIdForUser);
const hasActiveTitleDownloadMock = vi.mocked(hasActiveDownloadAssociationForTitle);
const createImmediateJobMock = vi.mocked(createImmediateJob);
const configureLibraryScanScheduleMock = vi.mocked(configureLibraryScanSchedule);
const configureMissingSearchScheduleMock = vi.mocked(configureMissingSearchSchedule);
const configureMetadataRefreshScheduleMock = vi.mocked(configureMetadataRefreshSchedule);
const setDefaultDownloadPathMock = vi.mocked(setDefaultDownloadPathCommand);
const searchLibraryItemMock = vi.mocked(searchLibraryItemReleasesWorkflow);
const findTvSeasonMock = vi.mocked(findTvSeasonByIdForUser);
const attemptSeasonPackMock = vi.mocked(attemptSeasonPack);
const createSeasonFulfillmentMock = vi.mocked(createSeasonFulfillment);
const retryOpenSeasonEpisodeMock = vi.mocked(retryOpenSeasonFulfillmentEpisode);
const requestExistingTitleContentMock = vi.mocked(requestExistingTitleContentWorkflow);
const revalidateMock = vi.mocked(revalidatePath);

beforeEach(() => {
    vi.clearAllMocks();
    retryOpenSeasonEpisodeMock.mockResolvedValue({ handled: false });
});

describe("requestExistingTitleContentAction", () => {
    function seasonForm(downloadNow = true) {
        const form = new FormData();

        form.set("titleId", "f9cf3e46-c202-46f4-97aa-dd37be8f7766");
        form.set("selectionMode", "seasons");
        form.append("selectedSeasons", "1");

        if (downloadNow) {
            form.set("downloadNow", "on");
        } else {
            form.set("downloadNow", "off");
        }

        return form;
    }

    it("reports automatic episode fallback as a successful recovery outcome", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        requestExistingTitleContentMock.mockResolvedValue({
            title: {
                id: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
                title: "Severance",
                qualityProfile: "hd-1080p",
            },
            selections: [
                {
                    target: { kind: "season", season: 1 },
                    releaseSearch: {
                        searched: true,
                        searchRun: { status: "succeeded" },
                        results: [],
                    },
                    queuedDownload: {
                        queued: false,
                        reason: "no_matching_release",
                        message: null,
                    },
                    seasonFallback: {
                        completed: false,
                        queuedCount: 2,
                        activeCount: 0,
                        ownedCount: 0,
                        unavailableCount: 1,
                    },
                },
            ],
            queuedDownload: {
                queued: false,
                reason: "no_matching_release",
                message: null,
            },
        } as never);

        const result = await requestExistingTitleContentAction(
            initialRequestExistingTitleContentActionState,
            seasonForm(),
        );

        expect(result).toMatchObject({
            status: "warning",
            titleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            queuedCount: 1,
            message: expect.stringContaining("switched automatically to individual episodes"),
        });
        expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    });
});

describe("addLibraryPathAction", () => {
    function validForm() {
        const form = new FormData();

        form.set("mediaType", "movie");
        form.set("libraryName", "Movies");
        form.set("path", "F:/Media/Movies");
        form.set("label", "Movie root");

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await addLibraryPathAction(initialLibraryPathActionState, validForm());

        expect(result).toEqual({ status: "error", message: "You need to sign in again." });
        expect(addLibraryPathMock).not.toHaveBeenCalled();
    });

    it("rejects library-folder changes from non-admin users", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "user" } } as never);

        const result = await addLibraryPathAction(initialLibraryPathActionState, validForm());

        expect(result).toEqual({
            status: "error",
            message: "Only an administrator can manage library folders.",
        });
        expect(addLibraryPathMock).not.toHaveBeenCalled();
    });

    it("validates submitted media type", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        const form = validForm();

        form.set("mediaType", "music");

        const result = await addLibraryPathAction(initialLibraryPathActionState, form);

        expect(result.status).toBe("error");
        expect(addLibraryPathMock).not.toHaveBeenCalled();
    });

    it("maps command errors to friendly messages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        addLibraryPathMock.mockRejectedValue(
            new LibraryPathCommandError(
                "That folder is already attached to your library.",
                "path_already_exists",
            ),
        );

        const result = await addLibraryPathAction(initialLibraryPathActionState, validForm());

        expect(result).toEqual({
            status: "error",
            message: "That folder is already attached to your library.",
        });
    });

    it("adds the path and revalidates the library page", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        addLibraryPathMock.mockResolvedValue(undefined as never);

        const result = await addLibraryPathAction(initialLibraryPathActionState, validForm());

        expect(addLibraryPathMock).toHaveBeenCalledWith("u1", {
            mediaType: "movie",
            libraryName: "Movies",
            path: "F:/Media/Movies",
            label: "Movie root",
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(result).toEqual({ status: "success", message: "Library folder added." });
    });
});

describe("scanLibraryAction", () => {
    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await scanLibraryAction();

        expect(result).toEqual({ status: "error", message: "You need to sign in again." });
        expect(createImmediateJobMock).not.toHaveBeenCalled();
    });

    it("does not let a regular user queue an instance library scan", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "user" } } as never);

        const result = await scanLibraryAction();

        expect(result).toEqual({
            status: "error",
            message: "Only an administrator can run instance automation.",
        });
        expect(createImmediateJobMock).not.toHaveBeenCalled();
    });

    it("maps queue failures to a friendly message", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        createImmediateJobMock.mockRejectedValue(new Error("database unavailable"));

        const result = await scanLibraryAction();

        expect(result).toEqual({ status: "error", message: "Nooklet could not scan the library." });
    });

    it("queues the scan for the isolated worker and revalidates the library page", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        createImmediateJobMock.mockResolvedValue({ id: "job-1" } as never);

        const result = await scanLibraryAction();

        expect(createImmediateJobMock).toHaveBeenCalledWith({
            userId: "u1",
            jobType: "media-library-scan",
            targetType: "media-library",
            targetKey: "manual",
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(result).toEqual({
            status: "success",
            message: "Library scan queued. Nooklet will run it in the isolated background worker.",
        });
    });
});

describe("updateLibraryScanScheduleAction", () => {
    function validForm() {
        const form = new FormData();

        form.set("enabled", "on");
        form.set("intervalMinutes", "120");

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await updateLibraryScanScheduleAction(
            initialLibraryScanScheduleActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "You need to sign in again." });
        expect(configureLibraryScanScheduleMock).not.toHaveBeenCalled();
    });

    it("does not let a regular user change the instance library-scan schedule", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "user" } } as never);

        const result = await updateLibraryScanScheduleAction(
            initialLibraryScanScheduleActionState,
            validForm(),
        );

        expect(result).toEqual({
            status: "error",
            message: "Only an administrator can manage instance automation.",
        });
        expect(configureLibraryScanScheduleMock).not.toHaveBeenCalled();
    });

    it("validates interval minutes", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        const form = validForm();

        form.set("intervalMinutes", "5");

        const result = await updateLibraryScanScheduleAction(
            initialLibraryScanScheduleActionState,
            form,
        );

        expect(result.status).toBe("error");
        expect(result.fieldErrors?.intervalMinutes).toBe("Schedule at least every 15 minutes.");
        expect(configureLibraryScanScheduleMock).not.toHaveBeenCalled();
    });

    it("saves the schedule and revalidates the library page", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        configureLibraryScanScheduleMock.mockResolvedValue({
            ok: true,
            message: "Library scan enabled every 120 minutes.",
        });

        const result = await updateLibraryScanScheduleAction(
            initialLibraryScanScheduleActionState,
            validForm(),
        );

        expect(configureLibraryScanScheduleMock).toHaveBeenCalledWith("u1", {
            enabled: true,
            intervalMinutes: 120,
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(result).toEqual({
            status: "success",
            message: "Library scan enabled every 120 minutes.",
        });
    });
});

describe("updateMissingSearchScheduleAction", () => {
    function validForm() {
        const form = new FormData();

        form.set("enabled", "on");
        form.set("intervalMinutes", "720");

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await updateMissingSearchScheduleAction(
            initialMissingSearchScheduleActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "You need to sign in again." });
        expect(configureMissingSearchScheduleMock).not.toHaveBeenCalled();
    });

    it("does not let a regular user change the instance missing-search schedule", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "user" } } as never);

        const result = await updateMissingSearchScheduleAction(
            initialMissingSearchScheduleActionState,
            validForm(),
        );

        expect(result).toEqual({
            status: "error",
            message: "Only an administrator can manage instance automation.",
        });
        expect(configureMissingSearchScheduleMock).not.toHaveBeenCalled();
    });

    it("validates interval minutes", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        const form = validForm();

        form.set("intervalMinutes", "5");

        const result = await updateMissingSearchScheduleAction(
            initialMissingSearchScheduleActionState,
            form,
        );

        expect(result.status).toBe("error");
        expect(result.fieldErrors?.intervalMinutes).toBe("Schedule at least every 15 minutes.");
        expect(configureMissingSearchScheduleMock).not.toHaveBeenCalled();
    });

    it("saves the schedule and revalidates the library page", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        configureMissingSearchScheduleMock.mockResolvedValue({
            ok: true,
            message: "Missing-content search enabled every 720 minutes.",
        });

        const result = await updateMissingSearchScheduleAction(
            initialMissingSearchScheduleActionState,
            validForm(),
        );

        expect(configureMissingSearchScheduleMock).toHaveBeenCalledWith("u1", {
            enabled: true,
            intervalMinutes: 720,
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(result).toEqual({
            status: "success",
            message: "Missing-content search enabled every 720 minutes.",
        });
    });
});

describe("setDefaultDownloadPathAction", () => {
    it("does not let a regular user change the instance default download path", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "user" } } as never);
        const form = new FormData();

        form.set("pathId", "4744741d-82b9-4b47-9f91-489e1d96ce02");

        const result = await setDefaultDownloadPathAction(
            initialDefaultDownloadPathActionState,
            form,
        );

        expect(result).toEqual({
            status: "error",
            message: "Only an administrator can manage library folders.",
        });
        expect(setDefaultDownloadPathMock).not.toHaveBeenCalled();
    });
});

describe("updateMetadataRefreshScheduleAction", () => {
    it("does not let a regular user change the instance metadata-refresh schedule", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "user" } } as never);
        const form = new FormData();

        form.set("enabled", "on");
        form.set("intervalMinutes", "720");

        const result = await updateMetadataRefreshScheduleAction(
            initialMetadataRefreshScheduleActionState,
            form,
        );

        expect(result).toEqual({
            status: "error",
            message: "Only an administrator can manage instance automation.",
        });
        expect(configureMetadataRefreshScheduleMock).not.toHaveBeenCalled();
    });
});

describe("updateLibraryPathAction", () => {
    function validForm() {
        const form = new FormData();

        form.set("pathId", "path1");
        form.set("mediaType", "tv");
        form.set("libraryName", "TV Shows");
        form.set("path", "E:/Plex Media/TV Shows");
        form.set("label", "TV root");
        form.set("status", "active");

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await updateLibraryPathAction(
            initialLibraryPathMutationActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "You need to sign in again." });
        expect(updateLibraryPathMock).not.toHaveBeenCalled();
    });

    it("validates submitted status", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        const form = validForm();

        form.set("status", "archived");

        const result = await updateLibraryPathAction(initialLibraryPathMutationActionState, form);

        expect(result.status).toBe("error");
        expect(updateLibraryPathMock).not.toHaveBeenCalled();
    });

    it("maps command errors to friendly messages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        updateLibraryPathMock.mockRejectedValue(
            new UpdateLibraryPathCommandError(
                "That folder is already attached to your library.",
                "path_already_exists",
            ),
        );

        const result = await updateLibraryPathAction(
            initialLibraryPathMutationActionState,
            validForm(),
        );

        expect(result).toEqual({
            status: "error",
            message: "That folder is already attached to your library.",
        });
    });

    it("updates the path and revalidates the library page", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        updateLibraryPathMock.mockResolvedValue(undefined as never);

        const result = await updateLibraryPathAction(
            initialLibraryPathMutationActionState,
            validForm(),
        );

        expect(updateLibraryPathMock).toHaveBeenCalledWith("u1", {
            pathId: "path1",
            mediaType: "tv",
            libraryName: "TV Shows",
            path: "E:/Plex Media/TV Shows",
            label: "TV root",
            status: "active",
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(result).toEqual({ status: "success", message: "Library folder updated." });
    });
});

describe("removeLibraryPathAction", () => {
    function validForm() {
        const form = new FormData();

        form.set("pathId", "path1");

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await removeLibraryPathAction(
            initialLibraryPathMutationActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "You need to sign in again." });
        expect(removeLibraryPathMock).not.toHaveBeenCalled();
    });

    it("maps command errors to friendly messages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        removeLibraryPathMock.mockRejectedValue(
            new RemoveLibraryPathCommandError("Library folder was not found.", "path_not_found"),
        );

        const result = await removeLibraryPathAction(
            initialLibraryPathMutationActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "Library folder was not found." });
    });

    it("removes the path and revalidates the library page", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        removeLibraryPathMock.mockResolvedValue(undefined as never);

        const result = await removeLibraryPathAction(
            initialLibraryPathMutationActionState,
            validForm(),
        );

        expect(removeLibraryPathMock).toHaveBeenCalledWith("u1", { pathId: "path1" });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(result).toEqual({ status: "success", message: "Library folder removed." });
    });
});

describe("updateMediaTitlePreferencesAction", () => {
    const titleId = "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9";

    function validForm() {
        const form = new FormData();

        form.set("titleId", titleId);
        form.set("qualityProfile", "uhd-2160p");
        form.set("monitored", "on");

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await updateMediaTitlePreferencesAction(
            initialMediaTitlePreferenceActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "You need to sign in again." });
        expect(updateMediaTitlePreferencesMock).not.toHaveBeenCalled();
    });

    it("validates submitted quality profiles", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        const form = validForm();

        form.set("qualityProfile", "dvd");

        const result = await updateMediaTitlePreferencesAction(
            initialMediaTitlePreferenceActionState,
            form,
        );

        expect(result.status).toBe("error");
        expect(updateMediaTitlePreferencesMock).not.toHaveBeenCalled();
    });

    it("maps command errors to friendly messages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        updateMediaTitlePreferencesMock.mockRejectedValue(
            new UpdateMediaTitlePreferencesCommandError(
                "Library title was not found.",
                "title_not_found",
            ),
        );

        const result = await updateMediaTitlePreferencesAction(
            initialMediaTitlePreferenceActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "Library title was not found." });
    });

    it("updates preferences and revalidates the matching library page", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        updateMediaTitlePreferencesMock.mockResolvedValue({ mediaType: "tv" } as never);

        const result = await updateMediaTitlePreferencesAction(
            initialMediaTitlePreferenceActionState,
            validForm(),
        );

        expect(updateMediaTitlePreferencesMock).toHaveBeenCalledWith("u1", {
            titleId,
            monitored: true,
            qualityProfile: "uhd-2160p",
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
        expect(result).toEqual({ status: "success", message: "Title preferences updated." });
    });
});

describe("updateLibraryMonitoringAction", () => {
    function validForm(monitored: boolean) {
        const form = new FormData();

        form.set("mediaType", "all");
        form.set("monitored", String(monitored));

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await updateLibraryMonitoringAction(
            initialLibraryMonitoringActionState,
            validForm(false),
        );

        expect(result).toEqual({ status: "error", message: "You need to sign in again." });
        expect(updateLibraryMonitoringMock).not.toHaveBeenCalled();
    });

    it("validates the monitoring scope", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        const form = validForm(false);

        form.set("mediaType", "music");

        const result = await updateLibraryMonitoringAction(
            initialLibraryMonitoringActionState,
            form,
        );

        expect(result.status).toBe("error");
        expect(updateLibraryMonitoringMock).not.toHaveBeenCalled();
    });

    it("updates all monitoring without triggering a release search", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        updateLibraryMonitoringMock.mockResolvedValue({
            monitored: false,
            titleCount: 4,
            seasonCount: 2,
            episodeCount: 8,
        });

        const result = await updateLibraryMonitoringAction(
            initialLibraryMonitoringActionState,
            validForm(false),
        );

        expect(updateLibraryMonitoringMock).toHaveBeenCalledWith("u1", {
            mediaType: "all",
            monitored: false,
        });
        expect(searchLibraryItemMock).not.toHaveBeenCalled();
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(revalidateMock).toHaveBeenCalledWith("/library/movies");
        expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
        expect(result).toEqual({ status: "success", message: "Monitoring disabled for 4 titles." });
    });
});

describe("searchLibraryItemReleasesAction", () => {
    const titleId = "f9cf3e46-c202-46f4-97aa-dd37be8f7766";
    const episodeId = "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08";
    const targetLibraryPathId = "0ca60f81-387b-47d0-a9d2-571e8dd7a44d";

    function validForm() {
        const form = new FormData();

        form.set("titleId", titleId);
        form.set("targetLibraryPathId", targetLibraryPathId);

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            validForm(),
        );

        expect(result.status).toBe("error");
        expect(searchLibraryItemMock).not.toHaveBeenCalled();
    });

    it("validates submitted title ids", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        const form = validForm();

        form.set("titleId", "not-a-title");

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            form,
        );

        expect(result.status).toBe("error");
        expect(searchLibraryItemMock).not.toHaveBeenCalled();
    });

    it("queues a matching title release and revalidates library pages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        searchLibraryItemMock.mockResolvedValue({
            item: {
                title: { id: titleId, mediaType: "movie", qualityProfile: "hd-1080p" },
                episode: null,
            },
            releaseSearch: { searchRun: { id: "run1", status: "succeeded" } },
            queuedDownload: {
                queued: true,
                download: { downloadRequest: { id: "download1" } },
            },
        } as never);

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            validForm(),
        );

        expect(searchLibraryItemMock).toHaveBeenCalledWith("u1", {
            titleId,
            episodeId: undefined,
            targetLibraryPathId,
            excludedResultIds: [],
            excludedReleaseKeys: [],
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(revalidateMock).toHaveBeenCalledWith("/library/movies");
        expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
        expect(result).toEqual({
            status: "success",
            message: "Queued a matching title release for download.",
            downloadRequestId: "download1",
        });
    });

    it("queues a matching episode release and revalidates TV library pages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        const form = validForm();

        form.set("episodeId", episodeId);
        searchLibraryItemMock.mockResolvedValue({
            item: {
                title: { id: titleId, mediaType: "tv", qualityProfile: "hd-1080p" },
                episode: { id: episodeId },
            },
            releaseSearch: { searchRun: { id: "run1", status: "succeeded" } },
            queuedDownload: {
                queued: true,
                download: { downloadRequest: { id: "download2" } },
            },
        } as never);

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            form,
        );

        expect(searchLibraryItemMock).toHaveBeenCalledWith("u1", {
            titleId,
            episodeId,
            targetLibraryPathId,
            excludedResultIds: [],
            excludedReleaseKeys: [],
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
        // Per-title routes were removed; dialog content is rendered from the list page.
        expect(revalidateMock).not.toHaveBeenCalledWith(`/library/tv/${titleId}`);
        expect(result).toMatchObject({
            status: "success",
            message: "Queued a matching episode release for download.",
            downloadRequestId: "download2",
        });
    });

    it("uses an eligible episode's open season plan and returns its queued request", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        const form = validForm();

        form.set("episodeId", episodeId);
        retryOpenSeasonEpisodeMock.mockResolvedValue({
            handled: true,
            status: "queued",
            message: "S01E02 queued as an individual episode.",
            downloadRequestId: "planned-download",
        });

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            form,
        );

        expect(retryOpenSeasonEpisodeMock).toHaveBeenCalledWith({
            userId: "u1",
            episodeId,
        });
        expect(searchLibraryItemMock).not.toHaveBeenCalled();
        expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
        expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
        expect(result).toEqual({
            status: "success",
            message: "S01E02 queued as an individual episode.",
            downloadRequestId: "planned-download",
        });
    });

    it("does not create an independent episode request while the season plan is busy", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        const form = validForm();

        form.set("episodeId", episodeId);
        retryOpenSeasonEpisodeMock.mockResolvedValue({
            handled: true,
            status: "busy",
            message: "This season plan is already working.",
        });

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            form,
        );

        expect(searchLibraryItemMock).not.toHaveBeenCalled();
        expect(result).toEqual({
            status: "warning",
            message: "This season plan is already working.",
            downloadRequestId: null,
        });
    });

    it("reports when a season search falls back to individual episode downloads", async () => {
        const seasonId = "54186288-7b5b-47d3-8a4b-58126b78b037";

        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        const form = validForm();

        form.set("seasonId", seasonId);
        findTvSeasonMock.mockResolvedValue({
            title: { id: titleId, title: "The Show", mediaType: "tv" },
            season: { id: seasonId, seasonNumber: 1 },
        } as never);
        createSeasonFulfillmentMock.mockResolvedValue({ id: "fulfillment-1" } as never);
        attemptSeasonPackMock.mockResolvedValue({
            fulfillment: {
                id: "fulfillment-1",
                status: "active",
                strategy: "episodes",
            },
            releaseSearch: {
                queuedDownload: {
                    queued: false,
                    reason: "no_matching_release",
                    message: "No complete-season release matched.",
                },
            },
            fallback: {
                fulfillmentId: "fulfillment-1",
                queuedCount: 2,
                activeCount: 1,
                message: "Using individual episodes: 3 active.",
            },
        } as never);

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            form,
        );

        expect(findTvSeasonMock).toHaveBeenCalledWith("u1", seasonId);
        expect(createSeasonFulfillmentMock).toHaveBeenCalledWith({
            userId: "u1",
            mediaTitleId: titleId,
            seasonId,
            requestedTitle: "The Show S01",
            targetLibraryPathId,
        });
        expect(attemptSeasonPackMock).toHaveBeenCalledWith("u1", "fulfillment-1");
        expect(searchLibraryItemMock).not.toHaveBeenCalled();
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
        expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
        expect(result).toEqual({
            status: "success",
            message:
                "No usable season pack was found, so Nooklet switched to individual episodes. Using individual episodes: 3 active.",
            downloadRequestId: null,
        });
    });

    // `no_matching_release` covers both "the indexers returned nothing" and
    // "releases came back but none survived filtering". Blaming the quality
    // profile for the first sent people tuning a profile that was never involved.
    it("says the indexers returned nothing when no releases came back at all", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        searchLibraryItemMock.mockResolvedValue({
            item: {
                title: { id: titleId, mediaType: "movie", qualityProfile: "uhd-2160p" },
                episode: null,
            },
            releaseSearch: { searchRun: { id: "run1", status: "succeeded" }, results: [] },
            queuedDownload: { queued: false, reason: "no_matching_release" },
        } as never);

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            validForm(),
        );

        expect(result).toEqual({
            status: "warning",
            message: "Search finished, but the indexers returned no releases for this item.",
            downloadRequestId: null,
        });
    });

    it("blames the quality profile only when releases were actually found", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        searchLibraryItemMock.mockResolvedValue({
            item: {
                title: { id: titleId, mediaType: "movie", qualityProfile: "uhd-2160p" },
                episode: null,
            },
            releaseSearch: {
                searchRun: { id: "run1", status: "succeeded" },
                results: [{ id: "r1" }, { id: "r2" }, { id: "r3" }],
            },
            queuedDownload: { queued: false, reason: "no_matching_release" },
        } as never);

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            validForm(),
        );

        expect(result).toMatchObject({
            status: "warning",
            message: "Search finished: 3 releases found, but none matched UHD 2160p for this item.",
        });
    });

    it("explains that an unaired episode has nothing posted yet", async () => {
        vi.useFakeTimers();

        try {
            vi.setSystemTime(new Date(2026, 7, 5, 12));
            authMock.mockResolvedValue({ user: { id: "u1" } } as never);
            searchLibraryItemMock.mockResolvedValue({
                item: {
                    title: { id: titleId, mediaType: "tv", qualityProfile: "hd-1080p" },
                    episode: { id: "e3", airDate: "2026-08-06" },
                },
                releaseSearch: { searchRun: { id: "run1", status: "succeeded" }, results: [] },
                queuedDownload: { queued: false, reason: "no_matching_release" },
            } as never);

            const result = await searchLibraryItemReleasesAction(
                initialLibraryItemSearchActionState,
                validForm(),
            );

            expect(result.status).toBe("warning");
            expect(result.message).toContain("has not aired yet");
            expect(result.message).toContain("August 6, 2026");
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not claim an already-aired episode is unaired", async () => {
        vi.useFakeTimers();

        try {
            vi.setSystemTime(new Date(2026, 7, 5, 12));
            authMock.mockResolvedValue({ user: { id: "u1" } } as never);
            searchLibraryItemMock.mockResolvedValue({
                item: {
                    title: { id: titleId, mediaType: "tv", qualityProfile: "hd-1080p" },
                    episode: { id: "e1", airDate: "2026-08-05" },
                },
                releaseSearch: { searchRun: { id: "run1", status: "succeeded" }, results: [] },
                queuedDownload: { queued: false, reason: "no_matching_release" },
            } as never);

            const result = await searchLibraryItemReleasesAction(
                initialLibraryItemSearchActionState,
                validForm(),
            );

            expect(result.message).toBe(
                "Search finished, but the indexers returned no releases for this item.",
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("maps workflow errors to the action state", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        searchLibraryItemMock.mockRejectedValue(
            new SearchLibraryItemReleasesWorkflowError(
                "title_not_found",
                "Library title was not found.",
            ),
        );

        const result = await searchLibraryItemReleasesAction(
            initialLibraryItemSearchActionState,
            validForm(),
        );

        expect(result).toEqual({
            status: "error",
            message: "Library title was not found.",
            downloadRequestId: null,
        });
    });
});

describe("removeMediaTitleAction", () => {
    const titleId = "f9cf3e46-c202-46f4-97aa-dd37be8f7766";

    function validForm(deleteFiles = false, retireActiveWork = false) {
        const form = new FormData();

        form.set("titleId", titleId);

        if (deleteFiles) {
            form.set("deleteFiles", "on");
        }

        if (retireActiveWork) {
            form.set("retireActiveWork", "on");
        }

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await removeMediaTitleAction(
            initialRemoveMediaTitleActionState,
            validForm(),
        );

        expect(result.status).toBe("error");
        expect(removeMediaTitleMock).not.toHaveBeenCalled();
    });

    it("validates submitted title ids", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        const form = validForm();

        form.set("titleId", "bad-title");

        const result = await removeMediaTitleAction(initialRemoveMediaTitleActionState, form);

        expect(result.status).toBe("error");
        expect(removeMediaTitleMock).not.toHaveBeenCalled();
    });

    it("maps command errors to friendly messages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        removeMediaTitleMock.mockRejectedValue(
            new RemoveMediaTitleCommandError("Library title was not found.", "title_not_found"),
        );

        const result = await removeMediaTitleAction(
            initialRemoveMediaTitleActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "Library title was not found." });
    });

    it("points blocked removal to the new Activity cancellation control", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        removeMediaTitleMock.mockRejectedValue(
            new RemoveMediaTitleCommandError(
                "This title still has an active season plan, download, or import.",
                "active_download",
            ),
        );

        const result = await removeMediaTitleAction(
            initialRemoveMediaTitleActionState,
            validForm(),
        );

        expect(result).toEqual({
            status: "error",
            message:
                "This title still has active season recovery or downloader work. Select the safe stop-and-remove option below and confirm again, or manage the work in Activity.",
            action: "open_activity",
        });
    });

    it("removes a title and revalidates the matching library pages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        removeMediaTitleMock.mockResolvedValue({ id: titleId, mediaType: "tv" } as never);

        const result = await removeMediaTitleAction(
            initialRemoveMediaTitleActionState,
            validForm(),
        );

        expect(removeMediaTitleMock).toHaveBeenCalledWith("u1", { titleId });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
        // Per-title routes were removed; dialog content is rendered from the list page.
        expect(revalidateMock).not.toHaveBeenCalledWith(`/library/tv/${titleId}`);
        expect(result).toEqual({ status: "success", message: "Library title removed." });
    });

    it("requires an administrator before queueing deletion from disk", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "user" } } as never);

        const result = await removeMediaTitleAction(
            initialRemoveMediaTitleActionState,
            validForm(true),
        );

        expect(result).toEqual({
            status: "error",
            message: "Only an administrator can delete media files from disk.",
        });
        expect(findMediaTitleMock).not.toHaveBeenCalled();
        expect(createImmediateJobMock).not.toHaveBeenCalled();
    });

    it("checks DB ownership and active associations before queueing file deletion", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        findMediaTitleMock.mockResolvedValue({ id: titleId, mediaType: "tv" } as never);
        hasActiveTitleDownloadMock.mockResolvedValue(true);

        const result = await removeMediaTitleAction(
            initialRemoveMediaTitleActionState,
            validForm(true),
        );

        expect(findMediaTitleMock).toHaveBeenCalledWith("u1", titleId);
        expect(hasActiveTitleDownloadMock).toHaveBeenCalledWith("u1", titleId);
        expect(createImmediateJobMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({ status: "error", action: "open_activity" });
    });

    it("queues file deletion without importing the filesystem workflow into the web action", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);
        findMediaTitleMock.mockResolvedValue({ id: titleId, mediaType: "tv" } as never);
        hasActiveTitleDownloadMock.mockResolvedValue(false);
        createImmediateJobMock.mockResolvedValue({ id: "job-delete" } as never);

        const result = await removeMediaTitleAction(
            initialRemoveMediaTitleActionState,
            validForm(true),
        );

        expect(removeMediaTitleMock).not.toHaveBeenCalled();
        expect(createImmediateJobMock).toHaveBeenCalledWith({
            userId: "u1",
            jobType: "media-title-delete",
            targetType: "media-title",
            targetKey: titleId,
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
        expect(result).toEqual({
            status: "success",
            message:
                "Title removal queued. Nooklet will delete its files in the isolated background worker.",
            action: "queued_removal",
        });
    });

    it("persists explicit stop-then-remove intent without touching the downloader in the web action", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "user" } } as never);
        findMediaTitleMock.mockResolvedValue({ id: titleId, mediaType: "tv" } as never);
        createImmediateJobMock.mockResolvedValue({ id: "job-retire" } as never);

        const result = await removeMediaTitleAction(
            initialRemoveMediaTitleActionState,
            validForm(false, true),
        );

        expect(findMediaTitleMock).toHaveBeenCalledWith("u1", titleId);
        expect(hasActiveTitleDownloadMock).not.toHaveBeenCalled();
        expect(removeMediaTitleMock).not.toHaveBeenCalled();
        expect(createImmediateJobMock).toHaveBeenCalledWith({
            userId: "u1",
            jobType: "media-title-delete",
            targetType: "media-title-preserve-files",
            targetKey: titleId,
        });
        expect(result).toEqual({
            status: "success",
            message:
                "Safe removal queued. Nooklet will stop and verify active downloads, then remove the title. Imported media files will stay on disk.",
            action: "queued_removal",
        });
    });

    it("rejects conflicting preserve-files and delete-files intents", async () => {
        authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);

        const result = await removeMediaTitleAction(
            initialRemoveMediaTitleActionState,
            validForm(true, true),
        );

        expect(result).toEqual({
            status: "error",
            message: "Choose either a safe stop-and-remove or permanent file deletion, not both.",
        });
        expect(createImmediateJobMock).not.toHaveBeenCalled();
    });
});

describe("updateTvEpisodeMonitoringAction", () => {
    const episodeId = "episode1";

    function validForm() {
        const form = new FormData();

        form.set("episodeId", episodeId);
        form.set("monitored", "on");

        return form;
    }

    it("returns sign-in error when there is no session", async () => {
        authMock.mockResolvedValue(null as never);

        const result = await updateTvEpisodeMonitoringAction(
            initialTvEpisodeMonitoringActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "You need to sign in again." });
        expect(updateTvEpisodeMonitoringMock).not.toHaveBeenCalled();
    });

    it("validates submitted episode ids", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        const form = validForm();

        form.set("episodeId", "");

        const result = await updateTvEpisodeMonitoringAction(
            initialTvEpisodeMonitoringActionState,
            form,
        );

        expect(result.status).toBe("error");
        expect(updateTvEpisodeMonitoringMock).not.toHaveBeenCalled();
    });

    it("maps command errors to friendly messages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        updateTvEpisodeMonitoringMock.mockRejectedValue(
            new UpdateTvEpisodeMonitoringCommandError(
                "Episode was not found.",
                "episode_not_found",
            ),
        );

        const result = await updateTvEpisodeMonitoringAction(
            initialTvEpisodeMonitoringActionState,
            validForm(),
        );

        expect(result).toEqual({ status: "error", message: "Episode was not found." });
    });

    it("updates monitoring and revalidates TV library pages", async () => {
        authMock.mockResolvedValue({ user: { id: "u1" } } as never);
        updateTvEpisodeMonitoringMock.mockResolvedValue({ title: { id: "title1" } } as never);

        const result = await updateTvEpisodeMonitoringAction(
            initialTvEpisodeMonitoringActionState,
            validForm(),
        );

        expect(updateTvEpisodeMonitoringMock).toHaveBeenCalledWith("u1", {
            episodeId,
            monitored: true,
        });
        expect(revalidateMock).toHaveBeenCalledWith("/library");
        expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
        // Per-title routes were removed; dialog content is rendered from the list page.
        expect(revalidateMock).not.toHaveBeenCalledWith("/library/tv/title1");
        expect(result).toEqual({ status: "success", message: "Episode monitoring updated." });
    });
});
