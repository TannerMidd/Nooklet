import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
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
vi.mock("@/modules/media-library/workflows/delete-media-title-with-files", () => {
  class DeleteMediaTitleWithFilesError extends Error {
    constructor(
      message: string,
      public readonly code: "title_not_found",
    ) {
      super(message);
      this.name = "DeleteMediaTitleWithFilesError";
    }
  }

  return {
    deleteMediaTitleWithFilesWorkflow: vi.fn(),
    DeleteMediaTitleWithFilesError,
  };
});
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
vi.mock("@/modules/media-library/workflows/scan-library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/media-library/workflows/scan-library")>();
  return {
    ...actual,
    scanMediaLibraryWorkflow: vi.fn(),
  };
});
vi.mock("@/modules/media-library/workflows/configure-library-scan-schedule", () => ({
  configureLibraryScanSchedule: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/configure-missing-search-schedule", () => ({
  configureMissingSearchSchedule: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-library-item-releases", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/media-library/workflows/search-library-item-releases")>();
  return {
    ...actual,
    searchLibraryItemReleasesWorkflow: vi.fn(),
  };
});

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
  deleteMediaTitleWithFilesWorkflow,
  DeleteMediaTitleWithFilesError,
} from "@/modules/media-library/workflows/delete-media-title-with-files";
import {
  updateLibraryPathCommand,
  UpdateLibraryPathCommandError,
} from "@/modules/media-library/commands/update-library-path";
import {
  updateMediaTitlePreferencesCommand,
  UpdateMediaTitlePreferencesCommandError,
} from "@/modules/media-library/commands/update-media-title-preferences";
import {
  updateMediaLibraryMonitoringCommand,
} from "@/modules/media-library/commands/update-media-library-monitoring";
import {
  updateTvEpisodeMonitoringCommand,
  UpdateTvEpisodeMonitoringCommandError,
} from "@/modules/media-library/commands/update-tv-episode-monitoring";
import {
  scanMediaLibraryWorkflow,
  ScanMediaLibraryWorkflowError,
} from "@/modules/media-library/workflows/scan-library";
import {
  configureLibraryScanSchedule,
} from "@/modules/media-library/workflows/configure-library-scan-schedule";
import {
  configureMissingSearchSchedule,
} from "@/modules/media-library/workflows/configure-missing-search-schedule";
import {
  searchLibraryItemReleasesWorkflow,
  SearchLibraryItemReleasesWorkflowError,
} from "@/modules/media-library/workflows/search-library-item-releases";

import {
  addLibraryPathAction,
  removeMediaTitleAction,
  removeLibraryPathAction,
  scanLibraryAction,
  searchLibraryItemReleasesAction,
  updateLibraryPathAction,
  updateLibraryMonitoringAction,
  updateLibraryScanScheduleAction,
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
  initialMediaTitlePreferenceActionState,
  initialMissingSearchScheduleActionState,
  initialRemoveMediaTitleActionState,
  initialTvEpisodeMonitoringActionState,
} from "./action-state";

const authMock = vi.mocked(auth);
const addLibraryPathMock = vi.mocked(addLibraryPathCommand);
const updateLibraryPathMock = vi.mocked(updateLibraryPathCommand);
const updateLibraryMonitoringMock = vi.mocked(updateMediaLibraryMonitoringCommand);
const updateMediaTitlePreferencesMock = vi.mocked(updateMediaTitlePreferencesCommand);
const updateTvEpisodeMonitoringMock = vi.mocked(updateTvEpisodeMonitoringCommand);
const removeLibraryPathMock = vi.mocked(removeLibraryPathCommand);
const removeMediaTitleMock = vi.mocked(deleteMediaTitleWithFilesWorkflow);
const scanLibraryMock = vi.mocked(scanMediaLibraryWorkflow);
const configureLibraryScanScheduleMock = vi.mocked(configureLibraryScanSchedule);
const configureMissingSearchScheduleMock = vi.mocked(configureMissingSearchSchedule);
const searchLibraryItemMock = vi.mocked(searchLibraryItemReleasesWorkflow);
const revalidateMock = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
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

  it("validates submitted media type", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("mediaType", "music");

    const result = await addLibraryPathAction(initialLibraryPathActionState, form);

    expect(result.status).toBe("error");
    expect(addLibraryPathMock).not.toHaveBeenCalled();
  });

  it("maps command errors to friendly messages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    addLibraryPathMock.mockRejectedValue(
      new LibraryPathCommandError("That folder is already attached to your library.", "path_already_exists"),
    );

    const result = await addLibraryPathAction(initialLibraryPathActionState, validForm());

    expect(result).toEqual({
      status: "error",
      message: "That folder is already attached to your library.",
    });
  });

  it("adds the path and revalidates the library page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
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
    expect(scanLibraryMock).not.toHaveBeenCalled();
  });

  it("maps scan workflow errors to friendly messages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    scanLibraryMock.mockRejectedValue(
      new ScanMediaLibraryWorkflowError("no_paths", "Attach a library folder before scanning."),
    );

    const result = await scanLibraryAction();

    expect(result).toEqual({ status: "error", message: "Attach a library folder before scanning." });
  });

  it("scans the library and revalidates the library page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    scanLibraryMock.mockResolvedValue({ discoveredFileCount: 2, matchedTitleCount: 1 } as never);

    const result = await scanLibraryAction();

    expect(scanLibraryMock).toHaveBeenCalledWith("u1", {});
    expect(revalidateMock).toHaveBeenCalledWith("/library");
    expect(result).toEqual({ status: "success", message: "Scan finished: 2 files, 1 title." });
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

    const result = await updateLibraryScanScheduleAction(initialLibraryScanScheduleActionState, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(configureLibraryScanScheduleMock).not.toHaveBeenCalled();
  });

  it("validates interval minutes", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("intervalMinutes", "5");

    const result = await updateLibraryScanScheduleAction(initialLibraryScanScheduleActionState, form);

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.intervalMinutes).toBe("Schedule at least every 15 minutes.");
    expect(configureLibraryScanScheduleMock).not.toHaveBeenCalled();
  });

  it("saves the schedule and revalidates the library page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    configureLibraryScanScheduleMock.mockResolvedValue({
      ok: true,
      message: "Library scan enabled every 120 minutes.",
    });

    const result = await updateLibraryScanScheduleAction(initialLibraryScanScheduleActionState, validForm());

    expect(configureLibraryScanScheduleMock).toHaveBeenCalledWith("u1", {
      enabled: true,
      intervalMinutes: 120,
    });
    expect(revalidateMock).toHaveBeenCalledWith("/library");
    expect(result).toEqual({ status: "success", message: "Library scan enabled every 120 minutes." });
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

    const result = await updateMissingSearchScheduleAction(initialMissingSearchScheduleActionState, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(configureMissingSearchScheduleMock).not.toHaveBeenCalled();
  });

  it("validates interval minutes", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("intervalMinutes", "5");

    const result = await updateMissingSearchScheduleAction(initialMissingSearchScheduleActionState, form);

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.intervalMinutes).toBe("Schedule at least every 15 minutes.");
    expect(configureMissingSearchScheduleMock).not.toHaveBeenCalled();
  });

  it("saves the schedule and revalidates the library page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    configureMissingSearchScheduleMock.mockResolvedValue({
      ok: true,
      message: "Missing-content search enabled every 720 minutes.",
    });

    const result = await updateMissingSearchScheduleAction(initialMissingSearchScheduleActionState, validForm());

    expect(configureMissingSearchScheduleMock).toHaveBeenCalledWith("u1", {
      enabled: true,
      intervalMinutes: 720,
    });
    expect(revalidateMock).toHaveBeenCalledWith("/library");
    expect(result).toEqual({ status: "success", message: "Missing-content search enabled every 720 minutes." });
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

    const result = await updateLibraryPathAction(initialLibraryPathMutationActionState, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(updateLibraryPathMock).not.toHaveBeenCalled();
  });

  it("validates submitted status", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("status", "archived");

    const result = await updateLibraryPathAction(initialLibraryPathMutationActionState, form);

    expect(result.status).toBe("error");
    expect(updateLibraryPathMock).not.toHaveBeenCalled();
  });

  it("maps command errors to friendly messages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateLibraryPathMock.mockRejectedValue(
      new UpdateLibraryPathCommandError("That folder is already attached to your library.", "path_already_exists"),
    );

    const result = await updateLibraryPathAction(initialLibraryPathMutationActionState, validForm());

    expect(result).toEqual({ status: "error", message: "That folder is already attached to your library." });
  });

  it("updates the path and revalidates the library page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateLibraryPathMock.mockResolvedValue(undefined as never);

    const result = await updateLibraryPathAction(initialLibraryPathMutationActionState, validForm());

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

    const result = await removeLibraryPathAction(initialLibraryPathMutationActionState, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(removeLibraryPathMock).not.toHaveBeenCalled();
  });

  it("maps command errors to friendly messages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    removeLibraryPathMock.mockRejectedValue(
      new RemoveLibraryPathCommandError("Library folder was not found.", "path_not_found"),
    );

    const result = await removeLibraryPathAction(initialLibraryPathMutationActionState, validForm());

    expect(result).toEqual({ status: "error", message: "Library folder was not found." });
  });

  it("removes the path and revalidates the library page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    removeLibraryPathMock.mockResolvedValue(undefined as never);

    const result = await removeLibraryPathAction(initialLibraryPathMutationActionState, validForm());

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

    const result = await updateMediaTitlePreferencesAction(initialMediaTitlePreferenceActionState, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(updateMediaTitlePreferencesMock).not.toHaveBeenCalled();
  });

  it("validates submitted quality profiles", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("qualityProfile", "dvd");

    const result = await updateMediaTitlePreferencesAction(initialMediaTitlePreferenceActionState, form);

    expect(result.status).toBe("error");
    expect(updateMediaTitlePreferencesMock).not.toHaveBeenCalled();
  });

  it("maps command errors to friendly messages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateMediaTitlePreferencesMock.mockRejectedValue(
      new UpdateMediaTitlePreferencesCommandError("Library title was not found.", "title_not_found"),
    );

    const result = await updateMediaTitlePreferencesAction(initialMediaTitlePreferenceActionState, validForm());

    expect(result).toEqual({ status: "error", message: "Library title was not found." });
  });

  it("updates preferences and revalidates the matching library page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateMediaTitlePreferencesMock.mockResolvedValue({ mediaType: "tv" } as never);

    const result = await updateMediaTitlePreferencesAction(initialMediaTitlePreferenceActionState, validForm());

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

    const result = await updateLibraryMonitoringAction(initialLibraryMonitoringActionState, validForm(false));

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(updateLibraryMonitoringMock).not.toHaveBeenCalled();
  });

  it("validates the monitoring scope", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm(false);
    form.set("mediaType", "music");

    const result = await updateLibraryMonitoringAction(initialLibraryMonitoringActionState, form);

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

    const result = await updateLibraryMonitoringAction(initialLibraryMonitoringActionState, validForm(false));

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

    const result = await searchLibraryItemReleasesAction(initialLibraryItemSearchActionState, validForm());

    expect(result.status).toBe("error");
    expect(searchLibraryItemMock).not.toHaveBeenCalled();
  });

  it("validates submitted title ids", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("titleId", "not-a-title");

    const result = await searchLibraryItemReleasesAction(initialLibraryItemSearchActionState, form);

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

    const result = await searchLibraryItemReleasesAction(initialLibraryItemSearchActionState, validForm());

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

    const result = await searchLibraryItemReleasesAction(initialLibraryItemSearchActionState, form);

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

  it("reports no matching releases without treating the search as a server error", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    searchLibraryItemMock.mockResolvedValue({
      item: {
        title: { id: titleId, mediaType: "movie", qualityProfile: "uhd-2160p" },
        episode: null,
      },
      releaseSearch: { searchRun: { id: "run1", status: "succeeded" } },
      queuedDownload: { queued: false, reason: "no_matching_release" },
    } as never);

    const result = await searchLibraryItemReleasesAction(initialLibraryItemSearchActionState, validForm());

    expect(result).toEqual({
      status: "success",
      message: "Search finished, but no releases matched UHD 2160p.",
      downloadRequestId: null,
    });
  });

  it("maps workflow errors to the action state", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    searchLibraryItemMock.mockRejectedValue(
      new SearchLibraryItemReleasesWorkflowError("title_not_found", "Library title was not found."),
    );

    const result = await searchLibraryItemReleasesAction(initialLibraryItemSearchActionState, validForm());

    expect(result).toEqual({
      status: "error",
      message: "Library title was not found.",
      downloadRequestId: null,
    });
  });
});

describe("removeMediaTitleAction", () => {
  const titleId = "f9cf3e46-c202-46f4-97aa-dd37be8f7766";

  function validForm() {
    const form = new FormData();
    form.set("titleId", titleId);
    return form;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await removeMediaTitleAction(initialRemoveMediaTitleActionState, validForm());

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
      new DeleteMediaTitleWithFilesError("Library title was not found.", "title_not_found"),
    );

    const result = await removeMediaTitleAction(initialRemoveMediaTitleActionState, validForm());

    expect(result).toEqual({ status: "error", message: "Library title was not found." });
  });

  it("removes a title and revalidates the matching library pages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    removeMediaTitleMock.mockResolvedValue({
      removedTitle: { id: titleId, mediaType: "tv" },
      fileOutcomes: [],
      filesRequestedForDeletion: false,
    } as never);

    const result = await removeMediaTitleAction(initialRemoveMediaTitleActionState, validForm());

    expect(removeMediaTitleMock).toHaveBeenCalledWith("u1", { titleId, deleteFiles: false });
    expect(revalidateMock).toHaveBeenCalledWith("/library");
    expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
    // Per-title routes were removed; dialog content is rendered from the list page.
    expect(revalidateMock).not.toHaveBeenCalledWith(`/library/tv/${titleId}`);
    expect(result).toEqual({ status: "success", message: "Library title removed." });
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

    const result = await updateTvEpisodeMonitoringAction(initialTvEpisodeMonitoringActionState, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(updateTvEpisodeMonitoringMock).not.toHaveBeenCalled();
  });

  it("validates submitted episode ids", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("episodeId", "");

    const result = await updateTvEpisodeMonitoringAction(initialTvEpisodeMonitoringActionState, form);

    expect(result.status).toBe("error");
    expect(updateTvEpisodeMonitoringMock).not.toHaveBeenCalled();
  });

  it("maps command errors to friendly messages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateTvEpisodeMonitoringMock.mockRejectedValue(
      new UpdateTvEpisodeMonitoringCommandError("Episode was not found.", "episode_not_found"),
    );

    const result = await updateTvEpisodeMonitoringAction(initialTvEpisodeMonitoringActionState, validForm());

    expect(result).toEqual({ status: "error", message: "Episode was not found." });
  });

  it("updates monitoring and revalidates TV library pages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateTvEpisodeMonitoringMock.mockResolvedValue({ title: { id: "title1" } } as never);

    const result = await updateTvEpisodeMonitoringAction(initialTvEpisodeMonitoringActionState, validForm());

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
