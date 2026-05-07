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
vi.mock("@/modules/media-library/workflows/scan-library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/media-library/workflows/scan-library")>();
  return {
    ...actual,
    scanMediaLibraryWorkflow: vi.fn(),
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
  updateLibraryPathCommand,
  UpdateLibraryPathCommandError,
} from "@/modules/media-library/commands/update-library-path";
import {
  updateMediaTitlePreferencesCommand,
  UpdateMediaTitlePreferencesCommandError,
} from "@/modules/media-library/commands/update-media-title-preferences";
import {
  scanMediaLibraryWorkflow,
  ScanMediaLibraryWorkflowError,
} from "@/modules/media-library/workflows/scan-library";

import {
  addLibraryPathAction,
  removeLibraryPathAction,
  scanLibraryAction,
  updateLibraryPathAction,
  updateMediaTitlePreferencesAction,
} from "./actions";
import {
  initialLibraryPathActionState,
  initialLibraryPathMutationActionState,
  initialMediaTitlePreferenceActionState,
} from "./action-state";

const authMock = vi.mocked(auth);
const addLibraryPathMock = vi.mocked(addLibraryPathCommand);
const updateLibraryPathMock = vi.mocked(updateLibraryPathCommand);
const updateMediaTitlePreferencesMock = vi.mocked(updateMediaTitlePreferencesCommand);
const removeLibraryPathMock = vi.mocked(removeLibraryPathCommand);
const scanLibraryMock = vi.mocked(scanMediaLibraryWorkflow);
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
