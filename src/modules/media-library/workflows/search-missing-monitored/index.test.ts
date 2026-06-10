import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./candidate-selection", () => ({
  selectMissingContentCandidates: vi.fn(),
}));
vi.mock("./search-budgeting", () => ({
  budgetMissingContentCandidates: vi.fn(),
}));
vi.mock("./release-dispatch", () => ({
  dispatchMissingContentSearches: vi.fn(),
}));
vi.mock("./run-reporting", () => ({
  recordMissingContentSearchReport: vi.fn(),
}));

import { selectMissingContentCandidates } from "./candidate-selection";
import { budgetMissingContentCandidates } from "./search-budgeting";
import { dispatchMissingContentSearches } from "./release-dispatch";
import { recordMissingContentSearchReport } from "./run-reporting";
import { searchMissingMonitoredContentWorkflow } from "./index";

const selectMock = vi.mocked(selectMissingContentCandidates);
const budgetMock = vi.mocked(budgetMissingContentCandidates);
const dispatchMock = vi.mocked(dispatchMissingContentSearches);
const reportMock = vi.mocked(recordMissingContentSearchReport);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchMissingMonitoredContentWorkflow", () => {
  it("calls phases in order and returns the run report", async () => {
    const calls: string[] = [];
    const candidates = [{ kind: "movie", titleId: "title1", episodeId: null, label: "Arrival" }];
    const budgeted = [candidates[0]];
    const outcomes = [{ candidate: candidates[0], queued: true, message: null }];
    const report = { searchedCount: 1, queuedCount: 1, unmatchedCount: 0 };

    selectMock.mockImplementation(async () => {
      calls.push("candidate-selection");
      return candidates as never;
    });
    budgetMock.mockImplementation(async () => {
      calls.push("search-budgeting");
      return budgeted as never;
    });
    dispatchMock.mockImplementation(async () => {
      calls.push("release-dispatch");
      return outcomes as never;
    });
    reportMock.mockImplementation(async () => {
      calls.push("run-reporting");
      return report;
    });

    const result = await searchMissingMonitoredContentWorkflow("user1");

    expect(calls).toEqual([
      "candidate-selection",
      "search-budgeting",
      "release-dispatch",
      "run-reporting",
    ]);
    expect(selectMock).toHaveBeenCalledWith("user1");
    expect(budgetMock).toHaveBeenCalledWith("user1", candidates);
    expect(dispatchMock).toHaveBeenCalledWith("user1", budgeted);
    expect(reportMock).toHaveBeenCalledWith("user1", outcomes);
    expect(result).toBe(report);
  });
});
