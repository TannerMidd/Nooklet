import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", () => ({
  scanMediaLibraryInputSchema: { safeParse: vi.fn() },
  validateScanMediaLibraryRequest: vi.fn(),
}));
vi.mock("./source-validation", () => ({
  validateScanSources: vi.fn(),
}));
vi.mock("./source-fetch", () => ({
  fetchLibrarySourceFiles: vi.fn(),
}));
vi.mock("./normalization", () => ({
  normalizeLibraryFiles: vi.fn(),
}));
vi.mock("./merge-deduplication", () => ({
  mergeLibraryScanFiles: vi.fn(),
}));
vi.mock("./scan-metadata-persistence", () => ({
  persistLibraryScanMetadata: vi.fn(),
}));
vi.mock("./audit", () => ({
  recordLibraryScanAudit: vi.fn(),
}));

import { recordLibraryScanAudit } from "./audit";
import { mergeLibraryScanFiles } from "./merge-deduplication";
import { normalizeLibraryFiles } from "./normalization";
import { validateScanMediaLibraryRequest } from "./request-validation";
import { persistLibraryScanMetadata } from "./scan-metadata-persistence";
import { fetchLibrarySourceFiles } from "./source-fetch";
import { validateScanSources } from "./source-validation";
import { scanMediaLibraryWorkflow } from "./index";

const validateRequestMock = vi.mocked(validateScanMediaLibraryRequest);
const validateSourcesMock = vi.mocked(validateScanSources);
const fetchSourcesMock = vi.mocked(fetchLibrarySourceFiles);
const normalizeMock = vi.mocked(normalizeLibraryFiles);
const mergeMock = vi.mocked(mergeLibraryScanFiles);
const persistMock = vi.mocked(persistLibraryScanMetadata);
const auditMock = vi.mocked(recordLibraryScanAudit);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scanMediaLibraryWorkflow", () => {
  it("calls phases in order and returns persisted scan metadata", async () => {
    const calls: string[] = [];
    const request = {};
    const validated = { request, sources: [] };
    const fetched = { sources: [], files: [], failedPaths: [] };
    const normalized = { sources: [], files: [], failedPaths: [] };
    const merged = { discoveredFileCount: 0, matchedTitleCount: 0, failedPaths: [], pathStats: [], sources: [] };
    const persisted = { discoveredFileCount: 0, matchedTitleCount: 0, failedPathCount: 0, scanRunIds: [] };

    validateRequestMock.mockImplementation(() => {
      calls.push("validate-request");
      return request;
    });
    validateSourcesMock.mockImplementation(async () => {
      calls.push("validate-sources");
      return validated as never;
    });
    fetchSourcesMock.mockImplementation(async () => {
      calls.push("fetch");
      return fetched;
    });
    normalizeMock.mockImplementation(() => {
      calls.push("normalize");
      return normalized;
    });
    mergeMock.mockImplementation(async () => {
      calls.push("merge");
      return merged;
    });
    persistMock.mockImplementation(async () => {
      calls.push("persist");
      return persisted;
    });
    auditMock.mockImplementation(async () => {
      calls.push("audit");
    });

    const result = await scanMediaLibraryWorkflow("user1", request);

    expect(calls).toEqual(["validate-request", "validate-sources", "fetch", "normalize", "merge", "persist", "audit"]);
    expect(validateSourcesMock).toHaveBeenCalledWith("user1", request);
    expect(fetchSourcesMock).toHaveBeenCalledWith(validated);
    expect(normalizeMock).toHaveBeenCalledWith(fetched);
    expect(mergeMock).toHaveBeenCalledWith("user1", normalized);
    expect(persistMock).toHaveBeenCalledWith("user1", merged);
    expect(auditMock).toHaveBeenCalledWith("user1", persisted);
    expect(result).toBe(persisted);
  });
});
