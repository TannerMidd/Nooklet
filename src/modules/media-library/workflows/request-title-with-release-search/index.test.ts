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

import { queueRequestedTitleRelease } from "./release-queueing";
import { searchRequestedTitleReleasesForTarget } from "./release-search";
import { persistRequestedTitleSelections, resolveSeasonIdForTarget } from "./season-persistence";
import { requestTitleWithReleaseSearchWorkflow } from "./index";
import { validateRequestTitleWithReleaseSearchRequest } from "./request-validation";
import { requestWorkflowMediaTitle } from "./title-request";

const validateMock = vi.mocked(validateRequestTitleWithReleaseSearchRequest);
const titleRequestMock = vi.mocked(requestWorkflowMediaTitle);
const releaseSearchMock = vi.mocked(searchRequestedTitleReleasesForTarget);
const releaseQueueMock = vi.mocked(queueRequestedTitleRelease);
const persistSelectionsMock = vi.mocked(persistRequestedTitleSelections);
const resolveSeasonIdMock = vi.mocked(resolveSeasonIdForTarget);

beforeEach(() => {
  vi.clearAllMocks();
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

    expect(calls).toEqual(["validate", "request-title", "persist-selections", "search-releases", "queue-release"]);
    expect(validateMock).toHaveBeenCalledWith(request);
    expect(titleRequestMock).toHaveBeenCalledWith("u1", request);
    expect(persistSelectionsMock).toHaveBeenCalledWith(request, title.id, [{ kind: "all" }]);
    expect(releaseSearchMock).toHaveBeenCalledWith("u1", request, { kind: "all" });
    expect(releaseQueueMock).toHaveBeenCalledWith("u1", request, title, releaseSearch, { seasonId: null, target: { kind: "all" } });
    expect(result).toMatchObject({
      title,
      releaseSearch,
      queuedDownload,
      selections: [{ target: { kind: "all" }, releaseSearch, queuedDownload }],
    });
  });
});
