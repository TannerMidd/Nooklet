import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./request-validation")>();
  return {
    ...actual,
    validateRequestTitleWithReleaseSearchRequest: vi.fn(),
  };
});
vi.mock("./title-request", () => ({
  requestWorkflowMediaTitle: vi.fn(),
}));
vi.mock("./release-search", () => ({
  searchRequestedTitleReleasesForTarget: vi.fn(),
}));
vi.mock("./release-queueing", () => ({
  queueRequestedTitleRelease: vi.fn(),
}));
vi.mock("./season-persistence", () => ({
  persistRequestedTitleSelections: vi.fn(),
  resolveSeasonIdForTarget: vi.fn(),
}));
vi.mock("./episode-monitoring-apply", () => ({
  applyRequestedTitleMonitoring: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-request-attempts-repository", () => ({
  acquireMediaRequestAttempt: vi.fn(),
  releaseMediaRequestAttempt: vi.fn(),
}));

import { queueRequestedTitleRelease } from "./release-queueing";
import { searchRequestedTitleReleasesForTarget } from "./release-search";
import { persistRequestedTitleSelections, resolveSeasonIdForTarget } from "./season-persistence";
import { applyRequestedTitleMonitoring } from "./episode-monitoring-apply";
import { requestTitleWithReleaseSearchWorkflow } from "./index";
import { validateRequestTitleWithReleaseSearchRequest } from "./request-validation";
import { requestWorkflowMediaTitle } from "./title-request";
import {
  acquireMediaRequestAttempt,
  releaseMediaRequestAttempt,
} from "@/modules/media-library/repositories/media-request-attempts-repository";

const validateMock = vi.mocked(validateRequestTitleWithReleaseSearchRequest);
const titleRequestMock = vi.mocked(requestWorkflowMediaTitle);
const releaseSearchMock = vi.mocked(searchRequestedTitleReleasesForTarget);
const releaseQueueMock = vi.mocked(queueRequestedTitleRelease);
const persistSelectionsMock = vi.mocked(persistRequestedTitleSelections);
const resolveSeasonIdMock = vi.mocked(resolveSeasonIdForTarget);
const applyMonitoringMock = vi.mocked(applyRequestedTitleMonitoring);
const acquireAttemptMock = vi.mocked(acquireMediaRequestAttempt);
const releaseAttemptMock = vi.mocked(releaseMediaRequestAttempt);

beforeEach(() => {
  vi.clearAllMocks();
  acquireAttemptMock.mockResolvedValue(true);
  releaseAttemptMock.mockResolvedValue(undefined);
});

describe("requestTitleWithReleaseSearchWorkflow", () => {
  it("calls phases in order and propagates the title, release search, and queued download", async () => {
    const calls: string[] = [];
    const request = {
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
      monitored: true,
      qualityProfile: "hd-1080p",
      downloadNow: true,
    } as const;
    const title = { id: "title1" };
    const releaseSearch = { searched: true, searchRun: { id: "run1" }, results: [] };
    const queuedDownload = { queued: false, reason: "no_matching_release" };

    validateMock.mockImplementation(() => {
      calls.push("validate");
      return request as never;
    });
    titleRequestMock.mockImplementation(async () => {
      calls.push("request-title");
      return title as never;
    });
    persistSelectionsMock.mockImplementation(async () => {
      calls.push("persist-selections");
      return { seasonIdByNumber: new Map(), episodeIdByNumber: new Map() } as never;
    });
    applyMonitoringMock.mockImplementation(async () => {
      calls.push("apply-monitoring");
    });
    resolveSeasonIdMock.mockReturnValue(null);
    releaseSearchMock.mockImplementation(async () => {
      calls.push("search-releases");
      return releaseSearch as never;
    });
    releaseQueueMock.mockImplementation(async () => {
      calls.push("queue-release");
      return queuedDownload as never;
    });

    const result = await requestTitleWithReleaseSearchWorkflow("u1", request);

    expect(calls).toEqual(["validate", "request-title", "persist-selections", "apply-monitoring", "search-releases", "queue-release"]);
    expect(validateMock).toHaveBeenCalledWith(request);
    expect(titleRequestMock).toHaveBeenCalledWith("u1", request);
    expect(persistSelectionsMock).toHaveBeenCalledWith(request, title.id, [{ kind: "all" }]);
    expect(applyMonitoringMock).toHaveBeenCalledWith("u1", [{ kind: "all" }], expect.objectContaining({
      seasonIdByNumber: expect.any(Map),
      episodeIdByNumber: expect.any(Map),
    }));
    expect(releaseSearchMock).toHaveBeenCalledWith("u1", request, { kind: "all" });
    expect(releaseQueueMock).toHaveBeenCalledWith("u1", request, title, releaseSearch, { seasonId: null, target: { kind: "all" } });
    expect(result).toMatchObject({
      title,
      releaseSearch,
      queuedDownload,
      selections: [{ target: { kind: "all" }, releaseSearch, queuedDownload }],
    });
  });

  it("throws RequestTitleAlreadyInFlightError when the idempotency lock cannot be acquired", async () => {
    const { RequestTitleAlreadyInFlightError } = await import("./index");
    const request = {
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
      monitored: true,
      qualityProfile: "hd-1080p",
      downloadNow: false,
    } as const;

    validateMock.mockReturnValue(request as never);
    acquireAttemptMock.mockResolvedValueOnce(false);

    await expect(requestTitleWithReleaseSearchWorkflow("u1", request)).rejects.toBeInstanceOf(
      RequestTitleAlreadyInFlightError,
    );
    expect(titleRequestMock).not.toHaveBeenCalled();
    expect(releaseAttemptMock).not.toHaveBeenCalled();
  });
});
