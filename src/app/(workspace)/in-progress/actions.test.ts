import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/import-completed-downloads", () => ({
  importCompletedDownloadsWorkflow: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/import-completed-engine-downloads", () => ({
  importCompletedEngineDownloadsWorkflow: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/retry-download-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/downloads/workflows/retry-download-request")>();
  return {
    ...actual,
    resumeSeasonFulfillmentWorkflow: vi.fn(),
    retryDownloadRequestWorkflow: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { importCompletedEngineDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-engine-downloads";
import {
  resumeSeasonFulfillmentWorkflow,
  retryDownloadRequestWorkflow,
  RetryDownloadRequestWorkflowError,
} from "@/modules/downloads/workflows/retry-download-request";

import { initialDownloadActivityActionState } from "./action-state";
import {
  resumeSeasonFulfillmentAction,
  retryCompletedDownloadImportAction,
  retryDownloadRequestAction,
  runDownloadImportNowAction,
} from "./actions";

const authMock = vi.mocked(auth);
const retryWorkflowMock = vi.mocked(retryDownloadRequestWorkflow);
const resumeFulfillmentMock = vi.mocked(resumeSeasonFulfillmentWorkflow);
const importWorkflowMock = vi.mocked(importCompletedDownloadsWorkflow);
const engineImportWorkflowMock = vi.mocked(importCompletedEngineDownloadsWorkflow);
const revalidateMock = vi.mocked(revalidatePath);

const requestId = "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9";

function retryForm(id: string = requestId) {
  const form = new FormData();
  form.set("requestId", id);
  return form;
}

function resumeForm(id: string = requestId) {
  const form = new FormData();
  form.set("fulfillmentId", id);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retryDownloadRequestAction", () => {
  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await retryDownloadRequestAction(initialDownloadActivityActionState, retryForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(retryWorkflowMock).not.toHaveBeenCalled();
  });

  it("validates the request id", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);

    const result = await retryDownloadRequestAction(initialDownloadActivityActionState, retryForm("nope"));

    expect(result.status).toBe("error");
    expect(retryWorkflowMock).not.toHaveBeenCalled();
  });

  it("maps workflow errors to friendly messages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    retryWorkflowMock.mockRejectedValue(
      new RetryDownloadRequestWorkflowError("request_not_found", "That download request is no longer available."),
    );

    const result = await retryDownloadRequestAction(initialDownloadActivityActionState, retryForm());

    expect(result).toEqual({
      status: "error",
      message: "That download request is no longer available.",
    });
  });

  it("retries the download and revalidates the page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    retryWorkflowMock.mockResolvedValue({ queued: true, reason: "queued", message: null });

    const result = await retryDownloadRequestAction(initialDownloadActivityActionState, retryForm());

    expect(retryWorkflowMock).toHaveBeenCalledWith("u1", requestId);
    expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    expect(result).toEqual({ status: "success", message: "A different release was queued." });
  });

  it("explains when every matching release has already been tried", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    retryWorkflowMock.mockResolvedValue({
      queued: false,
      reason: "no_matching_release",
      message: null,
    });

    const result = await retryDownloadRequestAction(initialDownloadActivityActionState, retryForm());

    expect(result).toEqual({
      status: "error",
      message: "No untried release matches this title and quality preference.",
    });
  });
});

describe("resumeSeasonFulfillmentAction", () => {
  it("resumes the logical season plan and revalidates Activity", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    resumeFulfillmentMock.mockResolvedValue({
      resumed: true,
      queuedCount: 3,
      message: "Season recovery resumed and queued 3 new downloads.",
    });

    const result = await resumeSeasonFulfillmentAction(
      initialDownloadActivityActionState,
      resumeForm(),
    );

    expect(resumeFulfillmentMock).toHaveBeenCalledWith("u1", requestId);
    expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    expect(result).toEqual({
      status: "success",
      message: "Season recovery resumed and queued 3 new downloads.",
    });
  });

  it("keeps the plan in Needs attention when its blocker remains", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    resumeFulfillmentMock.mockResolvedValue({
      resumed: false,
      queuedCount: 0,
      message: "The download path is still unavailable.",
    });

    await expect(resumeSeasonFulfillmentAction(
      initialDownloadActivityActionState,
      resumeForm(),
    )).resolves.toEqual({
      status: "error",
      message: "The download path is still unavailable.",
    });
  });
});

describe("runDownloadImportNowAction", () => {
  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await runDownloadImportNowAction();

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(importWorkflowMock).not.toHaveBeenCalled();
  });

  it("runs the import pass and revalidates the page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    engineImportWorkflowMock.mockResolvedValue(null);
    importWorkflowMock.mockResolvedValue({
      matchedCount: 1,
      importedCount: 1,
      failedCount: 0,
      importedFileCount: 2,
      affectedLibraryPathIds: [],
      retry: { attemptedCount: 0, queuedCount: 0, failedCount: 0 },
      discovery: { attempted: false, ok: true, message: null },
    } as never);

    const result = await runDownloadImportNowAction();

    expect(importWorkflowMock).toHaveBeenCalledWith("u1");
    expect(engineImportWorkflowMock).toHaveBeenCalledWith("u1");
    expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    expect(revalidateMock).toHaveBeenCalledWith("/home");
    expect(result).toEqual({
      status: "success",
      message: "Built-in: no completed downloads waiting. SABnzbd: 1 imported, 0 failed.",
    });
  });

  it("returns an error when an import pass completes with failed items", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    engineImportWorkflowMock.mockResolvedValue({
      matchedCount: 1,
      importedCount: 0,
      failedCount: 1,
      importedFileCount: 0,
      affectedLibraryPathIds: [],
      retry: { attemptedCount: 0, queuedCount: 0, failedCount: 0 },
      discovery: { attempted: false, ok: true, message: null },
    } as never);
    importWorkflowMock.mockResolvedValue({
      matchedCount: 0,
      importedCount: 0,
      failedCount: 0,
      importedFileCount: 0,
      affectedLibraryPathIds: [],
      retry: { attemptedCount: 0, queuedCount: 0, failedCount: 0 },
      discovery: { attempted: false, ok: true, message: null },
    } as never);

    await expect(runDownloadImportNowAction()).resolves.toEqual({
      status: "error",
      message: "Built-in: 0 imported, 1 failed. SABnzbd: 0 imported, 0 failed.",
    });
  });
});

describe("retryCompletedDownloadImportAction", () => {
  it("runs a request-scoped import instead of importing every completed item", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    engineImportWorkflowMock.mockResolvedValue(null);
    importWorkflowMock.mockResolvedValue({
      matchedCount: 1,
      importedCount: 1,
      failedCount: 0,
      importedFileCount: 1,
      affectedLibraryPathIds: ["path-1"],
      retry: { attemptedCount: 0, queuedCount: 0, failedCount: 0 },
      discovery: { attempted: true, ok: true, message: null },
    } as never);

    const result = await retryCompletedDownloadImportAction(
      initialDownloadActivityActionState,
      retryForm(),
    );

    expect(engineImportWorkflowMock).toHaveBeenCalledWith("u1", { requestId });
    expect(importWorkflowMock).toHaveBeenCalledWith("u1", { requestId });
    expect(result).toEqual({
      status: "success",
      message: "Imported 1 completed download into the library.",
    });
  });

  it("keeps a targeted import failure visible instead of claiming success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    engineImportWorkflowMock.mockResolvedValue({
      matchedCount: 1,
      importedCount: 0,
      failedCount: 1,
      importedFileCount: 0,
      affectedLibraryPathIds: [],
      retry: { attemptedCount: 0, queuedCount: 0, failedCount: 0 },
      discovery: { attempted: false, ok: true, message: null },
    } as never);
    importWorkflowMock.mockResolvedValue({
      matchedCount: 0,
      importedCount: 0,
      failedCount: 0,
      importedFileCount: 0,
      affectedLibraryPathIds: [],
      retry: { attemptedCount: 0, queuedCount: 0, failedCount: 0 },
      discovery: { attempted: false, ok: true, message: null },
    } as never);

    const result = await retryCompletedDownloadImportAction(
      initialDownloadActivityActionState,
      retryForm(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Import retry still failed for 1 completed download. Review the technical details, destination, and file permissions.",
    });
  });
});
