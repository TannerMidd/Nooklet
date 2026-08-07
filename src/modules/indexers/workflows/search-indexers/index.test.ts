import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", () => ({
    validateIndexerSearchRequest: vi.fn(),
}));
vi.mock("./indexer-selection", () => ({
    selectIndexerSearchSources: vi.fn(),
}));
vi.mock("./credential-resolution", () => ({
    resolveIndexerSearchCredentials: vi.fn(),
}));
vi.mock("./indexer-execution", () => ({
    executeIndexerSearches: vi.fn(),
}));
vi.mock("./normalization", () => ({
    normalizeIndexerSearchResults: vi.fn(),
}));
vi.mock("./filtering-scoring", () => ({
    filterAndScoreIndexerSearchResults: vi.fn(),
}));
vi.mock("./persistence", () => ({
    persistIndexerSearchResults: vi.fn(),
}));
vi.mock("./audit", () => ({
    recordIndexerSearchAudit: vi.fn(),
}));

import { recordIndexerSearchAudit } from "./audit";
import { resolveIndexerSearchCredentials } from "./credential-resolution";
import { executeIndexerSearches } from "./indexer-execution";
import { selectIndexerSearchSources } from "./indexer-selection";
import { searchIndexersWorkflow } from "./index";
import { filterAndScoreIndexerSearchResults } from "./filtering-scoring";
import { normalizeIndexerSearchResults } from "./normalization";
import { persistIndexerSearchResults } from "./persistence";
import { validateIndexerSearchRequest } from "./request-validation";

const validateMock = vi.mocked(validateIndexerSearchRequest);
const selectMock = vi.mocked(selectIndexerSearchSources);
const resolveMock = vi.mocked(resolveIndexerSearchCredentials);
const executeMock = vi.mocked(executeIndexerSearches);
const normalizeMock = vi.mocked(normalizeIndexerSearchResults);
const scoreMock = vi.mocked(filterAndScoreIndexerSearchResults);
const persistMock = vi.mocked(persistIndexerSearchResults);
const auditMock = vi.mocked(recordIndexerSearchAudit);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("searchIndexersWorkflow", () => {
    it("calls phases in order and propagates the persisted result", async () => {
        const calls: string[] = [];
        const request = { mediaType: "movie", query: "Arrival", normalizedKey: "arrival" } as const;
        const selectedSources = [{ indexer: { id: "idx1" }, categories: ["2000"] }];
        const resolvedSources = [{ ...selectedSources[0], apiKey: "secret" }];
        const rawExecutions = [{ source: resolvedSources[0], results: [], errorMessage: null }];
        const normalizedExecutions = [{ ...rawExecutions[0], results: [] }];
        const scoredExecutions = [{ ...rawExecutions[0], results: [] }];
        const persisted = { searchRun: { id: "run1" }, results: [] };

        validateMock.mockImplementation(() => {
            calls.push("validate");

            return request;
        });
        selectMock.mockImplementation(async () => {
            calls.push("select");

            return selectedSources as never;
        });
        resolveMock.mockImplementation(async () => {
            calls.push("resolve");

            return resolvedSources as never;
        });
        executeMock.mockImplementation(async () => {
            calls.push("execute");

            return rawExecutions as never;
        });
        normalizeMock.mockImplementation(() => {
            calls.push("normalize");

            return normalizedExecutions as never;
        });
        scoreMock.mockImplementation(() => {
            calls.push("score");

            return scoredExecutions as never;
        });
        persistMock.mockImplementation(async () => {
            calls.push("persist");

            return persisted as never;
        });
        auditMock.mockImplementation(async () => {
            calls.push("audit");
        });

        const result = await searchIndexersWorkflow("u1", { mediaType: "movie", query: "Arrival" });

        expect(calls).toEqual([
            "validate",
            "select",
            "resolve",
            "execute",
            "normalize",
            "score",
            "persist",
            "audit",
        ]);
        expect(validateMock).toHaveBeenCalledWith({ mediaType: "movie", query: "Arrival" });
        expect(selectMock).toHaveBeenCalledWith("u1", request);
        expect(resolveMock).toHaveBeenCalledWith(selectedSources);
        expect(executeMock).toHaveBeenCalledWith(request, resolvedSources);
        expect(normalizeMock).toHaveBeenCalledWith(rawExecutions);
        expect(scoreMock).toHaveBeenCalledWith(request, normalizedExecutions);
        expect(persistMock).toHaveBeenCalledWith("u1", request, scoredExecutions);
        expect(auditMock).toHaveBeenCalledWith("u1", request, persisted, scoredExecutions);
        expect(result).toBe(persisted);
    });
});
