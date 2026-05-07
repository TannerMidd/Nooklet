import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./audit", () => ({ recordCompletedDownloadImportAudit: vi.fn() }));
vi.mock("./client-resolution", () => ({ resolveImportSabnzbdClient: vi.fn() }));
vi.mock("./destination-resolution", () => ({ resolveCompletedDownloadDestinations: vi.fn() }));
vi.mock("./history-fetch", () => ({ fetchFinishedSabnzbdHistory: vi.fn() }));
vi.mock("./file-inspection", () => ({ inspectCompletedDownloadFiles: vi.fn() }));
vi.mock("./file-organization", () => ({ organizeCompletedDownloadFiles: vi.fn() }));
vi.mock("./request-matching", () => ({ matchFinishedHistoryToDownloads: vi.fn() }));
vi.mock("./persistence", () => ({ persistCompletedDownloadImports: vi.fn() }));
vi.mock("./request-validation", () => ({
  importCompletedDownloadsInputSchema: { safeParse: vi.fn() },
  validateImportCompletedDownloadsRequest: vi.fn(),
}));
vi.mock("./scan-trigger", () => ({ triggerCompletedDownloadDiscovery: vi.fn() }));

import { recordCompletedDownloadImportAudit } from "./audit";
import { resolveImportSabnzbdClient } from "./client-resolution";
import { resolveCompletedDownloadDestinations } from "./destination-resolution";
import { fetchFinishedSabnzbdHistory } from "./history-fetch";
import { inspectCompletedDownloadFiles } from "./file-inspection";
import { organizeCompletedDownloadFiles } from "./file-organization";
import { matchFinishedHistoryToDownloads } from "./request-matching";
import { persistCompletedDownloadImports } from "./persistence";
import { validateImportCompletedDownloadsRequest } from "./request-validation";
import { triggerCompletedDownloadDiscovery } from "./scan-trigger";
import { importCompletedDownloadsWorkflow } from "./index";

const auditMock = vi.mocked(recordCompletedDownloadImportAudit);
const resolveClientMock = vi.mocked(resolveImportSabnzbdClient);
const resolveDestinationsMock = vi.mocked(resolveCompletedDownloadDestinations);
const fetchHistoryMock = vi.mocked(fetchFinishedSabnzbdHistory);
const inspectMock = vi.mocked(inspectCompletedDownloadFiles);
const organizeMock = vi.mocked(organizeCompletedDownloadFiles);
const matchMock = vi.mocked(matchFinishedHistoryToDownloads);
const persistMock = vi.mocked(persistCompletedDownloadImports);
const validateMock = vi.mocked(validateImportCompletedDownloadsRequest);
const scanMock = vi.mocked(triggerCompletedDownloadDiscovery);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importCompletedDownloadsWorkflow", () => {
  it("calls phases in order and returns persisted import results", async () => {
    const calls: string[] = [];
    const request = { historyLimit: 25 };
    const client = { client: { id: "client1" }, baseUrl: "http://localhost:8080", apiKey: "secret" };
    const history = { items: [{ id: "SABnzbd_nzo_1" }] };
    const matches = [{ request: { id: "request1" }, queueItem: { id: "queue1" } }];
    const resolved = [{ kind: "importable" }];
    const inspected = [{ kind: "ready" }];
    const organized = [{ kind: "organized" }];
    const persisted = {
      matchedCount: 1,
      importedCount: 1,
      failedCount: 0,
      importedFileCount: 1,
      affectedLibraryPathIds: ["path1"],
    };
    const discovery = { attempted: true, ok: true, message: null };

    validateMock.mockImplementation(() => {
      calls.push("validate");
      return request;
    });
    resolveClientMock.mockImplementation(async () => {
      calls.push("resolve-client");
      return client as never;
    });
    fetchHistoryMock.mockImplementation(async () => {
      calls.push("fetch-history");
      return history as never;
    });
    matchMock.mockImplementation(async () => {
      calls.push("match");
      return matches as never;
    });
    resolveDestinationsMock.mockImplementation(async () => {
      calls.push("resolve-destinations");
      return resolved as never;
    });
    inspectMock.mockImplementation(async () => {
      calls.push("inspect");
      return inspected as never;
    });
    organizeMock.mockImplementation(async () => {
      calls.push("organize");
      return organized as never;
    });
    persistMock.mockImplementation(async () => {
      calls.push("persist");
      return persisted;
    });
    scanMock.mockImplementation(async () => {
      calls.push("scan");
      return discovery;
    });
    auditMock.mockImplementation(async () => {
      calls.push("audit");
    });

    const result = await importCompletedDownloadsWorkflow("user1", { historyLimit: 25 });

    expect(calls).toEqual([
      "validate",
      "resolve-client",
      "fetch-history",
      "match",
      "resolve-destinations",
      "inspect",
      "organize",
      "persist",
      "scan",
      "audit",
    ]);
    expect(fetchHistoryMock).toHaveBeenCalledWith(client, request);
    expect(matchMock).toHaveBeenCalledWith("user1", client, history);
    expect(resolveDestinationsMock).toHaveBeenCalledWith("user1", matches);
    expect(inspectMock).toHaveBeenCalledWith(resolved);
    expect(organizeMock).toHaveBeenCalledWith(inspected);
    expect(persistMock).toHaveBeenCalledWith("user1", organized);
    expect(scanMock).toHaveBeenCalledWith("user1", persisted);
    expect(auditMock).toHaveBeenCalledWith({ userId: "user1", persisted, discovery });
    expect(result).toEqual({ ...persisted, discovery });
  });
});
