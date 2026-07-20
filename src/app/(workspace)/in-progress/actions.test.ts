import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/jobs/repositories/job-repository", () => ({
  createImmediateJob: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/cancel-season-fulfillment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/downloads/workflows/cancel-season-fulfillment")>();
  return {
    ...actual,
    cancelSeasonFulfillmentWorkflow: vi.fn(),
  };
});
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
import {
  cancelSeasonFulfillmentWorkflow,
  CancelSeasonFulfillmentWorkflowError,
} from "@/modules/downloads/workflows/cancel-season-fulfillment";
import {
  resumeSeasonFulfillmentWorkflow,
  retryDownloadRequestWorkflow,
  RetryDownloadRequestWorkflowError,
} from "@/modules/downloads/workflows/retry-download-request";
import { createImmediateJob } from "@/modules/jobs/repositories/job-repository";

import { initialDownloadActivityActionState } from "./action-state";
import {
  cancelSeasonFulfillmentAction,
  resumeSeasonFulfillmentAction,
  retryCompletedDownloadImportAction,
  retryDownloadRequestAction,
  runDownloadImportNowAction,
} from "./actions";

const authMock = vi.mocked(auth);
const cancelFulfillmentMock = vi.mocked(cancelSeasonFulfillmentWorkflow);
const retryWorkflowMock = vi.mocked(retryDownloadRequestWorkflow);
const resumeFulfillmentMock = vi.mocked(resumeSeasonFulfillmentWorkflow);
const createImmediateJobMock = vi.mocked(createImmediateJob);
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

describe("cancelSeasonFulfillmentAction", () => {
  it("checkpoints cancellation and revalidates Activity and Library", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    cancelFulfillmentMock.mockResolvedValue({
      cancelled: false,
      cancellationPending: true,
      message: "Cancellation started. Nooklet will keep removing and verifying this plan's downloads automatically.",
    });

    const result = await cancelSeasonFulfillmentAction(
      initialDownloadActivityActionState,
      resumeForm(),
    );

    expect(cancelFulfillmentMock).toHaveBeenCalledWith("u1", requestId);
    expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    expect(revalidateMock).toHaveBeenCalledWith("/library");
    expect(revalidateMock).toHaveBeenCalledWith("/library/tv");
    expect(result).toEqual({
      status: "success",
      message: "Cancellation started. Nooklet will keep removing and verifying this plan's downloads automatically.",
    });
  });

  it("validates ownership errors without exposing internal failures", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    cancelFulfillmentMock.mockRejectedValue(
      new CancelSeasonFulfillmentWorkflowError(
        "fulfillment_not_found",
        "That season recovery plan is no longer available.",
      ),
    );

    await expect(cancelSeasonFulfillmentAction(
      initialDownloadActivityActionState,
      resumeForm(),
    )).resolves.toEqual({
      status: "error",
      message: "That season recovery plan is no longer available.",
    });

    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("runDownloadImportNowAction", () => {
  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await runDownloadImportNowAction();

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(createImmediateJobMock).not.toHaveBeenCalled();
  });

  it("queues the import pass for the isolated worker and revalidates the page", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    createImmediateJobMock.mockResolvedValue({ id: "job-1" } as never);

    const result = await runDownloadImportNowAction();

    expect(createImmediateJobMock).toHaveBeenCalledWith({
      userId: "u1",
      jobType: "download-import",
      targetType: "download-import",
      targetKey: "all",
    });
    expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    expect(revalidateMock).toHaveBeenCalledWith("/home");
    expect(result).toEqual({
      status: "success",
      message: "Import pass queued. Nooklet will run it in the isolated background worker.",
    });
  });

  it("returns an error when the import job cannot be queued", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    createImmediateJobMock.mockRejectedValue(new Error("database unavailable"));

    await expect(runDownloadImportNowAction()).resolves.toEqual({
      status: "error",
      message: "Nooklet could not queue the import pass.",
    });
  });
});

describe("retryCompletedDownloadImportAction", () => {
  it("queues a request-scoped import instead of importing on the web request", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    createImmediateJobMock.mockResolvedValue({ id: "job-1" } as never);

    const result = await retryCompletedDownloadImportAction(
      initialDownloadActivityActionState,
      retryForm(),
    );

    expect(createImmediateJobMock).toHaveBeenCalledWith({
      userId: "u1",
      jobType: "download-import",
      targetType: "download-request",
      targetKey: requestId,
    });
    expect(result).toEqual({
      status: "success",
      message: "Import retry queued. Nooklet will process it in the isolated background worker.",
    });
  });

  it("keeps a targeted queue failure visible instead of claiming success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    createImmediateJobMock.mockRejectedValue(new Error("database unavailable"));

    const result = await retryCompletedDownloadImportAction(
      initialDownloadActivityActionState,
      retryForm(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Nooklet could not queue that import retry.",
    });
  });
});
