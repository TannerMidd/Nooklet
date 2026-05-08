import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", () => ({
  validateQueueIndexerResultRequest: vi.fn(),
  queueIndexerResultInputSchema: { safeParse: vi.fn() },
}));
vi.mock("./result-resolution", () => ({
  resolveQueueIndexerResult: vi.fn(),
}));
vi.mock("./active-download-guard", () => ({
  ensureNoActiveDownloadRequest: vi.fn(),
}));
vi.mock("./target-resolution", () => ({
  resolveQueueIndexerResultTarget: vi.fn(),
}));
vi.mock("./client-resolution", () => ({
  resolveSabnzbdDownloadClient: vi.fn(),
}));
vi.mock("./download-submission", () => ({
  submitIndexerResultToSabnzbd: vi.fn(),
}));
vi.mock("./persistence", () => ({
  persistQueuedIndexerResultDownload: vi.fn(),
}));
vi.mock("./audit", () => ({
  recordQueuedIndexerResultAudit: vi.fn(),
}));

import { recordQueuedIndexerResultAudit } from "./audit";
import { ensureNoActiveDownloadRequest } from "./active-download-guard";
import { resolveSabnzbdDownloadClient } from "./client-resolution";
import { submitIndexerResultToSabnzbd } from "./download-submission";
import { persistQueuedIndexerResultDownload } from "./persistence";
import { validateQueueIndexerResultRequest } from "./request-validation";
import { resolveQueueIndexerResult } from "./result-resolution";
import { resolveQueueIndexerResultTarget } from "./target-resolution";
import { queueIndexerResultWorkflow } from "./index";

const validateMock = vi.mocked(validateQueueIndexerResultRequest);
const activeGuardMock = vi.mocked(ensureNoActiveDownloadRequest);
const resolveResultMock = vi.mocked(resolveQueueIndexerResult);
const resolveTargetMock = vi.mocked(resolveQueueIndexerResultTarget);
const resolveClientMock = vi.mocked(resolveSabnzbdDownloadClient);
const submitMock = vi.mocked(submitIndexerResultToSabnzbd);
const persistMock = vi.mocked(persistQueuedIndexerResultDownload);
const auditMock = vi.mocked(recordQueuedIndexerResultAudit);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queueIndexerResultWorkflow", () => {
  it("calls phases in order and returns the queued download", async () => {
    const calls: string[] = [];
    const request = {
      resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
      mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
      episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
      requestedTitle: "Arrival",
      targetLibraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
      targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
    };
    const resolvedResult = { result: { id: request.resultId, title: "Arrival" } };
    const target = { path: { id: request.targetLibraryPathId }, library: { id: request.targetLibraryId } };
    const downloadClient = { client: { id: "client1" }, baseUrl: "http://localhost:8080" };
    const submission = { queueIds: ["SABnzbd_nzo_1"], category: "movies" };
    const queuedDownload = { downloadRequest: { id: "request1" }, queueItem: null, queueIds: submission.queueIds };

    validateMock.mockImplementation(() => {
      calls.push("validate");
      return request;
    });
    activeGuardMock.mockImplementation(async () => {
      calls.push("active-guard");
    });
    resolveResultMock.mockImplementation(async () => {
      calls.push("resolve-result");
      return resolvedResult as never;
    });
    resolveTargetMock.mockImplementation(async () => {
      calls.push("resolve-target");
      return target as never;
    });
    resolveClientMock.mockImplementation(async () => {
      calls.push("resolve-client");
      return downloadClient as never;
    });
    submitMock.mockImplementation(async () => {
      calls.push("submit");
      return submission;
    });
    persistMock.mockImplementation(async () => {
      calls.push("persist");
      return queuedDownload as never;
    });
    auditMock.mockImplementation(async () => {
      calls.push("audit");
    });

    const result = await queueIndexerResultWorkflow("user1", request);

    expect(calls).toEqual(["validate", "active-guard", "resolve-result", "resolve-target", "resolve-client", "submit", "persist", "audit"]);
    expect(activeGuardMock).toHaveBeenCalledWith("user1", request);
    expect(resolveResultMock).toHaveBeenCalledWith("user1", request);
    expect(resolveTargetMock).toHaveBeenCalledWith("user1", request, resolvedResult);
    expect(resolveClientMock).toHaveBeenCalledWith("user1");
    expect(submitMock).toHaveBeenCalledWith(resolvedResult, downloadClient);
    expect(persistMock).toHaveBeenCalledWith({ userId: "user1", request, resolvedResult, target, downloadClient, submission });
    expect(auditMock).toHaveBeenCalledWith({ userId: "user1", resolvedResult, queuedDownload });
    expect(result).toBe(queuedDownload);
  });
});
