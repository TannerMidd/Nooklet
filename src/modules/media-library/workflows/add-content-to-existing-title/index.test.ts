import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./request-validation")>();
  return {
    ...actual,
    validateAddContentToExistingTitleRequest: vi.fn(),
  };
});
vi.mock("./title-loading", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./title-loading")>();
  return {
    ...actual,
    loadExistingTitleForAddContent: vi.fn(),
  };
});
vi.mock("../request-title-with-release-search/release-search", () => ({
  searchRequestedTitleReleasesForTarget: vi.fn(),
}));
vi.mock("../request-title-with-release-search/release-queueing", () => ({
  queueRequestedTitleRelease: vi.fn(),
}));
vi.mock("../request-title-with-release-search/season-persistence", () => ({
  persistRequestedTitleSelections: vi.fn(),
  resolveSeasonIdForTarget: vi.fn(),
}));

import { queueRequestedTitleRelease } from "../request-title-with-release-search/release-queueing";
import { searchRequestedTitleReleasesForTarget } from "../request-title-with-release-search/release-search";
import {
  persistRequestedTitleSelections,
  resolveSeasonIdForTarget,
} from "../request-title-with-release-search/season-persistence";

import { addContentToExistingTitleWorkflow } from "./index";
import { validateAddContentToExistingTitleRequest } from "./request-validation";
import { loadExistingTitleForAddContent } from "./title-loading";

const validateMock = vi.mocked(validateAddContentToExistingTitleRequest);
const loadMock = vi.mocked(loadExistingTitleForAddContent);
const releaseSearchMock = vi.mocked(searchRequestedTitleReleasesForTarget);
const releaseQueueMock = vi.mocked(queueRequestedTitleRelease);
const persistSelectionsMock = vi.mocked(persistRequestedTitleSelections);
const resolveSeasonIdMock = vi.mocked(resolveSeasonIdForTarget);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addContentToExistingTitleWorkflow", () => {
  it("calls phases in order, persists selections, and runs search/queue per target", async () => {
    const calls: string[] = [];
    const parsedInput = {
      titleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
      selections: { mode: "seasons" as const, seasons: [1, 2] },
      downloadNow: true,
    };
    const title = { id: parsedInput.titleId, mediaType: "tv" } as { id: string; mediaType: "tv" };
    const request = {
      mediaType: "tv",
      title: "Eureka",
      year: 2006,
      monitored: true,
      qualityProfile: "hd-1080p",
      downloadNow: true,
      selections: parsedInput.selections,
    } as const;
    const releaseSearch = { searched: true, searchRun: { id: "run-x" }, results: [] };
    const queuedDownload = { queued: true, reason: "queued" };

    validateMock.mockImplementation(() => {
      calls.push("validate");
      return parsedInput as never;
    });
    loadMock.mockImplementation(async () => {
      calls.push("load");
      return { title, request } as never;
    });
    persistSelectionsMock.mockImplementation(async () => {
      calls.push("persist");
      return {
        seasonIdByNumber: new Map([[1, "season-1-id"], [2, "season-2-id"]]),
        episodeIdByNumber: new Map(),
      } as never;
    });
    resolveSeasonIdMock.mockImplementation((target) => {
      if (target.kind === "season") {
        return target.season === 1 ? "season-1-id" : "season-2-id";
      }
      return null;
    });
    releaseSearchMock.mockImplementation(async () => {
      calls.push("search");
      return releaseSearch as never;
    });
    releaseQueueMock.mockImplementation(async () => {
      calls.push("queue");
      return queuedDownload as never;
    });

    const result = await addContentToExistingTitleWorkflow("u1", parsedInput as never);

    expect(calls).toEqual([
      "validate",
      "load",
      "persist",
      "search",
      "queue",
      "search",
      "queue",
    ]);
    expect(persistSelectionsMock).toHaveBeenCalledWith(request, title.id, [
      { kind: "season", season: 1 },
      { kind: "season", season: 2 },
    ]);
    expect(releaseSearchMock).toHaveBeenNthCalledWith(1, "u1", request, { kind: "season", season: 1 });
    expect(releaseSearchMock).toHaveBeenNthCalledWith(2, "u1", request, { kind: "season", season: 2 });
    expect(releaseQueueMock).toHaveBeenNthCalledWith(1, "u1", request, title, releaseSearch, {
      seasonId: "season-1-id",
      target: { kind: "season", season: 1 },
    });
    expect(releaseQueueMock).toHaveBeenNthCalledWith(2, "u1", request, title, releaseSearch, {
      seasonId: "season-2-id",
      target: { kind: "season", season: 2 },
    });
    expect(result.selections).toHaveLength(2);
    expect(result.selections[0]).toMatchObject({
      target: { kind: "season", season: 1 },
      releaseSearch,
      queuedDownload,
    });
  });
});
