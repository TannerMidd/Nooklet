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
vi.mock("@/modules/downloads/workflows/retry-download-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/downloads/workflows/retry-download-request")>();
  return {
    ...actual,
    retryDownloadRequestWorkflow: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import {
  retryDownloadRequestWorkflow,
  RetryDownloadRequestWorkflowError,
} from "@/modules/downloads/workflows/retry-download-request";

import { initialDownloadActivityActionState } from "./action-state";
import { retryDownloadRequestAction, runDownloadImportNowAction } from "./actions";

const authMock = vi.mocked(auth);
const retryWorkflowMock = vi.mocked(retryDownloadRequestWorkflow);
const importWorkflowMock = vi.mocked(importCompletedDownloadsWorkflow);
const revalidateMock = vi.mocked(revalidatePath);

const requestId = "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9";

function retryForm(id: string = requestId) {
  const form = new FormData();
  form.set("requestId", id);
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
    retryWorkflowMock.mockResolvedValue({ queued: true, message: null });

    const result = await retryDownloadRequestAction(initialDownloadActivityActionState, retryForm());

    expect(retryWorkflowMock).toHaveBeenCalledWith("u1", requestId);
    expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    expect(result).toEqual({ status: "success", message: "Retry queued a new release." });
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
    expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    expect(result).toEqual({
      status: "success",
      message: "Import pass finished: 1 imported, 0 failed.",
    });
  });
});
