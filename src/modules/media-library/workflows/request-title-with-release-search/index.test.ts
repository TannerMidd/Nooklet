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
vi.mock("./episode-sync", () => ({
  persistRequestedTitleStructure: vi.fn(),
}));
vi.mock("./existing-title-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./existing-title-request")>();
  return {
    ...actual,
    validateRequestExistingTitleContentRequest: vi.fn(),
    loadExistingTitleRequest: vi.fn(),
  };
});
vi.mock("./season-persistence", () => ({
  resolveSeasonIdForTarget: vi.fn(),
  resolveEpisodeIdForTarget: vi.fn(),
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
import { persistRequestedTitleStructure } from "./episode-sync";
import {
  loadExistingTitleRequest,
  validateRequestExistingTitleContentRequest,
} from "./existing-title-request";
import {
  resolveEpisodeIdForTarget,
  resolveSeasonIdForTarget,
} from "./season-persistence";
import { applyRequestedTitleMonitoring } from "./episode-monitoring-apply";
import {
  requestExistingTitleContentWorkflow,
  requestTitleWithReleaseSearchWorkflow,
} from "./index";
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
const persistSelectionsMock = vi.mocked(persistRequestedTitleStructure);
const resolveSeasonIdMock = vi.mocked(resolveSeasonIdForTarget);
const resolveEpisodeIdMock = vi.mocked(resolveEpisodeIdForTarget);
const applyMonitoringMock = vi.mocked(applyRequestedTitleMonitoring);
const acquireAttemptMock = vi.mocked(acquireMediaRequestAttempt);
const releaseAttemptMock = vi.mocked(releaseMediaRequestAttempt);
const validateExistingMock = vi.mocked(validateRequestExistingTitleContentRequest);
const loadExistingMock = vi.mocked(loadExistingTitleRequest);

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
    resolveEpisodeIdMock.mockReturnValue(null);
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
    expect(persistSelectionsMock).toHaveBeenCalledWith("u1", request, title.id, [{ kind: "all" }]);
    expect(applyMonitoringMock).toHaveBeenCalledWith("u1", [{ kind: "all" }], expect.objectContaining({
      seasonIdByNumber: expect.any(Map),
      episodeIdByNumber: expect.any(Map),
    }));
    expect(releaseSearchMock).toHaveBeenCalledWith("u1", request, { kind: "all" });
    expect(releaseQueueMock).toHaveBeenCalledWith("u1", request, title, releaseSearch, {
      seasonId: null,
      episodeId: null,
      target: { kind: "all" },
    });
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

describe("requestExistingTitleContentWorkflow", () => {
  const parsedInput = {
    titleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
    selections: { mode: "seasons" as const, seasons: [1, 2] },
    downloadNow: true,
  };
  const title = { id: parsedInput.titleId, mediaType: "tv" };
  const existingRequest = {
    mediaType: "tv",
    title: "Eureka",
    year: 2006,
    monitored: true,
    qualityProfile: "hd-1080p",
    downloadNow: true,
    selections: parsedInput.selections,
  } as const;

  it("locks on the title id, persists structure, applies monitoring, and searches per target", async () => {
    const releaseSearch = { searched: true, searchRun: { id: "run-x" }, results: [] };
    const queuedDownload = { queued: true, reason: "queued" };

    validateExistingMock.mockReturnValue(parsedInput as never);
    loadExistingMock.mockResolvedValue({ title, request: existingRequest } as never);
    persistSelectionsMock.mockResolvedValue({
      seasonIdByNumber: new Map([[1, "season-1-id"], [2, "season-2-id"]]),
      episodeIdByNumber: new Map(),
    } as never);
    resolveSeasonIdMock.mockImplementation((target) => {
      if (target.kind === "season") {
        return target.season === 1 ? "season-1-id" : "season-2-id";
      }
      return null;
    });
    resolveEpisodeIdMock.mockReturnValue(null);
    releaseSearchMock.mockResolvedValue(releaseSearch as never);
    releaseQueueMock.mockResolvedValue(queuedDownload as never);

    const result = await requestExistingTitleContentWorkflow("u1", parsedInput as never);

    expect(acquireAttemptMock).toHaveBeenCalledWith(
      "u1",
      `tv|titleId:${parsedInput.titleId}|tv:seasons:1,2`,
    );
    expect(persistSelectionsMock).toHaveBeenCalledWith("u1", existingRequest, title.id, [
      { kind: "season", season: 1 },
      { kind: "season", season: 2 },
    ]);
    expect(applyMonitoringMock).toHaveBeenCalledTimes(1);
    expect(releaseQueueMock).toHaveBeenNthCalledWith(1, "u1", existingRequest, title, releaseSearch, {
      seasonId: "season-1-id",
      episodeId: null,
      target: { kind: "season", season: 1 },
    });
    expect(releaseQueueMock).toHaveBeenNthCalledWith(2, "u1", existingRequest, title, releaseSearch, {
      seasonId: "season-2-id",
      episodeId: null,
      target: { kind: "season", season: 2 },
    });
    expect(releaseAttemptMock).toHaveBeenCalledTimes(1);
    expect(result.selections).toHaveLength(2);
    expect(result.selections[0]).toMatchObject({
      target: { kind: "season", season: 1 },
      seasonId: "season-1-id",
      releaseSearch,
      queuedDownload,
    });
  });

  it("throws RequestTitleAlreadyInFlightError when the lock is held", async () => {
    const { RequestTitleAlreadyInFlightError } = await import("./index");

    validateExistingMock.mockReturnValue(parsedInput as never);
    loadExistingMock.mockResolvedValue({ title, request: existingRequest } as never);
    acquireAttemptMock.mockResolvedValueOnce(false);

    await expect(requestExistingTitleContentWorkflow("u1", parsedInput as never)).rejects.toBeInstanceOf(
      RequestTitleAlreadyInFlightError,
    );
    expect(persistSelectionsMock).not.toHaveBeenCalled();
    expect(releaseAttemptMock).not.toHaveBeenCalled();
  });
});
