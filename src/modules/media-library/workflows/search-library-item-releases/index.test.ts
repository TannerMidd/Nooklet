import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./request-validation")>();
  return {
    ...actual,
    validateSearchLibraryItemReleasesRequest: vi.fn(),
  };
});
vi.mock("./item-resolution", () => ({
  resolveLibrarySearchItem: vi.fn(),
}));
vi.mock("./release-search", () => ({
  searchLibraryItemReleases: vi.fn(),
}));
vi.mock("./release-queueing", () => ({
  queueLibraryItemRelease: vi.fn(),
}));

import { resolveLibrarySearchItem } from "./item-resolution";
import { searchLibraryItemReleasesWorkflow } from "./index";
import { queueLibraryItemRelease } from "./release-queueing";
import { searchLibraryItemReleases } from "./release-search";
import { validateSearchLibraryItemReleasesRequest } from "./request-validation";

const validateMock = vi.mocked(validateSearchLibraryItemReleasesRequest);
const resolveMock = vi.mocked(resolveLibrarySearchItem);
const releaseSearchMock = vi.mocked(searchLibraryItemReleases);
const releaseQueueMock = vi.mocked(queueLibraryItemRelease);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchLibraryItemReleasesWorkflow", () => {
  it("calls phases in order and propagates the item, release search, and queued download", async () => {
    const calls: string[] = [];
    const request = {
      titleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
      episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
      excludedResultIds: ["d5ec489b-4888-43c1-a095-fd9bbf612144"],
      excludedReleaseKeys: ["title:severance s01e02 1080p"],
    };
    const item = { title: { id: request.titleId }, episode: { id: request.episodeId } };
    const releaseSearch = { searched: true, searchRun: { id: "run1" }, results: [] };
    const queuedDownload = { queued: false, reason: "no_matching_release" };

    validateMock.mockImplementation(() => {
      calls.push("validate");
      return request;
    });
    resolveMock.mockImplementation(async () => {
      calls.push("resolve-item");
      return item as never;
    });
    releaseSearchMock.mockImplementation(async () => {
      calls.push("search-releases");
      return releaseSearch as never;
    });
    releaseQueueMock.mockImplementation(async () => {
      calls.push("queue-release");
      return queuedDownload as never;
    });

    const result = await searchLibraryItemReleasesWorkflow("u1", request);

    expect(calls).toEqual(["validate", "resolve-item", "search-releases", "queue-release"]);
    expect(validateMock).toHaveBeenCalledWith(request);
    expect(resolveMock).toHaveBeenCalledWith("u1", request);
    expect(releaseSearchMock).toHaveBeenCalledWith("u1", item);
    expect(releaseQueueMock).toHaveBeenCalledWith("u1", item, releaseSearch, {
      excludedResultIds: ["d5ec489b-4888-43c1-a095-fd9bbf612144"],
      excludedReleaseKeys: ["title:severance s01e02 1080p"],
    });
    expect(result).toEqual({ item, releaseSearch, queuedDownload });
  });
});
