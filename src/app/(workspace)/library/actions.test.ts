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
  scanMediaLibraryWorkflow,
  ScanMediaLibraryWorkflowError,
} from "@/modules/media-library/workflows/scan-library";

import {
  addLibraryPathAction,
  scanLibraryAction,
} from "./actions";
import { initialLibraryPathActionState } from "./action-state";

const authMock = vi.mocked(auth);
const addLibraryPathMock = vi.mocked(addLibraryPathCommand);
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
