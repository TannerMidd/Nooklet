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

import { queueRequestedTitleRelease } from "./release-queueing";
import { searchRequestedTitleReleasesForTarget } from "./release-search";
import { requestTitleWithReleaseSearchWorkflow } from "./index";
import { validateRequestTitleWithReleaseSearchRequest } from "./request-validation";
import { requestWorkflowMediaTitle } from "./title-request";

const validateMock = vi.mocked(validateRequestTitleWithReleaseSearchRequest);
const titleRequestMock = vi.mocked(requestWorkflowMediaTitle);
const releaseSearchMock = vi.mocked(searchRequestedTitleReleasesForTarget);
const releaseQueueMock = vi.mocked(queueRequestedTitleRelease);

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
    releaseSearchMock.mockImplementation(async () => {
      calls.push("search-releases");
      return releaseSearch as never;
    });
    releaseQueueMock.mockImplementation(async () => {
      calls.push("queue-release");
      return queuedDownload as never;
    });

    const result = await requestTitleWithReleaseSearchWorkflow("u1", request);

    expect(calls).toEqual(["validate", "request-title", "search-releases", "queue-release"]);
    expect(validateMock).toHaveBeenCalledWith(request);
    expect(titleRequestMock).toHaveBeenCalledWith("u1", request);
    expect(releaseSearchMock).toHaveBeenCalledWith("u1", request, { kind: "all" });
    expect(releaseQueueMock).toHaveBeenCalledWith("u1", request, title, releaseSearch);
    expect(result).toMatchObject({
      title,
      releaseSearch,
      queuedDownload,
      selections: [{ target: { kind: "all" }, releaseSearch, queuedDownload }],
    });
  });
});
